export const segmentLength = 18;
export const desertStartDistance = 15_000;
export const desertDuration = 180;
export const junctionSpacing = 5_000;

export function nearestJunction(distance) {
  const station = Math.round(distance/junctionSpacing)*junctionSpacing;
  return station > 0 ? station : Infinity;
}

const early = [
  {until:540,kind:'shops',name:'City',lit:true,ambient:.88},
  {until:720,kind:'shops',name:'City',lit:false,ambient:.17},
  {until:1044,kind:'homes',name:'City',lit:true,ambient:.53},
  {until:1242,kind:'homes',name:'City',lit:false,ambient:.12},
  {until:2106,kind:'forest',name:'Cedar Woods',lit:false,ambient:0}
];
const bridge = {kind:'bridge',name:'North Channel Bridge',lit:false,ambient:.24};
const village = {kind:'village',name:'Brookfield Village',lit:true,ambient:.47};
const corn = {kind:'corn',name:'Corn Fields',lit:false,ambient:.25};
const rice = {kind:'rice',name:'Rice Paddies',lit:false,ambient:.28};
const forest = early.at(-1);
const town = early[0];
const desert = {kind:'desert',name:'Red Basin Desert',lit:false,ambient:.16};
const ice = {kind:'ice',name:'Frostwood',lit:false,ambient:.30};

const bridgeEntrance = early.at(-1).until;
const firstBridgeExit = bridgeEntrance+216;
const countryside = [
  [468,village],[936,corn],[1368,rice],[1980,forest],[2196,bridge],
  [2790,village],[3312,town],[3780,rice],[4320,corn]
];
const loop = countryside.at(-1)[0];

export function districtAt(distance,progress={}) {
  if (distance>=desertStartDistance) return distance<(progress.desertExit ?? Infinity) ? desert : ice;
  if (distance<bridgeEntrance) return early.find(district=>distance<district.until);
  if (distance<firstBridgeExit) return bridge;
  const phase = (distance-firstBridgeExit)%loop;
  return countryside.find(([end])=>phase<end)[1];
}

export function districtLight(distance,progress) {
  return (districtAt(distance-36,progress).ambient+2*districtAt(distance,progress).ambient+
    districtAt(distance+36,progress).ambient)/4;
}

export function newRouteProgress() {
  return {desertEntrance:desertStartDistance,desertSeconds:0,desertExit:Infinity};
}

export function advanceRoute(progress,distance,speed,dt,furthest=distance) {
  if (speed<=1 || distance<desertStartDistance || Number.isFinite(progress.desertExit)) return;
  progress.desertSeconds=Math.min(desertDuration,progress.desertSeconds+dt);
  if (progress.desertSeconds>=desertDuration) {
    progress.desertExit=Math.ceil((furthest+270)/segmentLength)*segmentLength;
  }
}

const smooth = value => {
  const t = Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
};

export function weatherAt(seconds,setting='Clear Day') {
  if (setting!=='Dynamic') {
    if (setting==='Clear Day' || setting==='Clear') return {weather:'Clear',daylight:1};
    if (setting==='Clear Night') return {weather:'Clear',daylight:0};
    if (setting==='Rainy Night') return {weather:'Heavy rain',daylight:0};
    if (setting==='Light rain') return {weather:'Light rain',daylight:.48};
    if (setting==='Heavy rain') return {weather:'Heavy rain',daylight:.26};
    if (setting==='Thunderstorm') return {weather:'Thunderstorm',daylight:.14};
    return {weather:setting,daylight:1};
  }
  const time = (seconds+145)%360;
  const daylight = smooth((time-92)/38)*(1-smooth((time-306)/43));
  const weather = time<41 || (time>=183 && time<226) ? 'Light rain' :
    time>=287 && time<316 ? 'Heavy rain' : time>=316 && time<337 ? 'Thunderstorm' : 'Clear';
  return {weather,daylight};
}
