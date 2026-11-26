import * as T from 'three';
import { vehicles } from './vehicle-specs.js';
import { openGarage } from './garage.js';
import { normalizeChaseControls } from './chase-camera.js';
import { applyControllerLayout, createLayoutEditor, defaultControllerLayout, normalizeControllerLayout } from './touch-layout.js';

const key = 'afterlane-profile-v2';
const idbName = 'afterlane-mobile-storage';
const idbStore = 'profile';
const starterVehicleIndex = 11; // Classic Mini
export const isAndroidApp = navigator.userAgent.includes('AfterlaneAndroid');
export const isMobileDevice = isAndroidApp
  || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const defaultQuality = isMobileDevice ? 'Medium' : 'High';
const defaults = { balance:0, owned:[starterVehicleIndex], selected:starterVehicleIndex, traffic:14, weather:'Clear Day', wipers:'Auto', cabinLight:'On', cigarette:'Off', transmission:'Automatic', steering:'Touch', controllerStyle:'Wheel', steeringSensitivity:115, controlsOpacity:100, controllerLayout:defaultControllerLayout(), driveSide:'Right-hand drive', quality:defaultQuality, audio:'On', missionUnlocked:1, missionCompleted:{} };

if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => {});
}

function openProfileDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('No IndexedDB')); return; }
    const req = indexedDB.open(idbName, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(idbStore)) req.result.createObjectStore(idbStore);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(profile) {
  void openProfileDb().then(db => {
    const tx = db.transaction(idbStore, 'readwrite');
    tx.objectStore(idbStore).put(profile, key);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  }).catch(() => {});
}

function idbGet() {
  return openProfileDb().then(db => new Promise(resolve => {
    const tx = db.transaction(idbStore, 'readonly');
    const req = tx.objectStore(idbStore).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result && typeof req.result === 'object' ? req.result : null); };
    req.onerror = () => { db.close(); resolve(null); };
  })).catch(() => null);
}

function storedProfile() {
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    return saved && typeof saved==='object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

export async function hydrateMobileStorage() {
  if (localStorage.getItem(key)) return false;
  const backup = await idbGet();
  if (!backup) return false;
  try { localStorage.setItem(key, JSON.stringify(backup)); } catch { return false; }
  return true;
}

export function buildOptions(pause, trafficChanged, garageActions) {
  const hasLocal = Boolean(localStorage.getItem(key));
  const savedProfile = storedProfile();
  const settings = {...defaults,...savedProfile};
  const applyNormalized = source => {
    if (!Number.isFinite(settings.balance)) settings.balance=0;
    normalizeChaseControls(settings);
    normalizeControllerLayout(settings);
    const normalizeRange = (field,min,max)=>{
      const value = settings[field];
      settings[field] = Number.isFinite(value) ? T.MathUtils.clamp(value,min,max) : defaults[field];
    };
    normalizeRange('steeringSensitivity',65,150);
    normalizeRange('controlsOpacity',35,100);
    settings.missionUnlocked = Number.isInteger(settings.missionUnlocked) ? T.MathUtils.clamp(settings.missionUnlocked,1,50) : 1;
    if (!settings.missionCompleted || typeof settings.missionCompleted !== 'object' || Array.isArray(settings.missionCompleted)) settings.missionCompleted = {};
    settings.controllerStyle = settings.controllerStyle==='Arrows' ? 'Arrows' : 'Wheel';
    applyControllerLayout(settings);
    const ownedSrc = source && typeof source === 'object' ? source : {};
    const savedOwned = Array.isArray(ownedSrc.owned) ? ownedSrc.owned.filter(index=>Number.isInteger(index) && vehicles[index]) : [];
    const unlockedM4 = Boolean(settings.missionCompleted?.[5]);
    const baseOwned = savedOwned.filter(index => index !== 0 || unlockedM4 || settings.bmwM4Bought);
    settings.owned = [...new Set([starterVehicleIndex, ...(unlockedM4 ? [0] : []), ...baseOwned])];
    if (!settings.owned.includes(settings.selected)) settings.selected = starterVehicleIndex;
  };
  applyNormalized(savedProfile);
  let lastSaved = JSON.parse(JSON.stringify(settings));
  if (hasLocal) idbPut(lastSaved);
  else {
    void idbGet().then(backup => {
      if (!backup || localStorage.getItem(key)) return;
      Object.assign(settings, defaults, backup);
      applyNormalized(backup);
      try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
      lastSaved = JSON.parse(JSON.stringify(settings));
      garageActions?.onHydrate?.();
    });
  }
  function save() {
    try {
      const latest = storedProfile();
      const changed = {...latest};
      for (const [field,value] of Object.entries(settings)) {
        if (!(field in latest) || JSON.stringify(value)!==JSON.stringify(lastSaved[field])) changed[field]=value;
      }
      if (Number.isFinite(latest.balance)) changed.balance=latest.balance+settings.balance-lastSaved.balance;
      localStorage.setItem(key,JSON.stringify(changed));
      idbPut(changed);
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
      save();
    });
    row.append(newNode('span',label),input);
    content.append(row);
  }
  const layoutEditor = createLayoutEditor(settings, { pause, save });
  function showSettings() {
    panel.dataset.section = 'settings';
    title.textContent = 'Driving settings';
    content.replaceChildren();
    const controls = newNode('button','Custom controller (drag & resize)');
    controls.type = 'button';
    controls.addEventListener('click', () => layoutEditor.open());
    content.append(controls);
    range('Traffic vehicles','traffic',0,24,'',trafficChanged);
    range('Steering sensitivity','steeringSensitivity',65,150,'%',null,5);
    select('Weather','weather',['Clear Day','Dynamic','Clear Night','Light rain','Heavy rain','Rainy Night','Thunderstorm']);
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
  document.querySelector('#custom-controls')?.addEventListener('click', () => layoutEditor.open());
  document.querySelector('#close-panel').addEventListener('click', () => panel.close());
  return {settings,panel, save, openSettings:() => open(showSettings), openController:() => layoutEditor.open(), get editingControls() { return layoutEditor.isOpen; }, get modalOpen() { return panel.open||garagePanel.open||Boolean(missionDialog?.open)||layoutEditor.isOpen; }};
}

export function buildRain(rig) {
  const count = 1200;
  const vertices = new Float32Array(count*6);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(vertices,3).setUsage(T.DynamicDrawUsage));
  const material = new T.LineBasicMaterial({color:0xdaf0ff,transparent:true,opacity:.68,depthWrite:false,fog:false});
  const lines = new T.LineSegments(geometry,material);
  lines.frustumCulled = false;
  rig.add(lines);
  const drops = Array.from({length:count},()=>new T.Vector3(
    (Math.random()-.5)*30, Math.random()*11+.04, 14-Math.random()*54
  ));
  return {
    update(wet, speed, dt, cabinHeight) {
      const visible = Math.floor(wet*count);
      lines.visible = visible > 0;
      if (!visible) return;
      material.opacity = .52 + wet * .24;
      const trailZ = Math.min(speed * .0024, .16);
      let written = 0;
      for (let i=0;i<visible;i++) {
        const drop = drops[i];
        drop.y -= dt*(14+i%8);
        drop.z += dt*(5+Math.min(speed, 55)*.65);
        drop.x += dt*.55;
        if (drop.y < .04) drop.y += 11;
        if (drop.z > 14) drop.z -= 54;
        if (drop.x > 15) drop.x -= 30;
        // Exclude both ends of each streak from the volume occupied by the car.
        if (Math.abs(drop.x) < 1.36 && drop.z > -1.60 && drop.z < 1.62 && drop.y < cabinHeight) continue;
        const at = written++*6;
        vertices[at] = drop.x;
        vertices[at+1] = drop.y;
        vertices[at+2] = drop.z;
        vertices[at+3] = drop.x-.024;
        vertices[at+4] = drop.y+.42;
        vertices[at+5] = drop.z-trailZ;
      }
      geometry.setDrawRange(0,written*2);
      geometry.attributes.position.needsUpdate = true;
    }
  };
}
