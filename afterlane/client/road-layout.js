const bendAmplitude = 26;
const bendScale = 155;
const secondaryAmplitude = 8;
const secondaryScale = 85;

export const roadX = distance => bendAmplitude * Math.sin(distance / bendScale)
  - secondaryAmplitude * Math.sin(distance / secondaryScale);
export const roadYaw = distance => -Math.atan(bendAmplitude / bendScale * Math.cos(distance / bendScale)
  - secondaryAmplitude / secondaryScale * Math.cos(distance / secondaryScale));

export function roadPosition(station,offset,out=null) {
  const heading = roadYaw(station);
  const x = roadX(station)+offset*Math.cos(heading);
  const z = -station-offset*Math.sin(heading);
  if (out) {
    out.x = x;
    out.z = z;
    out.heading = heading;
    return out;
  }
  return {x,z,heading};
}
