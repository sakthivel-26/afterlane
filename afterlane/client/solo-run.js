import { desertStartDistance, desertDuration } from './route.js';

const finite = (value,fallback=0)=>Number.isFinite(value) ? value : fallback;
const clamp = (value,min,max)=>Math.min(max,Math.max(min,value));

export function readSoloRun(saved,maxOffset) {
  if (!saved || !Number.isFinite(saved.distance) || Math.abs(saved.distance)>100_000_000) return null;
  const distance = saved.distance;
  const route = saved.route ?? {};
  const currentRoute = route.desertEntrance===desertStartDistance;
  const exit = currentRoute ? finite(route.desertExit,Infinity) : Infinity;
  return {
    distance,
    offset:clamp(finite(saved.offset,1.84),-maxOffset,maxOffset),
    points:Math.max(0,Math.floor(finite(saved.points))),
    distancePoints:Math.max(0,Math.floor(distance/15),Math.floor(finite(saved.distancePoints))),
    gameTime:Math.max(0,finite(saved.gameTime)),
    view:clamp(Math.floor(finite(saved.view)),0,2),
    headlights:clamp(Math.floor(finite(saved.headlights,1)),0,2),
    flightCharge:clamp(finite(saved.flightCharge,1),0,1),
    route:{
      desertSeconds:currentRoute ? clamp(finite(route.desertSeconds),0,desertDuration) : 0,
      desertEntrance:desertStartDistance,
      desertExit:exit>=desertStartDistance ? exit : Infinity,
    },
  };
}
