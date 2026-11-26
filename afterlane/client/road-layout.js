const bendAmplitude = 26;
const bendScale = 155;
const secondaryAmplitude = 8;
const secondaryScale = 85;

export const roadX = distance => bendAmplitude * Math.sin(distance / bendScale)
  - secondaryAmplitude * Math.sin(distance / secondaryScale);
export const roadYaw = distance => -Math.atan(bendAmplitude / bendScale * Math.cos(distance / bendScale)
  - secondaryAmplitude / secondaryScale * Math.cos(distance / secondaryScale));

export function roadPosition(station,offset) {
  const heading = roadYaw(station);
  return {x:roadX(station)+offset*Math.cos(heading),z:-station-offset*Math.sin(heading),heading};
}
