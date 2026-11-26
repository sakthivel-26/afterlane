const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

export function gearSpeed(vehicle,gear,rpm=vehicle.engine.redline) {
  const {ratios,reverse,finalDrive,diameter} = vehicle.transmission;
  const ratio = gear<0 ? reverse : ratios[gear-1];
  return Math.PI*diameter*rpm/(60*finalDrive*ratio);
}

export function advanceDrive({speed,gear,rpm},vehicle,{dt,throttle,braking,handbrake=0,wet,limit,automatic,clutch,traction=1},out=null) {
  const redline = vehicle.engine.redline;
  const idle = vehicle.engine.tone === 'diesel' ? 750 : 850;
  const {ratios,reverse} = vehicle.transmission;
  const fraction = slot=>Math.abs(speed)/gearSpeed(vehicle,slot);
  gear = clamp(gear,-1,ratios.length);
  if (automatic) {
    gear = Math.max(1,gear);
    if (gear < ratios.length && fraction(gear) > (throttle>.15 ? .955 : .81)) gear++;
    else if (gear > 1 && fraction(gear-1) < (throttle>.55 ? .76 : .64)) gear--;
  }
  const ratio = gear < 0 ? reverse : ratios[Math.max(0,gear-1)];
  const revLimit = gear === 0 ? Infinity : gearSpeed(vehicle,gear);
  const revs = gear === 0 ? idle+throttle*redline*.46 : clamp(Math.abs(speed)/revLimit*redline,idle,redline);
  rpm += (revs-rpm)*(1-Math.exp(-dt*9));
  const direction = Math.sign(gear);
  const torque = .76 + .24 * Math.sin(Math.PI * Math.min(1,rpm/redline));
  const governor = clamp((1-Math.abs(speed)/revLimit)/.025,0,1);
  const buildup = .85-.21*Math.min(1,Math.abs(speed)/limit);
  const engine = throttle*direction*vehicle.acceleration*buildup*torque*(.81+.19*ratio/ratios[0])*governor*clutch;
  const drag = .33 + Math.abs(speed)*.016 + (gear === 0 ? 0 : ratio*.055);
  const brakeForce = Math.max(braking*1.82,handbrake*(Math.abs(speed)<10 ? 1.61 : 1.40));
  const resistance = drag+brakeForce*vehicle.brake*(1-wet*.17)*traction;
  speed = Math.sign(speed)*Math.max(0,Math.abs(speed)-resistance*dt);
  if (!brakeForce && Math.abs(speed)<revLimit) speed += direction*Math.min(Math.abs(engine*dt),revLimit-Math.abs(speed));
  const nextSpeed = clamp(speed,-5,limit);
  if (out) {
    out.speed = nextSpeed;
    out.gear = gear;
    out.rpm = rpm;
    return out;
  }
  return {speed:nextSpeed,gear,rpm};
}

const smoothstep = (x,edge0,edge1) => {
  const t = clamp((x-edge0)/(edge1-edge0),0,1);
  return t*t*(3-2*t);
};

export function steeringRate(speed,grip,wet,sensitivity,traction=1) {
  return Math.sign(speed)*Math.min(Math.abs(speed)*.40,6.8)*grip*(1-wet*.075)*sensitivity/100*traction;
}

export function advanceSteering({yaw,yawRate,lateralSpeed},target,{dt,speed,grip,wet,sensitivity,traction=1,handbrake=0},out=null) {
  const absSpeed = Math.abs(speed);
  if (absSpeed < .1) {
    if (out) {
      out.yaw = 0; out.yawRate = 0; out.lateralSpeed = 0; out.steerAngle = 0;
      return out;
    }
    return {yaw:0,yawRate:0,lateralSpeed:0,steerAngle:0};
  }
  const reverseSign = speed < -.2 ? -1 : 1;
  const speedFactor = smoothstep(absSpeed,.4,13);
  const highSpeedScale = 1/(1+absSpeed*.013);
  const steerAuthority = (sensitivity/100)*grip*traction;
  const maxYaw = .30*highSpeedScale;
  const active = Math.abs(target) > .02;
  if (active) {
    const targetYawRate = -target*reverseSign*1.15*speedFactor*highSpeedScale*steerAuthority;
    const turnGain = Math.sign(targetYawRate) !== Math.sign(yawRate) ? 24 : 16;
    yawRate += (targetYawRate-yawRate)*(1-Math.exp(-dt*turnGain));
    yaw = clamp(yaw+yawRate*dt,-maxYaw,maxYaw);
  } else {
    yawRate *= Math.exp(-dt*24);
    yaw *= Math.exp(-dt*(5.5*speedFactor+1.5));
  }
  const desiredLateral = -speed*Math.sin(yaw);
  const lateralGrip = 26*grip*traction*(1-wet*.22)*(handbrake ? .45 : 1);
  lateralSpeed += (desiredLateral-lateralSpeed)*(1-Math.exp(-dt*lateralGrip));
  if (out) {
    out.yaw = yaw;
    out.yawRate = yawRate;
    out.lateralSpeed = lateralSpeed;
    out.steerAngle = highSpeedScale;
    return out;
  }
  return {yaw,yawRate,lateralSpeed,steerAngle:highSpeedScale};
}
