import * as T from 'three';
import { vehicles } from './vehicle-specs.js';
import { openGarage } from './garage.js';
import { normalizeChaseControls } from './chase-camera.js';

const key = 'afterlane-profile-v2';
const defaults = { balance:0, owned:[0], selected:0, traffic:14, weather:'Clear Day', wipers:'Auto', cabinLight:'On', cigarette:'Off', transmission:'Automatic', steering:'Touch', controllerStyle:'Wheel', steeringSensitivity:115, controllerSize:100, driveSide:'Right-hand drive', quality:'Medium', audio:'On', missionUnlocked:1, missionCompleted:{} };

function storedProfile() {
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    return saved && typeof saved==='object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

export function buildOptions(pause, trafficChanged, garageActions) {
  const settings = {...defaults,...storedProfile()};
  if (!Number.isFinite(settings.balance)) settings.balance=0;
  normalizeChaseControls(settings);
  const normalizeRange = (field,min,max)=>{
    const value = settings[field];
    settings[field] = Number.isFinite(value) ? T.MathUtils.clamp(value,min,max) : defaults[field];
  };
  normalizeRange('steeringSensitivity',65,150);
  normalizeRange('controllerSize',85,115);
  settings.missionUnlocked = Number.isInteger(settings.missionUnlocked) ? T.MathUtils.clamp(settings.missionUnlocked,1,50) : 1;
  if (!settings.missionCompleted || typeof settings.missionCompleted !== 'object' || Array.isArray(settings.missionCompleted)) settings.missionCompleted = {};
  settings.controllerStyle = settings.controllerStyle==='Arrows' ? 'Arrows' : 'Wheel';
  const applyControllerSize = ()=>document.documentElement.style.setProperty('--touch-scale',settings.controllerSize/100);
  applyControllerSize();
  settings.owned = [...new Set([0,...(Array.isArray(settings.owned) ? settings.owned.filter(index=>Number.isInteger(index) && vehicles[index]) : [])])];
  if (!settings.owned.includes(settings.selected)) settings.selected = 0;
  let lastSaved = JSON.parse(JSON.stringify(settings));
  function save() {
    try {
      const latest = storedProfile();
      const changed = {...latest};
      for (const [field,value] of Object.entries(settings)) {
        if (!(field in latest) || JSON.stringify(value)!==JSON.stringify(lastSaved[field])) changed[field]=value;
      }
      if (Number.isFinite(latest.balance)) changed.balance=latest.balance+settings.balance-lastSaved.balance;
      localStorage.setItem(key,JSON.stringify(changed));
      settings.balance=changed.balance;
      lastSaved=JSON.parse(JSON.stringify(settings));
    } catch { /* Current session still works. */ }
  }

  const panel = document.querySelector('#panel');
  const title = document.querySelector('#panel-title');
  const content = document.querySelector('#panel-content');
  const newNode = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function range(label, field, min, max, unit, onChange) {
    const row = newNode('label','','setting');
    const value = newNode('span',label+' · '+settings[field]+unit);
    const slider = newNode('input');
    Object.assign(slider,{type:'range', min, max, value:settings[field]});
    slider.addEventListener('input', () => {
      settings[field] = Number(slider.value);
      value.textContent = label+' · '+settings[field]+unit;
      if (field==='controllerSize') applyControllerSize();
      save();
    });
    if (onChange) slider.addEventListener('change', onChange);
    row.append(value,slider);
    content.append(row);
  }
  function select(label, field, values) {
    const row = newNode('label','','setting');
    const input = newNode('select');
    for (const mode of values) {
      const option = newNode('option',mode);
      option.selected = settings[field] === mode;
      input.append(option);
    }
    input.addEventListener('change', () => {
      settings[field] = input.value;
      if (field === 'steering' && input.value === 'Tilt' && typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        window.DeviceOrientationEvent.requestPermission().catch(() => {});
      }
      save();
    });
    row.append(newNode('span',label),input);
    content.append(row);
  }
  function showController() {
    title.textContent = 'Controller customization';
    content.replaceChildren();
    select('Steering controller','controllerStyle',['Wheel','Arrows']);
    range('Steering sensitivity','steeringSensitivity',65,150,'%');
    range('Button size','controllerSize',85,115,'%');
    select('Steering input','steering',['Touch','Tilt']);
    select('Transmission','transmission',['Automatic','Manual']);
    const back = newNode('button','Back to settings');
    back.type = 'button';
    back.addEventListener('click',showSettings);
    content.append(back);
  }
  function showSettings() {
    panel.dataset.section = 'settings';
    title.textContent = 'Driving settings';
    content.replaceChildren();
    const controls = newNode('button','Controller customization');
    controls.type = 'button';
    controls.addEventListener('click',showController);
    content.append(controls);
    range('Traffic vehicles','traffic',0,24,'',trafficChanged);
    select('Weather','weather',['Clear Day','Dynamic','Clear Night','Light rain','Heavy rain','Thunderstorm']);
    select('Wipers','wipers',['Auto','Fast','Off']);
    select('Cabin light','cabinLight',['On','Off']);
    select('Driver cigarette','cigarette',['Off','On']);
    select('Driving position','driveSide',['Right-hand drive','Left-hand drive']);
    select('Graphics','quality',['Low','Medium','High']);
    select('Audio','audio',['On','Muted']);
  }
  const open = render => {
    pause();
    render();
    panel.showModal();
  };
  const garagePanel = document.querySelector('#garage-panel');
  const missionDialog = document.querySelector('#mission-dialog');
  document.querySelector('#garage').addEventListener('click',openGarage(settings,{...garageActions,pause,save}));
  document.querySelector('#settings').addEventListener('click', () => open(showSettings));
  document.querySelector('#close-panel').addEventListener('click', () => panel.close());
  return {settings,panel, save, openSettings:() => open(showSettings), get modalOpen() { return panel.open||garagePanel.open||Boolean(missionDialog?.open); }};
}

export function buildRain(rig) {
  const count = 1200;
  const vertices = new Float32Array(count*6);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(vertices,3).setUsage(T.DynamicDrawUsage));
  const material = new T.LineBasicMaterial({color:0xc1daf4,transparent:true,opacity:.4,depthWrite:false,fog:false});
  const lines = new T.LineSegments(geometry,material);
  lines.frustumCulled = false;
  rig.add(lines);
  const drops = Array.from({length:count},()=>new T.Vector3(
    (Math.random()-.5)*35, Math.random()*11+.04, 16-Math.random()*59
  ));
  return {
    update(wet, speed, dt, cabinHeight) {
      const visible = Math.floor(wet*count);
      lines.visible = visible > 0;
      if (!visible) return;
      let written = 0;
      for (let i=0;i<visible;i++) {
        const drop = drops[i];
        drop.y -= dt*(12+i%8);
        drop.z += dt*(5+speed*.75);
        drop.x += dt*.55;
        if (drop.y < .04) drop.y += 11;
        if (drop.z > 16) drop.z -= 59;
        if (drop.x > 17.5) drop.x -= 35;
        // Exclude both ends of each streak from the volume occupied by the car.
        if (Math.abs(drop.x) < 1.36 && drop.z > -1.60 && drop.z < 1.62 && drop.y < cabinHeight) continue;
        const at = written++*6;
        vertices[at] = drop.x;
        vertices[at+1] = drop.y;
        vertices[at+2] = drop.z;
        vertices[at+3] = drop.x-.018;
        vertices[at+4] = drop.y+.24;
        vertices[at+5] = drop.z-speed*.004;
      }
      geometry.setDrawRange(0,written*2);
      geometry.attributes.position.needsUpdate = true;
    }
  };
}
