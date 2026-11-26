import { MathUtils } from 'three';

const wheelTravel = MathUtils.degToRad(116);
const tau = Math.PI*2;

export function bindTouchWheel(wheel) {
  let gesture, angle = 0;

  function reset() {
    const id = gesture?.id;
    gesture = null;
    angle = 0;
    wheel.removeAttribute('data-held');
    if (id!==undefined && wheel.hasPointerCapture(id)) wheel.releasePointerCapture(id);
  }

  wheel.addEventListener('pointerdown',event=>{
    if (gesture || event.button!==0) return;
    event.preventDefault();
    const box = wheel.getBoundingClientRect();
    const x = box.left+box.width/2, y = box.top+box.height/2;
    const dx = event.clientX-x, dy = event.clientY-y;
    const hub = Math.hypot(dx,dy)<box.width*.16;
    gesture = {id:event.pointerId,x,y,hub,width:box.width,startX:event.clientX,previous:Math.atan2(dx,-dy)};
    wheel.setPointerCapture(event.pointerId);
    wheel.setAttribute('data-held','');
  });
  wheel.addEventListener('pointermove',event=>{
    if (event.pointerId!==gesture?.id) return;
    if (gesture.hub) {
      angle = MathUtils.clamp((event.clientX-gesture.startX)/(gesture.width*.45),-1,1)*wheelTravel;
      return;
    }
    const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
    if (Math.hypot(dx,dy)<gesture.width*.12) return;
    const next = Math.atan2(dx,-dy);
    const delta = MathUtils.euclideanModulo(next-gesture.previous+Math.PI,tau)-Math.PI;
    angle = MathUtils.clamp(angle+delta,-wheelTravel,wheelTravel);
    gesture.previous = next;
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    wheel.addEventListener(type,event=>{ if (event.pointerId===gesture?.id) reset(); });
  }
  return {
    get input() { return gesture ? angle/wheelTravel : null; },
    reset,
    render(steering) {
      const degrees = Math.round(steering*116);
      const turn = `${degrees}deg`;
      if (wheel.style.getPropertyValue('--wheel-turn')!==turn) wheel.style.setProperty('--wheel-turn',turn);
      const percent = String(Math.round(steering*100));
      if (wheel.getAttribute('aria-valuenow')!==percent) wheel.setAttribute('aria-valuenow',percent);
    },
  };
}

const top = .19, center = .5, bottom = .81;
const neutralBand = .115;
const gearLabel = gear=>gear===0 ? 'N' : gear===-1 ? 'R' : String(gear);

export function gearGate(forwardGears) {
  const count = Math.floor(forwardGears/2)+1;
  const columns = Array.from({length:count},(_,index)=>({
    x:(index+.5)/count,
    up:index*2+1<=forwardGears ? index*2+1 : null,
    down:index===count-1 ? -1 : index*2+2<=forwardGears ? index*2+2 : null,
  }));
  const slots = new Map([[0,{x:center,y:center}]]);
  for (const column of columns) {
    if (column.up!==null) slots.set(column.up,{x:column.x,y:top});
    if (column.down!==null) slots.set(column.down,{x:column.x,y:bottom});
  }
  return {columns,slots};
}

export function moveGearGate(layout,drag,x,y) {
  const crossesNeutral = (drag.lastY-center)*(y-center)<=0;
  drag.lastY = y;
  const {columns} = layout;
  const inNeutral = Math.abs(y-center)<=neutralBand;
  if (inNeutral || crossesNeutral) drag.column = MathUtils.clamp(Math.floor(x*columns.length),0,columns.length-1);
  const column = columns[drag.column];
  if (inNeutral) {
    return {x:MathUtils.clamp(x,columns[0].x,columns.at(-1).x),y:center,gear:0};
  }
  const candidate = y<center ? column.up : column.down;
  if (candidate===null) return {x:column.x,y:center,gear:0};
  const end = y<center ? top : bottom;
  const position = MathUtils.clamp(y,Math.min(end,center),Math.max(end,center));
  return {x:column.x,y:position,gear:Math.abs(position-end)<=.095 ? candidate : 0};
}

export function bindTouchGear(root,selectGear,toggleMode) {
  const panel = root.querySelector('#touch-transmission');
  const mode = root.querySelector('#touch-gear');
  const value = root.querySelector('#touch-gear-value');
  const modeLabel = root.querySelector('#touch-gear-mode');
  const gate = root.querySelector('#touch-gate');
  const slots = root.querySelector('#touch-gate-slots');
  const knob = root.querySelector('#touch-shift-knob');
  const notice = root.querySelector('#touch-shift-message');
  let layout, count, gear = 1, automatic = true, drag, messageTimer;

  function place(element,{x,y}) {
    const left = `${x*100}%`, top = `${y*100}%`;
    if (element.style.getPropertyValue('--gate-x')!==left) element.style.setProperty('--gate-x',left);
    if (element.style.getPropertyValue('--gate-y')!==top) element.style.setProperty('--gate-y',top);
  }
  function reset() {
    const id = drag?.id;
    drag = null;
    knob.removeAttribute('data-held');
    if (id!==undefined && knob.hasPointerCapture(id)) knob.releasePointerCapture(id);
  }
  function choose(requested) {
    if (selectGear(requested)) return;
    notice.textContent = 'Slow down to change direction';
    clearTimeout(messageTimer);
    messageTimer = setTimeout(()=>{notice.textContent='';},1900);
  }

  function rebuild(forwardGears) {
    reset();
    count = forwardGears;
    layout = gearGate(count);
    slots.replaceChildren();
    gate.style.setProperty('--gate-inset',`${layout.columns[0].x*100}%`);
    for (const column of layout.columns) {
      const slot = document.createElement('span');
      slot.className = 'touch-gate-track';
      slot.style.setProperty('--gate-x',`${column.x*100}%`);
      slot.style.setProperty('--track-top',`${(column.up===null ? center : top)*100}%`);
      slot.style.setProperty('--track-bottom',`${(1-(column.down===null ? center : bottom))*100}%`);
      slot.setAttribute('aria-hidden','true');
      slots.append(slot);
    }
    for (const [number,position] of layout.slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'touch-gear-slot';
      button.dataset.gear = number;
      button.textContent = gearLabel(number);
      button.setAttribute('aria-label',number===0 ? 'Neutral' : number===-1 ? 'Reverse' : `Gear ${number}`);
      button.addEventListener('click',()=>choose(number));
      place(button,position);
      slots.append(button);
    }
  }

  mode.addEventListener('click',toggleMode);
  knob.addEventListener('pointerdown',event=>{
    if (!layout || automatic || drag || event.button!==0) return;
    event.preventDefault();
    const origin = layout.slots.get(gear) ?? layout.slots.get(0);
    const bounds = gate.getBoundingClientRect();
    drag = {id:event.pointerId,bounds,origin,startX:event.clientX,startY:event.clientY,lastY:origin.y,
      column:Math.floor(origin.x*layout.columns.length),originalGear:gear,point:{...origin,gear}};
    knob.setPointerCapture(event.pointerId);
    knob.setAttribute('data-held','');
  });
  knob.addEventListener('pointermove',event=>{
    if (event.pointerId!==drag?.id) return;
    const x = drag.origin.x+(event.clientX-drag.startX)/drag.bounds.width;
    const y = drag.origin.y+(event.clientY-drag.startY)/drag.bounds.height;
    drag.point = moveGearGate(layout,drag,x,y);
    if (drag.originalGear!==0 && drag.point.gear!==drag.originalGear) {
      selectGear(0);
      drag.originalGear=0;
    }
    place(knob,drag.point);
    knob.dataset.label = gearLabel(drag.point.gear);
  });
  knob.addEventListener('pointerup',event=>{
    if (event.pointerId!==drag?.id) return;
    const requested = drag.point.gear;
    reset();
    choose(requested);
  });
  for (const type of ['pointercancel','lostpointercapture']) {
    knob.addEventListener(type,event=>{ if (event.pointerId===drag?.id) reset(); });
  }

  return {
    reset,
    render(current,auto,forwardGears) {
      const changed = count!==forwardGears || gear!==current || automatic!==auto;
      if (count!==forwardGears) rebuild(forwardGears);
      if (auto && !automatic) reset();
      gear=current;
      automatic=auto;
      if (changed) {
        panel.toggleAttribute('data-auto',auto);
        value.textContent=auto && gear>0 ? 'D'+gear : gearLabel(gear);
        modeLabel.textContent=auto ? 'Auto' : 'Manual';
        mode.setAttribute('aria-label',auto ? 'Automatic transmission. Switch to manual.' : 'Manual transmission. Switch to automatic.');
        for (const button of slots.querySelectorAll('button')) {
          button.disabled=auto;
          button.setAttribute('aria-pressed',String(Number(button.dataset.gear)===gear));
        }
      }
      if (!drag) {
        place(knob,layout.slots.get(gear) ?? layout.slots.get(0));
        if (knob.dataset.label!==gearLabel(gear)) knob.dataset.label=gearLabel(gear);
      }
    },
  };
}
