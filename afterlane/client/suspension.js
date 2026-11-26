import { MathUtils } from 'three';

export function buildSuspension() {
  let pitch = 0, roll = 0, pitchSpeed = 0, rollSpeed = 0;
  return {
    reset() { pitch = roll = pitchSpeed = rollSpeed = 0; },
    update(body,dt,acceleration,steering,speed,size,tallVehicle,groundedWheels=false) {
      const pitchTravel = tallVehicle ? .068 : .052;
      const rollTravel = tallVehicle ? .085 : .062;
      const targetPitch = MathUtils.clamp(acceleration/11,-1,1)*pitchTravel;
      const targetRoll = steering*MathUtils.smoothstep(Math.abs(speed),2,31)*rollTravel;
      const stiffness = tallVehicle ? 105 : 155;
      const damping = tallVehicle ? 14 : 18;
      pitchSpeed += ((targetPitch-pitch)*stiffness - pitchSpeed*damping)*dt;
      rollSpeed += ((targetRoll-roll)*stiffness - rollSpeed*damping)*dt;
      pitch += pitchSpeed*dt;
      roll += rollSpeed*dt;
      body.rotation.set(pitch,0,roll);
      // The model's origin is at road level. Keep its loaded corner near the tarmac.
      body.position.y = groundedWheels ? 0 : Math.abs(pitch)*size.length*.31 + Math.abs(roll)*size.width*.43;
    },
  };
}
