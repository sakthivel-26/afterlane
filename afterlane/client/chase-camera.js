import { MathUtils } from 'three';

const defaults = {chaseDistance:5.5,chaseHeight:2.7,chaseAngle:0};

export function normalizeChaseControls(settings) {
  for (const [field,value] of Object.entries(defaults)) {
    if (!Number.isFinite(settings[field])) settings[field] = value;
  }
  settings.chaseDistance = MathUtils.clamp(settings.chaseDistance,3.8,12);
  settings.chaseHeight = MathUtils.clamp(settings.chaseHeight,1.35,6.25);
  settings.chaseAngle = MathUtils.clamp(settings.chaseAngle,-60,60);
}

export function chasePose(eye,aim,settings,vehicleHeight,bob,distanceOffset=0) {
  const angle = MathUtils.degToRad(MathUtils.clamp(settings.chaseAngle,-60,60));
  const baseDistance = settings.chaseDistance + Math.max(0,vehicleHeight-1.42)*.65;
  const distance = MathUtils.clamp(baseDistance+distanceOffset,3.1,13.5);
  eye.set(distance*Math.sin(angle),settings.chaseHeight+bob,distance*Math.cos(angle));
  aim.set(0,vehicleHeight*.67,-2.6*Math.max(0,Math.cos(angle))**2);
}

export function bindChaseOrbit(viewport,tools,settings,save) {
  const pointers = new Map();
  let active = false;
  const pinchGap = () => {
    const [a,b] = pointers.values();
    return a && b ? Math.hypot(a.x-b.x,a.y-b.y) : 0;
  };
  function adjust(angle,height,distance) {
    settings.chaseAngle += angle;
    settings.chaseHeight += height;
    settings.chaseDistance += distance;
    normalizeChaseControls(settings);
  }
  function reset() {
    Object.assign(settings,defaults);
    save();
  }
  tools.querySelector('button').addEventListener('click',reset);

  viewport.addEventListener('pointerdown',event=>{
    if (!active || event.button!==0 || pointers.size===2) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    viewport.classList.add('orbit-dragging');
  });
  viewport.addEventListener('pointermove',event=>{
    const previous = pointers.get(event.pointerId);
    if (!active || !previous) return;
    const gap = pinchGap();
    const next = {x:event.clientX,y:event.clientY};
    pointers.set(event.pointerId,next);
    if (gap>4) adjust(0,0,settings.chaseDistance*(gap/Math.max(4,pinchGap())-1));
    else if (pointers.size===1) adjust((previous.x-next.x)*.36,(next.y-previous.y)*.016,0);
  });
  function release(event) {
    if (!pointers.delete(event.pointerId) || pointers.size) return;
    viewport.classList.remove('orbit-dragging');
    save();
  }
  for (const event of ['pointerup','pointercancel','lostpointercapture']) viewport.addEventListener(event,release);
  viewport.addEventListener('wheel',event=>{
    if (!active) return;
    event.preventDefault();
    const factor = event.deltaMode===1 ? .16 : event.deltaMode===2 ? .80 : .008;
    adjust(0,0,MathUtils.clamp(event.deltaY*factor,-1.5,1.5));
    save();
  },{passive:false});
  const keyboard = {
    ArrowLeft:[-8,0,0],ArrowRight:[8,0,0],ArrowUp:[0,.22,0],ArrowDown:[0,-.22,0],
    PageUp:[0,0,-.45],PageDown:[0,0,.45],
  };
  viewport.addEventListener('keydown',event=>{
    if (!active || (!keyboard[event.key] && event.key!=='Home')) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key==='Home') reset();
    else {
      adjust(...keyboard[event.key]);
      save();
    }
  });

  return enabled=>{
    active = enabled;
    tools.hidden = !enabled;
    viewport.tabIndex = enabled ? 0 : -1;
    viewport.classList.toggle('orbit-enabled',enabled);
    if (enabled) return;
    for (const id of pointers.keys()) {
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    }
    if (pointers.size) save();
    pointers.clear();
    viewport.classList.remove('orbit-dragging');
  };
}
