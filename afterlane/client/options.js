import * as T from 'three';
import { vehicles } from './vehicle-specs.js';
import { openGarage } from './garage.js';
import { normalizeChaseControls } from './chase-camera.js';

const key = 'afterlane-profile-v2';
const defaults = { balance:0, owned:[0], selected:0, traffic:14, weather:'Clear Day', wipers:'Auto', cabinLight:'On', cigarette:'Off', transmission:'Automatic', steering:'Touch', controllerStyle:'Wheel', steeringSensitivity:115, controllerSize:100, steeringSize:100, pedalSize:100, shifterSize:100, controlsOpacity:100, driveSide:'Right-hand drive', quality:'High', audio:'On', missionUnlocked:1, missionCompleted:{} };

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
  normalizeRange('controllerSize',60,160);
  normalizeRange('steeringSize',60,160);
  normalizeRange('pedalSize',60,160);
  normalizeRange('shifterSize',60,160);
  normalizeRange('controlsOpacity',35,100);
  settings.missionUnlocked = Number.isInteger(settings.missionUnlocked) ? T.MathUtils.clamp(settings.missionUnlocked,1,50) : 1;
  if (!settings.missionCompleted || typeof settings.missionCompleted !== 'object' || Array.isArray(settings.missionCompleted)) settings.missionCompleted = {};
  settings.controllerStyle = settings.controllerStyle==='Arrows' ? 'Arrows' : 'Wheel';
  const applyControllerSize = () => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--touch-scale', settings.controllerSize/100);
    rootStyle.setProperty('--steer-scale', settings.steeringSize/100);
    rootStyle.setProperty('--pedal-scale', settings.pedalSize/100);
    rootStyle.setProperty('--gear-scale', settings.shifterSize/100);
    rootStyle.setProperty('--touch-opacity', settings.controlsOpacity/100);
  };
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
  let refreshPreview = () => {};
  const controllerFields = new Set(['controllerSize','steeringSize','pedalSize','shifterSize','controlsOpacity']);
  function range(label, field, min, max, unit, onChange, step = 1) {
    const row = newNode('div','','setting');
    const value = newNode('span',label+' · '+settings[field]+unit);
    const control = newNode('div','','range-control');
    const minus = newNode('button','−','step-btn');
    minus.type = 'button';
    minus.setAttribute('aria-label',`Decrease ${label}`);
    const slider = newNode('input');
    Object.assign(slider,{type:'range', min, max, step, value:settings[field]});
    const plus = newNode('button','+','step-btn');
    plus.type = 'button';
    plus.setAttribute('aria-label',`Increase ${label}`);
    const updateValue = (next, notify = true) => {
      const clamped = T.MathUtils.clamp(Math.round(next), min, max);
      settings[field] = clamped;
      slider.value = clamped;
      value.textContent = label+' · '+clamped+unit;
      if (controllerFields.has(field)) applyControllerSize();
      refreshPreview();
      save();
      if (notify) onChange?.();
    };
    slider.addEventListener('input', () => updateValue(Number(slider.value), false));
    slider.addEventListener('change', () => onChange?.());
    minus.addEventListener('click', () => updateValue(settings[field] - step, true));
    plus.addEventListener('click', () => updateValue(settings[field] + step, true));
    control.append(minus, slider, plus);
    row.append(value, control);
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
      refreshPreview();
      save();
    });
    row.append(newNode('span',label),input);
    content.append(row);
  }
  function showController() {
    panel.dataset.section = 'controller';
    title.textContent = 'Custom controller';
    content.replaceChildren();
    const preview = newNode('div','','controller-preview');
    preview.setAttribute('aria-label','Live controller size preview');
    const leftGroup = newNode('div','','preview-group');
    const rightGroup = newNode('div','','preview-group');
    preview.append(leftGroup, rightGroup);
    content.append(preview);
    refreshPreview = () => {
      if (panel.dataset.section !== 'controller') return;
      const base = settings.controllerSize / 100;
      const steerPx = Math.round(30 * base * (settings.steeringSize / 100));
      const pedalW = Math.round(24 * base * (settings.pedalSize / 100));
      const pedalH = Math.round(pedalW * 1.32);
      const gearW = Math.round(44 * base * (settings.shifterSize / 100));
      const gearH = Math.round(28 * base * (settings.shifterSize / 100));
      leftGroup.replaceChildren();
      if (settings.controllerStyle === 'Wheel') {
        const wheel = newNode('div','Wheel','preview-box preview-wheel');
        const wheelSize = Math.round(steerPx * 1.45);
        wheel.style.width = `${wheelSize}px`;
        wheel.style.height = `${wheelSize}px`;
        leftGroup.append(wheel);
      } else {
        for (const glyph of ['‹','›']) {
          const btn = newNode('div',glyph,'preview-box');
          btn.style.width = `${steerPx}px`;
          btn.style.height = `${steerPx}px`;
          leftGroup.append(btn);
        }
      }
      rightGroup.replaceChildren();
      const gear = newNode('div','Gear','preview-box');
      gear.style.width = `${gearW}px`;
      gear.style.height = `${gearH}px`;
      const brake = newNode('div','Brake','preview-box');
      brake.style.width = `${pedalW}px`;
      brake.style.height = `${pedalH}px`;
      const gas = newNode('div','Gas','preview-box');
      gas.style.width = `${pedalW}px`;
      gas.style.height = `${pedalH}px`;
      rightGroup.append(gear, brake, gas);
    };
    refreshPreview();
    select('Steering controller','controllerStyle',['Wheel','Arrows']);
    range('Overall control size','controllerSize',60,160,'%',null,5);
    range('Steering size','steeringSize',60,160,'%',null,5);
    range('Brake & Gas size','pedalSize',60,160,'%',null,5);
    range('Shifter & extras size','shifterSize',60,160,'%',null,5);
    range('Controls opacity','controlsOpacity',35,100,'%',null,5);
    range('Steering sensitivity','steeringSensitivity',65,150,'%',null,5);
    select('Steering input','steering',['Touch','Tilt']);
    select('Transmission','transmission',['Automatic','Manual']);
    const actions = newNode('div','','controller-actions');
    const resetBtn = newNode('button','Reset sizes');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      for (const field of controllerFields) settings[field] = defaults[field];
      applyControllerSize();
      save();
      showController();
    });
    const back = newNode('button','Back to settings');
    back.type = 'button';
    back.addEventListener('click',showSettings);
    const done = newNode('button','Done');
    done.type = 'button';
    done.addEventListener('click', () => panel.close());
    actions.append(resetBtn, back, done);
    content.append(actions);
  }
  function showSettings() {
    panel.dataset.section = 'settings';
    title.textContent = 'Driving settings';
    content.replaceChildren();
    const controls = newNode('button','Custom controller (size & layout)');
    controls.type = 'button';
    controls.addEventListener('click',showController);
    content.append(controls);
    range('Traffic vehicles','traffic',0,24,'',trafficChanged);
    select('Weather','weather',['Clear Day','Dynamic','Clear Night','Light rain','Heavy rain','Thunderstorm']);
    select('Wipers','wipers',['Auto','Fast','Off']);
    select('Cabin light','cabinLight',['On','Off']);
    select('Driver cigarette','cigarette',['Off','On']);
    select('Driving position','driveSide',['Right-hand drive','Left-hand drive']);
    select('Graphics','quality',['Low','Medium','High','Ultra']);
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
  document.querySelector('#custom-controls')?.addEventListener('click', () => open(showController));
  document.querySelector('#close-panel').addEventListener('click', () => panel.close());
  return {settings,panel, save, openSettings:() => open(showSettings), openController:() => open(showController), get modalOpen() { return panel.open||garagePanel.open||Boolean(missionDialog?.open); }};
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
