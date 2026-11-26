import * as T from 'three';
import { vehicles } from './vehicle-specs.js';
import { openGarage } from './garage.js';
import { normalizeChaseControls } from './chase-camera.js';
import { applyControllerLayout, createLayoutEditor, defaultControllerLayout, normalizeControllerLayout } from './touch-layout.js';

const key = 'afterlane-profile-v2';
const idbName = 'afterlane-mobile-storage';
const idbStore = 'profile';
const starterVehicleIndex = 11; // Classic Mini
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const forcePhone = typeof location !== 'undefined' && new URLSearchParams(location.search).get('phone') === '1';
export const isAndroidApp = ua.includes('AfterlaneAndroid');
export const isMobileDevice = isAndroidApp
  || forcePhone
  || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
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
  const maxCount = 3000;
  const bases = new Float32Array(maxCount * 6);
  const params = new Float32Array(maxCount * 4);
  for (let i = 0; i < maxCount; i++) {
    const x = (Math.random() - .5) * 30;
    const y = Math.random() * 11 + .04;
    const z = 14 - Math.random() * 54;
    const fallSpeed = 14 + (i % 8);
    const bi = i * 6;
    const pi = i * 4;
    bases[bi] = x; bases[bi + 1] = y; bases[bi + 2] = z;
    bases[bi + 3] = x; bases[bi + 4] = y; bases[bi + 5] = z;
    params[pi] = fallSpeed; params[pi + 1] = 0;
    params[pi + 2] = fallSpeed; params[pi + 3] = 1;
  }
  const geometry = new T.BufferGeometry();
  // Position attribute is unused for world placement directly, bind aBase as position for bounds/three compatibility.
  geometry.setAttribute('position', new T.BufferAttribute(bases, 3));
  geometry.setAttribute('aParams', new T.BufferAttribute(params, 2));
  const uniforms = {
    uPhase: { value: 0 },
    uScrollZ: { value: 0 },
    uTrailZ: { value: 0 },
    uCabinY: { value: 1.8 },
    uOpacity: { value: .68 },
  };
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      attribute vec2 aParams;
      uniform float uPhase, uScrollZ, uTrailZ, uCabinY;
      void main() {
        float x = mod(position.x + uPhase * 0.55 + 15.0, 30.0) - 15.0;
        float y = mod(position.y - uPhase * aParams.x - 0.04, 11.0) + 0.04;
        float z = mod(position.z + uScrollZ + 40.0, 54.0) - 40.0;
        if (abs(x) < 1.36 && z > -1.60 && z < 1.62 && y < uCabinY) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        vec3 p = vec3(x, y, z) + aParams.y * vec3(-0.024, 0.42, -uTrailZ);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(0.855, 0.941, 1.0, uOpacity);
      }`,
  });
  const lines = new T.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  rig.add(lines);
  let phase = 0, scrollZ = 0;
  const counts = isMobileDevice
    ? { Low: 0, Medium: 800, High: 1500, Ultra: 2200 }
    : { Low: 400, Medium: 800, High: 1500, Ultra: 3000 };
  return {
    update(wet, speed, dt, cabinHeight, quality = 'High') {
      const cap = counts[quality] ?? 1500;
      const visible = Math.floor(wet * cap);
      lines.visible = visible > 0;
      if (!visible) return;
      phase += dt;
      scrollZ += dt * (5 + Math.min(speed, 55) * .65);
      uniforms.uPhase.value = phase;
      uniforms.uScrollZ.value = scrollZ;
      uniforms.uTrailZ.value = Math.min(speed * .0024, .16);
      uniforms.uCabinY.value = cabinHeight;
      uniforms.uOpacity.value = .52 + wet * .24;
      geometry.setDrawRange(0, visible * 2);
    }
  };
}
