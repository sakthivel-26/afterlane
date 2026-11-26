import { roadPosition } from './road-layout.js';

// Coordinates are metres along and across the road. Sweep both footprints along
// the straight paths between simulation samples to catch contact between frames.
export function contactTime(dz0,dx0,dz1,dx1,halfLength,halfWidth) {
  let enter = 0, leave = 1;
  for (const [start,end,extent] of [[dz0,dz1,halfLength],[dx0,dx1,halfWidth]]) {
    const delta = end-start;
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) >= extent) return null;
      continue;
    }
    const a = (-extent-start)/delta, b = (extent-start)/delta;
    enter = Math.max(enter,Math.min(a,b));
    leave = Math.min(leave,Math.max(a,b));
    if (enter >= leave) return null;
  }
  return enter;
}

// Sweep the two visible silhouettes through the frame in world space.
export function footprintContact(first,second,from,to,yawA,yawB) {
  const reach = first.radius+second.radius;
  if (contactTime(from.z,from.x,to.z,to.x,reach,reach) === null) return null;

  const rotate = ({points},yaw) => {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return points.map(([x,z])=>[x*cos+z*sin,z*cos-x*sin]);
  };
  const a = rotate(first,yawA), b = rotate(second,yawB);
  let enter = 0, leave = 1;
  for (const points of [a,b]) {
    for (let i=0;i<points.length;i++) {
      const [x,z] = points[i], [nextX,nextZ] = points[(i+1)%points.length];
      const axisX = nextZ-z, axisZ = x-nextX;
      const projection = ([px,pz])=>axisX*px+axisZ*pz;
      const projectedA = a.map(projection), projectedB = b.map(projection);
      const low = Math.min(...projectedA)-Math.max(...projectedB);
      const high = Math.max(...projectedA)-Math.min(...projectedB);
      const start = axisX*from.x+axisZ*from.z;
      const delta = axisX*(to.x-from.x)+axisZ*(to.z-from.z);
      if (Math.abs(delta)<1e-8) {
        if (start<low || start>high) return null;
        continue;
      }
      const t0 = (low-start)/delta, t1 = (high-start)/delta;
      enter = Math.max(enter,Math.min(t0,t1));
      leave = Math.min(leave,Math.max(t0,t1));
      if (enter>leave) return null;
    }
  }
  return enter;
}

function sharesLane(car,other) {
  return car.lane === other.lane || car.target === other.lane ||
    car.lane === other.target || car.target === other.target;
}

export function canChangeLane(car,lane,fleet) {
  return fleet.every(other => {
    if (other === car || (other.lane !== lane && other.target !== lane && other.lane+other.signal !== lane)) return true;
    const gap = other.station-car.station;
    const distance = (car.length+other.length)/2 + 3;
    const closing = gap >= 0 ? car.pace-other.pace : other.pace-car.pace;
    return Math.abs(gap) > distance + Math.max(0,closing)*1.25;
  });
}

export const trafficLanes = [-5.52,-1.84,1.84,5.52];
export const laneSignalLead = 1.6;

export function playerTurn(steering,speed,lateralSpeed=null) {
  if (lateralSpeed !== null) {
    const absSpeed = Math.abs(speed);
    if (absSpeed < .2) return 0;
    const angle = Math.atan2(steering*lateralSpeed,Math.max(16,absSpeed));
    return Math.max(-.095,Math.min(.095,-angle*.58));
  }
  return -.095*steering*Math.max(-1,Math.min(1,speed/9));
}

export function trafficTurn(car) {
  return -(trafficLanes[car.target]-car.offset)*.04;
}

const tightFootprints = new WeakMap();
function tightFootprint(fp) {
  let cached = tightFootprints.get(fp);
  if (cached) return cached;
  const points = fp.points.map(([x, z]) => [x * .82, z * .84]);
  cached = { points, radius: fp.radius * .84 };
  tightFootprints.set(fp, cached);
  return cached;
}

export function trafficContact(player,previous,playerFootprint,turn,car,footprint) {
  const playerHull = tightFootprint(playerFootprint);
  const npcHull = tightFootprint(footprint);
  const gap = car.station-player.distance;
  const previousGap = car.previousStation-previous.distance;
  const reach = playerHull.radius+npcHull.radius+2;
  if (Math.min(gap,previousGap)>reach || Math.max(gap,previousGap)<-reach) return null;

  const currentPlayer = roadPosition(player.distance,player.x);
  const previousPlayer = roadPosition(previous.distance,previous.x);
  const npc = roadPosition(car.station,car.offset);
  const previousNpc = roadPosition(car.previousStation,car.previousOffset);
  return footprintContact(playerHull,npcHull,
    {x:previousNpc.x-previousPlayer.x,z:previousNpc.z-previousPlayer.z},
    {x:npc.x-currentPlayer.x,z:npc.z-currentPlayer.z},
    currentPlayer.heading+turn,npc.heading+trafficTurn(car));
}

export function signalLaneChange(car, dt, preferredLane, fleet, drivers) {
  if (car.signal) car.signalAge += dt;
  if (car.lane !== car.target) return;
  const safe = lane=>canChangeLane(car,lane,fleet) && drivers.every(driver=>{
    if (Math.abs(driver.offset-trafficLanes[lane])>2) return true;
    const gap = driver.station-car.station;
    const closing = gap >= 0 ? car.speed-driver.speed : driver.speed-car.speed;
    return Math.abs(gap)>18+Math.max(0,closing)*2.6;
  });
  if (car.signal) {
    if (car.signalAge<laneSignalLead) return;
    const lane = car.lane+car.signal;
    if (safe(lane)) car.target=lane;
    else car.signal=0;
    return;
  }
  if (preferredLane!==car.lane && safe(preferredLane)) {
    car.signal=Math.sign(preferredLane-car.lane);
    car.signalAge=0;
  }
}

export function settleLaneChange(car) {
  if (car.lane===car.target || Math.abs(car.offset-trafficLanes[car.target])>=.12) return;
  car.lane=car.target;
  car.signal=0;
}

export function moveTraffic(fleet,dt) {
  // Front-to-back order lets a follower limit travel against the leader's
  // already updated rear bumper, including trucks that occupy more road.
  const ordered = [...fleet].sort((a,b)=>b.station-a.station);
  for (const [index,car] of ordered.entries()) {
    car.previousStation = car.station;
    let advance = car.pace*dt;
    for (let i=0;i<index;i++) {
      const leader = ordered[i];
      if (!sharesLane(car,leader)) continue;
      const free = leader.station-car.station-(car.length+leader.length)/2;
      advance = Math.min(advance,Math.max(0,free-3));
    }
    car.station += advance;
    car.speed = dt ? advance/dt : car.speed ?? car.pace;
  }
}
