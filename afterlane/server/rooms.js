import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { Group } from 'three';
import { dimensions, trafficSpecs, vehicles } from '../client/vehicle-specs.js';
import { moveTraffic, playerTurn, settleLaneChange, signalLaneChange, trafficContact, trafficLanes as lanes, trafficTurn } from '../client/collision.js';
import { advanceRoute, newRouteProgress } from '../client/route.js';
import { vehicleBody } from '../client/traffic.js';

const modes = { distance:'Distance Race', score:'Score Attack' };
const trafficSizes = trafficSpecs.map(([type,,style]) => dimensions(type,style));
const raceLength = 5000;
const scoreDuration = 180;
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

function createWorld(seed) {
  return Array.from({length:120},(_,i) => {
    const id = i+1;
    const type = i%trafficSpecs.length;
    const {length} = trafficSizes[type];
    const pace = 14+((Math.imul(id,2654435761)^seed)>>>0)%140/10-(length>6 ? 4 : 0);
    const lane = (i+seed)%4;
    const station = 38+i*53+seed%31;
    return {id,type,length,pace,speed:pace,lane,target:lane,station,previousStation:station,
      offset:lanes[lane],previousOffset:lanes[lane],signal:0,signalAge:0,nextChange:7+(id+seed)%21};
  });
}

function stepWorld(npcs,seconds,dt,drivers) {
  for (const npc of npcs) {
    let next = npc.lane;
    if (seconds>=npc.nextChange) {
      const direction = (npc.id + Math.floor(seconds))%2 ? 1 : -1;
      next = clamp(npc.lane+direction,0,lanes.length-1);
      npc.nextChange = seconds+7+npc.id%12;
    }
    signalLaneChange(npc,dt,next,npcs,drivers);
  }
  moveTraffic(npcs,dt);
  for (const npc of npcs) {
    npc.previousOffset = npc.offset;
    npc.offset += (lanes[npc.target]-npc.offset)*(1-Math.exp(-dt*1.25));
    settleLaneChange(npc);
  }
}

export function attachRooms(server,modelFootprints) {
  const footprint = (asset,type,color,style) => modelFootprints.get(asset) ??
    vehicleBody(new Group(),type,color,style).footprint;
  const playerFootprints = vehicles.map(spec=>spec && footprint(spec.asset,spec.type,spec.color,spec.style));
  const trafficFootprints = trafficSpecs.map(([type,color,style,asset])=>footprint(asset,type,color,style));
  const io = new Server(server,{maxHttpBufferSize:8192});
  const rooms = new Map();
  io.on('connection',socket => {
    let room;
    const leave = () => {
      if (!room) return;
      room.players.delete(socket.id);
      socket.leave(room.code);
      if (!room.players.size) rooms.delete(room.code);
      else if (room.host === socket.id) room.host = room.players.keys().next().value;
      room = null;
    };
    socket.on('leave-room',leave);
    socket.on('disconnect',leave);
    socket.on('join-room',(request,ack) => {
      if (typeof ack !== 'function') return;
      if (!request || typeof request !== 'object' || Array.isArray(request) ||
        [request.name,request.code,request.color].some(field=>field!=null && typeof field!=='string')) {
        return ack({error:'Invalid room details.'});
      }
      const name = request.name?.trim().slice(0,20) || 'Driver';
      const requested = request.code?.trim().toUpperCase();
      const index = Number.isInteger(request.vehicle) && vehicles[request.vehicle] ? request.vehicle : 0;
      let target;
      if (requested) {
        target = rooms.get(requested);
        if (!target || target.started || target.players.size >= 8 || target === room) return ack({error:'Room is unavailable.'});
      } else {
        let code;
        do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
        target = {code, mode:request.mode === 'score' ? 'score' : 'distance', host:socket.id,
          players:new Map(),elapsed:0,route:newRouteProgress(),npcs:createWorld(randomBytes(4).readUInt32LE())};
        rooms.set(code,target);
      }
      leave();
      room = target;
      const color = /^#[0-9a-f]{6}$/i.test(request.color ?? '') ? request.color : '#628e99';
      room.players.set(socket.id,{name,vehicle:index,color,distance:0,x:1.84,speed:0,steering:0,headlights:true,signal:0,score:0,furthest:0,passed:new Set(),near:new Set(),last:Date.now(),respawn:0});
      socket.join(room.code);
      ack({code:room.code});
    });
    socket.on('start-room',() => {
      if (!room || room.started || room.host !== socket.id) return;
      room.started = Date.now()+2700;
      for (const player of room.players.values()) player.last = room.started;
    });
    socket.on('drive',state => {
      if (!room?.started || room.winner || !state || typeof state !== 'object') return;
      const now = Date.now();
      const p = room.players.get(socket.id);
      if (now < room.started || now < p.respawn || now-p.last < 32) return;
      const {distance,x,speed,steering} = state;
      if (![distance,x,speed,steering].every(Number.isFinite)) return;
      const dt = Math.min(.45,(now-p.last)/1000);
      const max = (vehicles[p.vehicle].manualSpeed ?? vehicles[p.vehicle].speed)/3.6;
      if (Math.abs(speed)>max+.6 || Math.abs(distance-p.distance)>max*dt+2.5 ||
        Math.abs(x-p.x)>12*dt+.75 || Math.abs(x)>7.3 || distance < -25) {
        socket.emit('correct-drive',{distance:p.distance,x:p.x,speed:p.speed});
        return;
      }
      const previous = {distance:p.distance,x:p.x};
      p.last = now;
      p.distance = distance;
      p.x = x;
      p.speed = speed;
      p.steering = clamp(steering,-1,1);
      p.headlights = state.headlights !== false;
      p.signal = state.signal === 1 || state.signal === -1 ? state.signal : 0;
      if (Math.floor(distance/15)>p.furthest) {
        p.score += Math.floor(distance/15)-p.furthest;
        p.furthest = Math.floor(distance/15);
      }
      const playerFootprint = playerFootprints[p.vehicle];
      const turn = playerTurn(p.steering,p.speed);
      for (const npc of room.npcs) {
        const gap = npc.station-distance, side = Math.abs(npc.offset-x);
        const npcFootprint = trafficFootprints[npc.type];
        const length = (playerFootprint.length+npcFootprint.length)/2;
        const width = (playerFootprint.width+npcFootprint.width)/2;
        const impact = trafficContact(p,previous,playerFootprint,turn,npc,npcFootprint);
        if (impact !== null) {
          p.speed = 0;
          p.score = Math.max(0,p.score-25);
          p.distance = Math.max(0,p.distance-14);
          p.x = Math.abs(p.x)<3 ? (p.x < 0 ? -5.52 : 5.52) : (p.x < 0 ? -1.84 : 1.84);
          p.respawn = now+1700;
          socket.emit('room-crash',{distance:p.distance,x:p.x,speed:0,until:p.respawn});
          break;
        }
        if (p.passed.has(npc.id) || speed <= npc.speed+1) continue;
        if (Math.abs(gap)<length+1 && side>=width && side-width<=2.05) p.near.add(npc.id);
        if (gap < -length && gap > -length-7) {
          p.passed.add(npc.id);
          if (p.near.delete(npc.id)) p.score += 10;
        }
      }
      if (room.mode === 'distance' && p.distance >= raceLength) room.winner = socket.id;
    });
  });
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const elapsed = room.started ? Math.max(0,(now-room.started)/1000) : 0;
      const dt = Math.max(0,Math.min(.3,elapsed-room.elapsed));
      if (!room.winner && dt>0) {
        let furthest = 0, movingDriver = null;
        for (const player of room.players.values()) {
          furthest = Math.max(furthest,player.distance);
          if (now-player.last<500 && now>=player.respawn && player.speed>1 &&
              (!movingDriver || player.distance>movingDriver.distance)) movingDriver=player;
        }
        if (movingDriver) advanceRoute(room.route,movingDriver.distance,movingDriver.speed,dt,furthest);
      }
      const drivers = [...room.players.values()].filter(player=>now>=player.respawn && now-player.last<1000)
        .map(player=>({station:player.distance,offset:player.x,speed:player.speed}));
      stepWorld(room.npcs,elapsed,dt,drivers);
      room.elapsed = elapsed;
      const ranked = [...room.players.entries()].sort((a,b) =>
        room.mode === 'score' ? b[1].score-a[1].score || b[1].distance-a[1].distance : b[1].distance-a[1].distance);
      if (!room.winner && room.mode === 'score' && elapsed >= scoreDuration) room.winner = ranked[0]?.[0];
      const players = ranked.map(([id,{name,vehicle,color,distance,x,speed,steering,headlights,signal,score}]) =>
        ({id,name,vehicle,color,distance,x,speed,steering,headlights,signal,score}));
      for (const [id,p] of room.players) {
        io.to(id).volatile.emit('room-state',{code:room.code,host:room.host,mode:modes[room.mode],started:room.started || 0,now,elapsed,
          winner:room.winner,route:room.route,players,
          npcs:room.npcs.filter(npc => Math.abs(npc.station-p.distance)<450)
            .map(npc=>({id:npc.id,station:npc.station,offset:npc.offset,type:npc.type,speed:npc.speed,
              signal:npc.signal,signalAge:npc.signalAge,turn:trafficTurn(npc)}))});
      }
    }
  },100).unref();
  return io;
}
