import { AdditiveBlending, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial } from 'three';

export const trafficClearance = 4.2;
const flightSeconds = 24;
const rechargeSeconds = 12;
const rollSeconds = .64;

export function createFlight(charge=1) {
  return {height:0,target:0,velocity:0,active:false,charge,rollDirection:0,rollTime:0};
}

export function toggleFlight(flight) {
  if (!flight.active && (flight.charge<1 || flight.height>0)) return;
  flight.active = !flight.active;
  flight.target = flight.active ? Math.max(flight.height,9) : 0;
}

export function startFlightRoll(flight,direction) {
  if (!flight.active || flight.height<trafficClearance || flight.rollDirection) return;
  flight.rollDirection = direction;
  flight.rollTime = 0;
}

export function flightRollAngle(flight) {
  return flight.rollDirection*Math.PI*2*MathUtils.smootherstep(flight.rollTime,0,rollSeconds);
}

export function advanceFlight(flight,dt,verticalInput) {
  if (flight.active) {
    flight.charge = Math.max(0,flight.charge-dt/flightSeconds);
    if (flight.charge===0) toggleFlight(flight);
  }
  if (flight.rollDirection) {
    flight.rollTime += dt;
    if (flight.rollTime>=rollSeconds) flight.rollDirection=0;
  }
  if (flight.active && verticalInput) {
    flight.target = MathUtils.clamp(flight.target+verticalInput*10*dt,5,38);
  }
  const error = flight.target-flight.height;
  const desired = MathUtils.clamp(error*2,-7,10);
  flight.velocity = MathUtils.damp(flight.velocity,desired,4.5,dt);
  flight.height = MathUtils.clamp(flight.height+flight.velocity*dt,0,38);
  if (!flight.active && flight.height<.04) {
    flight.height = 0;
    flight.velocity = 0;
    flight.charge = Math.min(1,flight.charge+dt/rechargeSeconds);
  }
}

export function createLiftJets() {
  const jets = new Group();
  const outer = new MeshBasicMaterial({color:0x4abffc,transparent:true,opacity:.16,depthWrite:false,blending:AdditiveBlending});
  const core = new MeshBasicMaterial({color:0xb5f2ff,transparent:true,opacity:.45,depthWrite:false,blending:AdditiveBlending});
  const plume = new ConeGeometry(.24,1.36,12,1,true).rotateZ(Math.PI).translate(0,-.68,0);
  const flame = new ConeGeometry(.105,.95,10,1,true).rotateZ(Math.PI).translate(0,-.475,0);
  for (const x of [-.64,.64]) for (const z of [-1.12,1.16]) {
    const nozzle = new Group();
    nozzle.position.set(x,.13,z);
    nozzle.add(new Mesh(plume,outer),new Mesh(flame,core));
    jets.add(nozzle);
  }
  jets.visible = false;
  return jets;
}
