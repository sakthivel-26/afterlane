import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, drawGauges, group, loadDriverHand, loadVehicleAsset } from './car.js';
import { buildRoad, buildSky, loadJunctionAsset, roadLimit, roadX, roadYaw } from './road.js';
import { buildTraffic, vehicleBody } from './traffic.js';
import { dimensions, vehicles } from './vehicle-specs.js';
import { buildRain, buildOptions } from './options.js';
import { connectRooms } from './rooms.js';
import { drivingAudio } from './audio.js';
import { drivingEffects } from './effects.js';
import { advanceDrive, advanceSteering } from './drivetrain.js';
import { bladeAngle } from './glass.js';
import { advanceRoute, districtAt, newRouteProgress, weatherAt } from './route.js';
import { buildSnow } from './snow.js';
import { trafficLighting } from './traffic-lights.js';
import { countryBirds } from './birds.js';
import { bindChaseOrbit, chasePose } from './chase-camera.js';
import { buildSuspension } from './suspension.js';
import { wheelAnimator } from './wheel-motion.js';
import { loadPlantKit } from './plants.js';
import { bindTouchGear, bindTouchWheel } from './touch-controls.js';
import { readSoloRun } from './solo-run.js';
import { buildMissionMap, missions } from './missions.js';
import { animateLightbar, createLightbar, createMissionActors } from './mission-actors.js';
import { advanceFlight, createFlight, createLiftJets, flightRollAngle, startFlightRoll, toggleFlight, trafficClearance } from './flight.js';

const viewport = document.querySelector('#viewport');
const intro = document.querySelector('#intro');
const start = document.querySelector('#start');
const playMissions = document.querySelector('#play-missions');
const openSettingsBtn = document.querySelector('#open-settings');
const hudCamera = document.querySelector('#hud-camera');
const hudCameraLabel = document.querySelector('#hud-camera-label');
const view = document.querySelector('#view');
const error = document.querySelector('#error');
const menu = document.querySelector('#top-menu');
const garagePanel = document.querySelector('#garage-panel');
const loadingScreen = document.querySelector('#loading-screen');
const loadingBarFill = document.querySelector('#loading-bar-fill');
const loadingProgress = document.querySelector('.loading-progress');
const loadingStatus = document.querySelector('#loading-status');

function setLoading(percent, message) {
  if (loadingBarFill) loadingBarFill.style.width = `${percent}%`;
  if (loadingProgress) loadingProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
  if (loadingStatus && message) loadingStatus.textContent = message;
}

function initialVehicleIndex() {
  try {
    const saved = JSON.parse(localStorage.getItem('afterlane-profile-v2'));
    const unlockedM4 = Boolean(saved?.missionCompleted?.[5]);
    if (Number.isInteger(saved?.selected) && vehicles[saved.selected] && (saved.selected !== 0 || unlockedM4 || saved.bmwM4Bought)) {
      return saved.selected;
    }
  } catch { /* Use default starter car. */ }
  return 11; // Classic Mini
}

let renderer;
try {
  setLoading(12, 'Initializing graphics engine…');
  renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const initialIndex = initialVehicleIndex();
  let loadedSteps = 0;
  const stepLoad = (label, promise) => promise.then(result => {
    loadedSteps++;
    setLoading(15 + loadedSteps * 15, label);
    return result;
  });
  const [plants, driverHand, junctionAsset, initialCarAsset] = await Promise.all([
    stepLoad('Loading roadside foliage…', loadPlantKit()),
    stepLoad('Loading driver controls…', loadDriverHand()),
    stepLoad('Loading highway junctions…', loadJunctionAsset()),
    stepLoad('Loading equipped vehicle…', loadVehicleAsset(vehicles[initialIndex])),
  ]);
  setLoading(80, 'Building highway & traffic…');
  await new Promise(resolve => requestAnimationFrame(resolve));
  start.textContent = 'Free Play';
  run(renderer, plants, driverHand, junctionAsset, initialIndex, initialCarAsset);
  setLoading(100, 'Ready to drive');
  start.disabled = false;
  if (playMissions) playMissions.disabled = false;
  loadingScreen?.classList.add('is-hidden');
} catch (cause) {
  loadingScreen?.classList.add('is-hidden');
  error.textContent = renderer
    ? 'Afterlane hit an error while loading the driving scene.'
    : 'The driving view requires a browser with WebGL 2 and graphics acceleration enabled.';
  renderer?.dispose();
  renderer?.domElement.remove();
  error.hidden = false;
  start.disabled = true;
  console.error(cause);
}

function run(renderer, plants, driverHand, junctionAsset, initialIndex = 0, initialCarAsset = null) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2.35));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  viewport.append(renderer.domElement);

  const scene = new T.Scene();
  const studioEnv = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnv,.08).texture;
  scene.environmentIntensity = .42;
  studioEnv.dispose();
  pmrem.dispose();
  const forestFog = new T.Color(0x080d16), townFog = new T.Color(0x182330);
  const dayFog = new T.Color(0xc2dcf2), snowFog = new T.Color(0xb1bfcd);
  const nightSky = new T.Color(0xc6d7fc), sunSky = new T.Color(0xdcf0ff);
  const nightGround = new T.Color(0x79624b), sunGround = new T.Color(0xc6a982);
  const nightKeyColor = new T.Color(0xe8ba8b), sunColor = new T.Color(0xfff1cc);
  scene.fog = new T.FogExp2(dayFog, .004);
  const ambient = new T.HemisphereLight(0xc6d7fc, 0x79624b, .9);
  scene.add(ambient);
  const moon = new T.DirectionalLight(0xadc3ec, .55);
  moon.position.set(-6,9,-5);
  scene.add(moon);
  const key = new T.DirectionalLight(0xfff1cc, .40);
  key.position.set(-14,24,-18);
  scene.add(key);
  const updateSky = buildSky(scene);
  const updateRoad = buildRoad(scene,plants,junctionAsset);
  const animateBirds = countryBirds(scene);

  const rig = group(scene);
  const car = buildCar(rig,driverHand);
  const liftJets = createLiftJets();
  car.exterior.add(liftJets);
  const actors = createMissionActors(scene);
  const playerLightbar = createLightbar();
  playerLightbar.visible = false;
  car.exterior.add(playerLightbar);
  const suspension = buildSuspension();
  const audio = drivingAudio();
  const camera = new T.PerspectiveCamera(68, 1, .035, 500);
  const compiledTemplates = new WeakSet();
  const prepareTrafficShader = async template => {
    if (compiledTemplates.has(template)) return;
    compiledTemplates.add(template);
    if (typeof renderer.compileAsync === 'function') {
      const probe = template.clone(true);
      probe.position.set(0, -50, -30);
      scene.add(probe);
      try { await renderer.compileAsync(probe, camera, scene); }
      finally { scene.remove(probe); }
    }
  };
  const traffic = buildTraffic(scene, prepareTrafficShader);
  const rain = buildRain(rig);
  const snow = buildSnow(rig);
  const customCars = vehicles.map(spec => spec && vehicleBody(car.exterior,spec.type,spec.color,spec.style));
  const playerSizes = vehicles.map(spec => spec && dimensions(spec.type,spec.style));
  const exteriorModels = [...customCars];
  const requestedModels = new Set();
  function attachVehicleAsset(index, asset) {
    if (!asset) return;
    const model = asset.clone(true);
    customCars[index].body.visible = false;
    const sprung = model.getObjectByName('Sprung exterior') ?? model;
    exteriorModels[index] = {body:model,sprung,animateWheels:wheelAnimator(model),footprint:model.userData.footprint};
    model.visible = false;
    car.exterior.add(model);
  }
  if (initialCarAsset) {
    requestedModels.add(initialIndex);
    attachVehicleAsset(initialIndex, initialCarAsset);
  }
  function requestModel(index) {
    if (requestedModels.has(index)) return;
    requestedModels.add(index);
    loadVehicleAsset(vehicles[index]).then(asset=>attachVehicleAsset(index, asset));
  }
  const touch = document.querySelector('#touch-drive');
  const flightControls = document.querySelector('#flight-controls');
  const flightButton = document.querySelector('#flight-toggle');
  const flightStatus = document.querySelector('#flight-status');
  const roadSpeed = document.querySelector('#road-speed');
  const flightCharge = document.querySelector('#flight-charge');
  const flightPercent = document.querySelector('#flight-percent');
  const verticalButtons = flightControls.querySelectorAll('[data-drive]');
  const touchTransmission = document.querySelector('#touch-transmission');
  const handbrakeButtons = document.querySelectorAll('[data-drive="Space"]');
  const touchSmoke = document.querySelector('#touch-smoke');
  const touchWheelElement = document.querySelector('#touch-wheel');
  const touchArrows = document.querySelector('#touch-arrows');
  const touchWheel = bindTouchWheel(touchWheelElement);
  const lamps = group(rig);
  const beams = [];
  for (const side of [-1, 1]) {
    const beam = new T.SpotLight(0xffe1ba, 620, 85, .24, .62, 1.12);
    beam.position.set(side*.67,.83,-2.22);
    beam.target.position.set(side*.9, .05, -29);
    lamps.add(beam, beam.target);
    beams.push(beam);
  }

  const effects = drivingEffects(renderer,scene,camera);
  const modes = ['Cabin', 'Hood', 'Chase'];
  let mode = 0;
  let playing = false;
  let started = false;
  let crashed = false;
  let points = 0, distancePoints = 0, gameTime = 0;
  let routeProgress = newRouteProgress();
  let accelerator = 0, pullBrakeUntil = 0;
  let gear = 1, rpm = 850, tilt = 0, tiltReady = false, sweep = 0;
  let headlights = 1, signal = 0, lastGear = 1, lastWipe = 0, lastTick = 0, lastFlash = false;
  let lastShift = -Infinity;
  let speed = 0, distance = 0, x = 1.84, steering = 0, yaw = 0, yawRate = 0, lateralSpeed = 0, steerScale = 1;
  let health = 100, impactGraceUntil = 0, toastTimer = 0, hitFlashTimer = 0;
  let activeMission = null;
  let roadWet = 0, roadWetHold = 0, roadWetPeak = 0;
  let chaseHeading = roadYaw(distance), chaseLateral = x, chaseAltitude = 0, chaseZoom = 0;
  let lastTime = 0, lastGauge = -1, lastRunSave = 0;
  let soloDirty = false;
  const originalIntro = intro.querySelector('h1').innerHTML;
  const originalDescription = intro.querySelector('.sub').textContent;
  const held = new Set();
  const drivingPointers = new Map();
  let flight = createFlight();
  const inputs = new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyT','KeyG']);
  function has(...codes) {
    if (codes.some(code=>held.has(code))) return true;
    for (const button of drivingPointers.values()) if (codes.includes(button.dataset.drive)) return true;
    return false;
  }

  const options = buildOptions(() => {
    if (playing) setPlaying(false);
  }, () => traffic.reset(distance), {
    previewSound:vehicle => audio.preview(vehicle),
    stopSound:() => audio.stopPreview(),
    equip:() => {
      flight=createFlight(flight.charge);
      gear=1;
      rpm=850;
      const vehicle=vehicles[settings.selected];
      drawGauges(car.gauges,Math.abs(speed),headlights,rpm,vehicle.electric ? 'EV' : gear,0,vehicle.speed);
      requestModel(settings.selected);
    }
  });
  const settings = options.settings;
  const durabilityBox = document.querySelector('#drive-durability');
  const durabilityFill = document.querySelector('#durability-fill');
  const durabilityPct = document.querySelector('#durability-pct');
  const hitFlash = document.querySelector('#hit-flash');
  const driveToast = document.querySelector('#drive-toast');
  const missionHud = document.querySelector('#mission-hud');
  const missionHudTitle = document.querySelector('#mission-hud-title');
  const missionHudTimer = document.querySelector('#mission-hud-timer');
  const missionHudGoals = document.querySelector('#mission-hud-goals');
  const missionResultActions = document.querySelector('#mission-result-actions');
  const missionNextBtn = document.querySelector('#mission-next');
  const missionMapBackBtn = document.querySelector('#mission-map-back');
  const missionRetryBtn = document.querySelector('#mission-retry');

  function showToast(text, duration = 1400) {
    if (!driveToast) return;
    driveToast.textContent = text;
    driveToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { driveToast.hidden = true; }, duration);
  }
  function updateDurability() {
    if (!durabilityFill || !durabilityPct) return;
    const pct = Math.max(0, Math.round(health));
    durabilityFill.style.width = `${pct}%`;
    durabilityFill.style.background = pct > 60 ? '#59d98e' : pct > 30 ? '#ffc176' : '#ff6868';
    durabilityPct.textContent = `${pct}%`;
  }
  function startMission(mission) {
    audio.wake();
    reset();
    started = false;
    activeMission = {
      spec: mission,
      remaining: mission.timeLimit,
      closeOvertakes: 0,
      speedHeld: 0,
      brakeUsed: false,
      scratched: false,
      takedowns: 0,
      interceptPct: 0,
      bustPct: 0,
      policeGap: Infinity,
      suspectGap: Infinity,
      rank: { place: 1, total: (mission.rivals || 0) + 1 },
      ramCooldownUntil: 0,
      status: 'active',
    };
    actors.setup(mission);
    if (missionResultActions) missionResultActions.hidden = true;
    setPlaying(true);
    updateMissionHud();
  }
  const missionMap = buildMissionMap(settings, startMission);
  playMissions?.addEventListener('click', () => {
    if (playing) setPlaying(false);
    missionMap.open();
  });
  openSettingsBtn?.addEventListener('click', () => options.openSettings());
  missionMapBackBtn?.addEventListener('click', () => {
    if (missionResultActions) missionResultActions.hidden = true;
    missionMap.open(activeMission?.spec.id);
  });
  missionRetryBtn?.addEventListener('click', () => {
    if (activeMission) startMission(activeMission.spec);
  });
  missionNextBtn?.addEventListener('click', () => {
    const next = missions.find(m => m.id === (activeMission?.spec.id || 0) + 1);
    if (next) startMission(next);
    else missionMap.open();
  });

  function updateMissionHud() {
    if (!missionHud || !activeMission || activeMission.status !== 'active') {
      if (missionHud) missionHud.hidden = true;
      return;
    }
    missionHud.hidden = false;
    const { spec, remaining, closeOvertakes, speedHeld, brakeUsed, scratched, takedowns, interceptPct, bustPct, policeGap, suspectGap, rank } = activeMission;
    const o = spec.objectives;
    missionHudTitle.textContent = `M${spec.id} · ${spec.title} · ${spec.modeLabel}`;
    const mins = Math.floor(remaining / 60);
    const secs = (remaining % 60).toFixed(1).padStart(4, '0');
    missionHudTimer.textContent = `${String(mins).padStart(2, '0')}:${secs}`;
    missionHudTimer.classList.toggle('is-urgent', remaining <= 10);

    const chips = [];
    const chip = (text, cls = '') => {
      const el = document.createElement('span');
      el.className = `mission-goal-chip ${cls}`.trim();
      el.textContent = text;
      chips.push(el);
    };
    if (spec.mode === 'pack') {
      chip(`Pos ${rank.place}/${rank.total}`, rank.place === 1 ? 'is-done' : 'is-active');
    }
    if (o.catchSuspect) {
      const gapLabel = Number.isFinite(suspectGap) ? `${Math.round(suspectGap)}m` : '--';
      chip(`Suspect ${gapLabel}`, interceptPct > 0 ? 'is-active' : '');
      chip(`Takedown ${takedowns}/${o.takedowns}`, takedowns >= o.takedowns ? 'is-done' : '');
      if (interceptPct > 0) chip(`Lock ${Math.round(interceptPct)}%`, 'is-active');
    }
    if (o.evadePolice) {
      const pLabel = Number.isFinite(policeGap) ? `${Math.round(policeGap)}m` : '--';
      chip(`Police ${pLabel}`, policeGap < 15 ? 'is-danger' : '');
      if (bustPct > 0) chip(`Bust ${Math.round(bustPct)}%`, 'is-danger');
      if (o.surviveTimer) chip('Evade Timer', 'is-active');
    }
    if (o.distance) {
      const done = distance >= o.distance;
      chip(`Dist ${Math.min(o.distance, Math.floor(distance))}/${o.distance}m`, done ? 'is-done' : '');
    }
    if (o.closeOvertakes) {
      const done = closeOvertakes >= o.closeOvertakes;
      chip(`Near ${Math.min(o.closeOvertakes, closeOvertakes)}/${o.closeOvertakes}`, done ? 'is-done' : '');
    }
    if (o.speedTarget) {
      const done = speedHeld >= o.speedDuration;
      const holding = Math.abs(speed) * 3.6 >= o.speedTarget;
      chip(`${o.speedTarget}+ km/h ${Math.min(o.speedDuration, speedHeld).toFixed(1)}/${o.speedDuration}s`,
        done ? 'is-done' : holding ? 'is-active' : '');
    }
    if (o.noScratch) {
      chip(scratched ? 'Scratched!' : 'No Scratch ✓', scratched ? 'is-danger' : 'is-done');
    }
    if (o.noBrake) {
      chip(brakeUsed ? 'Brake Used!' : 'No Brakes ✓', brakeUsed ? 'is-danger' : 'is-done');
    }
    missionHudGoals.replaceChildren(...chips);
  }

  function stepMission(dt, now, usedBrake) {
    if (!activeMission || activeMission.status !== 'active' || rooms.active) return;
    const { spec } = activeMission;
    const o = spec.objectives;
    activeMission.remaining = Math.max(0, activeMission.remaining - dt);
    if (o.noBrake && usedBrake) {
      activeMission.brakeUsed = true;
      failMission('Brakes used in No-Brakes mission!');
      return;
    }
    if (spec.mode === 'pack') {
      activeMission.rank = actors.rank(distance);
      if (distance >= o.distance) {
        if (activeMission.rank.place === 1) completeMission();
        else failMission(`Finished #${activeMission.rank.place} — 1st place required!`);
      } else if (activeMission.remaining <= 0) {
        failMission('Time expired!');
      }
      updateMissionHud();
      return;
    }
    if (spec.mode === 'police_chase') {
      const st = actors.suspectStatus(distance, x, now);
      if (st) {
        activeMission.suspectGap = st.gap;
        if (st.rammed && now >= activeMission.ramCooldownUntil) {
          activeMission.ramCooldownUntil = now + 2200;
          activeMission.takedowns++;
          activeMission.interceptPct = 0;
          speed *= .82;
          audio.tick(110, .3, .2, 'sawtooth');
          showToast(`SUSPECT RAMMED · ${activeMission.takedowns}/${o.takedowns}!`, 1200);
          if (activeMission.takedowns < o.takedowns) actors.relaunchSuspect(distance);
        } else if (st.locking) {
          activeMission.interceptPct = Math.min(100, activeMission.interceptPct + dt * 44);
          if (activeMission.interceptPct >= 100) {
            activeMission.takedowns++;
            activeMission.interceptPct = 0;
            showToast(`SUSPECT INTERCEPTED · ${activeMission.takedowns}/${o.takedowns}!`, 1200);
            if (activeMission.takedowns < o.takedowns) actors.relaunchSuspect(distance);
          }
        } else {
          activeMission.interceptPct = Math.max(0, activeMission.interceptPct - dt * 16);
        }
      }
      if (activeMission.takedowns >= (o.takedowns || 1)) completeMission();
      else if (activeMission.remaining <= 0) failMission('Suspect escaped!');
      updateMissionHud();
      return;
    }
    if (spec.mode === 'flee') {
      const st = actors.policeStatus(distance, x);
      activeMission.policeGap = st.closest;
      activeMission.bustPct = st.pinning
        ? Math.min(100, activeMission.bustPct + dt * 28)
        : Math.max(0, activeMission.bustPct - dt * 18);
      if (activeMission.bustPct >= 100) {
        failMission('Busted by police!');
      } else if (o.surviveTimer) {
        if (activeMission.remaining <= 0) completeMission();
      } else if (distance >= o.distance) {
        completeMission();
      } else if (activeMission.remaining <= 0) {
        failMission('Time expired before escape!');
      }
      updateMissionHud();
      return;
    }
    if (o.speedTarget && Math.abs(speed) * 3.6 >= o.speedTarget) {
      activeMission.speedHeld += dt;
    }
    const done = (!o.distance || distance >= o.distance) &&
      (!o.closeOvertakes || activeMission.closeOvertakes >= o.closeOvertakes) &&
      (!o.speedTarget || activeMission.speedHeld >= o.speedDuration) &&
      (!o.noBrake || !activeMission.brakeUsed) &&
      (!o.noScratch || !activeMission.scratched);
    if (done) completeMission();
    else if (activeMission.remaining <= 0) failMission('Time expired!');
    updateMissionHud();
  }

  function completeMission() {
    if (!activeMission || activeMission.status !== 'active') return;
    activeMission.status = 'won';
    const { spec, remaining } = activeMission;
    award(spec.reward);
    settings.missionUnlocked = Math.max(settings.missionUnlocked || 1, Math.min(missions.length, spec.id + 1));
    const prev = settings.missionCompleted[spec.id];
    if (!prev || remaining > prev.bestRemaining) {
      settings.missionCompleted[spec.id] = { bestRemaining: +remaining.toFixed(1) };
    }
    let unlockedCar = '';
    if (spec.id === 5 && !settings.owned.includes(0)) {
      settings.owned.push(0);
      unlockedCar = 'BMW M4 Competition';
    }
    options.save();
    setPlaying(false);
    intro.querySelector('h1').textContent = `Mission ${spec.id} complete!`;
    intro.querySelector('.sub').textContent = unlockedCar
      ? `${spec.title} · +${spec.reward} pts · 🎁 Unlocked ${unlockedCar} FREE in Garage!`
      : `${spec.title} · +${spec.reward} pts earned · ${remaining.toFixed(1)}s left`;
    if (unlockedCar) showToast(`FREE CAR UNLOCKED: ${unlockedCar}!`, 2600);
    start.textContent = 'Free Play';
    if (missionResultActions) {
      missionResultActions.hidden = false;
      if (missionNextBtn) missionNextBtn.hidden = spec.id >= missions.length;
    }
    updateMissionHud();
  }

  function failMission(reason) {
    if (!activeMission || activeMission.status !== 'active') return;
    activeMission.status = 'failed';
    const { spec } = activeMission;
    speed = 0;
    setPlaying(false);
    intro.querySelector('h1').textContent = `Mission ${spec.id} failed`;
    intro.querySelector('.sub').textContent = `${reason} · ${Math.floor(distance)} m driven`;
    start.textContent = 'Free Play';
    if (missionResultActions) {
      missionResultActions.hidden = false;
      if (missionNextBtn) missionNextBtn.hidden = true;
    }
    updateMissionHud();
  }
  const touchShifter = bindTouchGear(touch,selectGear,()=>{
    if (!playing) return;
    settings.transmission = settings.transmission==='Manual' ? 'Automatic' : 'Manual';
    options.save();
  });
  const enableChaseOrbit = bindChaseOrbit(viewport,document.querySelector('#chase-tools'),settings,options.save);
  const rooms = connectRooms(scene,settings,{
    pause:() => { audio.wake(); if (playing) setPlaying(false); },
    start:() => { reset(); setPlaying(true); },
    leave:restoreSolo,
    finish:heading => {
      setPlaying(false);
      intro.querySelector('h1').textContent = 'Race finished';
      intro.querySelector('.sub').textContent = heading;
      start.textContent = 'Resume unavailable';
    },
    correct: state => { distance = state.distance; x = state.x; speed = state.speed; }
  });
  const lightTraffic = trafficLighting(scene,visit => {
    if (rooms.active) rooms.visitVisible(visit);
    else traffic.visitVisible(visit);
  });

  function reset() {
    flight = createFlight();
    crashed = false;
    soloDirty = false;
    speed = distance = steering = yaw = yawRate = lateralSpeed = points = distancePoints = gameTime = 0;
    health = 100;
    impactGraceUntil = 0;
    updateDurability();
    roadWet = roadWetHold = roadWetPeak = 0;
    steerScale = 1;
    routeProgress = newRouteProgress();
    accelerator = pullBrakeUntil = 0;
    gear = 1;
    rpm = 850;
    lastShift = -Infinity;
    x = 1.84;
    chaseHeading = roadYaw(0);
    chaseLateral = x;
    chaseAltitude = 0;
    chaseZoom = 0;
    suspension.reset();
    traffic.reset(0);
    actors.clear();
  }

  function saveSolo() {
    if (rooms.active || activeMission || !started || !soloDirty) return;
    settings.soloRun = crashed ? null : {
      distance,offset:x,points,distancePoints,gameTime,view:mode,headlights,flightCharge:flight.charge,route:{...routeProgress},
    };
    options.save();
    soloDirty=false;
  }

  function restoreSolo() {
    activeMission = null;
    reset();
    const saved = readSoloRun(settings.soloRun,roadLimit-1.18);
    started=Boolean(saved);
    if (saved) {
      ({distance,offset:x,points,distancePoints,gameTime,headlights,route:routeProgress} = saved);
      flight = createFlight(saved.flightCharge);
      chaseHeading = roadYaw(distance);
      chaseLateral = x;
      chaseAltitude = flight.height;
      chaseZoom = 0;
      setView(saved.view);
      traffic.reset(distance);
    }
    setPlaying(false);
    if (missionResultActions) missionResultActions.hidden = true;
    if (saved) {
      intro.querySelector('.sub').textContent = 'Your saved free-play drive is ready.';
      start.textContent = 'Resume Free Play';
    } else {
      intro.querySelector('h1').innerHTML=originalIntro;
      intro.querySelector('.sub').textContent=originalDescription;
      start.textContent='Free Play';
    }
  }

  function award(amount) {
    points += amount;
    settings.balance += amount;
    soloDirty=true;
    saveSolo();
  }

  function awardDistance() {
    const earned = Math.floor(distance/15);
    if (earned <= distancePoints) return;
    const reward = earned-distancePoints;
    distancePoints = earned;
    award(reward);
  }

  function crash() {
    crashed = true;
    soloDirty = true;
    speed = 0;
    awardDistance();
    if (activeMission?.status === 'active') {
      failMission('Vehicle wrecked!');
      return;
    }
    setPlaying(false);
    intro.querySelector('h1').textContent = 'Run ended';
    intro.querySelector('.sub').textContent = Math.floor(distance) + ' m driven · ' + points + ' points earned';
    start.textContent = 'Drive again';
  }

  function setPlaying(value) {
    playing = value;
    held.clear();
    for (const [pointer,button] of drivingPointers) {
      button.removeAttribute('data-held');
      if (button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
    }
    drivingPointers.clear();
    touchWheel.reset();
    touchShifter.reset();
    touch.hidden = !value;
    if (hudCamera) hudCamera.hidden = !value;
    if (durabilityBox) durabilityBox.hidden = !value || rooms.active || Boolean(activeMission);
    if (!value) pullBrakeUntil = 0;
    intro.hidden = value;
    if (value) {
      started = true;
      soloDirty = !rooms.active && !activeMission;
      if (missionResultActions) missionResultActions.hidden = true;
      start.blur();
    } else if (started && (!activeMission || activeMission.status === 'active')) {
      intro.querySelector('h1').textContent = 'Paused';
      intro.querySelector('.sub').textContent = activeMission
        ? `Mission ${activeMission.spec.id} paused.`
        : 'Your drive is ready when you are.';
      start.textContent = activeMission ? 'Resume Mission' : 'Resume Free Play';
      if (missionResultActions) missionResultActions.hidden = true;
      start.focus();
    }
    updateMissionHud();
    saveSolo();
  }

  function setView(index) {
    mode = index;
    view.firstChild.textContent = modes[mode] + ' view ';
    if (hudCameraLabel) hudCameraLabel.textContent = modes[mode];
    if (hudCamera) hudCamera.setAttribute('aria-label', `Switch camera view (${modes[mode]})`);
    enableChaseOrbit(mode===2);
    if (mode === 0) lastGauge = -Infinity;
    if (mode === 2) {
      chaseHeading = roadYaw(distance);
      chaseLateral = x;
      chaseAltitude = flight.height;
    }
  }
  const switchView = () => setView((mode+1)%modes.length);
  function gearCount() {
    const vehicle = vehicles[rooms.active ? rooms.vehicle : settings.selected];
    return vehicle.transmission.ratios.length;
  }
  function selectGear(next) {
    const vehicle = vehicles[rooms.active ? rooms.vehicle : settings.selected];
    if (!playing || vehicle.electric || settings.transmission!=='Manual' || !Number.isInteger(next) || next< -1 || next>gearCount()) return false;
    if (next===gear) return true;
    if ((next<0 && speed>1.4) || (next>0 && speed< -1.4)) return false;
    lastShift = performance.now();
    gear = next;
    return true;
  }
  const shift = step => selectGear(T.MathUtils.clamp(gear+step,-1,gearCount()));
  touchSmoke.addEventListener('click',()=>{
    if (!playing) return;
    settings.cigarette = settings.cigarette==='On' ? 'Off' : 'On';
    options.save();
  });
  function updateController(vehicle) {
    const speedLabel = Math.round(Math.abs(speed)*3.6)+' km/h';
    if (roadSpeed.value!==speedLabel) roadSpeed.value=speedLabel;
    touchTransmission.hidden = Boolean(vehicle.electric);
    flightControls.hidden = !playing || !vehicle.flight || rooms.active;
    if (!flightControls.hidden) {
      const label = flight.active ? 'Land' : 'Take off';
      if (flightButton.firstChild.nodeValue.trim()!==label) flightButton.firstChild.nodeValue=label+' ';
      flightButton.disabled = !flight.active && (flight.height>0 || flight.charge<1);
      const percent = Math.floor(flight.charge*100);
      if (flightCharge.value!==percent) flightCharge.value=percent;
      if (flightPercent.textContent!==percent+'%') flightPercent.textContent=percent+'%';
      const status = flight.height>0
        ? (flight.active ? '' : 'Landing · ')+Math.ceil(flight.height)+' m above road'
        : flight.active ? 'Taking off' : flight.charge<1 ? 'Recharging' : 'On road';
      if (flightStatus.value!==status) flightStatus.value=status;
      for (const button of verticalButtons) button.disabled=!flight.active;
    }
    if (touch.hidden) return;
    const arrows = settings.controllerStyle==='Arrows';
    if (touchWheelElement.hidden!==arrows) {
      touchWheel.reset();
      touchWheelElement.hidden=arrows;
      touchArrows.hidden=!arrows;
    }
    if (!arrows) touchWheel.render(steering);
    if (!vehicle.electric) touchShifter.render(gear,settings.transmission==='Automatic',vehicle.transmission.ratios.length);
    const smoking = String(settings.cigarette==='On');
    if (touchSmoke.getAttribute('aria-pressed')!==smoking) touchSmoke.setAttribute('aria-pressed',smoking);
  }
  function changeFlightMode() {
    if (!playing || rooms.active || !vehicles[settings.selected].flight) return;
    toggleFlight(flight);
    if (flight.active) setView(2);
  }
  flightButton.addEventListener('click',changeFlightMode);
  function rollWithArrow(code) {
    if (code==='ArrowLeft') startFlightRoll(flight,1);
    if (code==='ArrowRight') startFlightRoll(flight,-1);
  }
  for (const button of document.querySelectorAll('[data-drive]')) {
    button.addEventListener('pointerdown', event => {
      if (!playing || event.button!==0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      drivingPointers.set(event.pointerId,button);
      button.setAttribute('data-held','');
      rollWithArrow(button.dataset.drive);
      if (button.dataset.drive==='Space') pullBrakeUntil=performance.now()+390;
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) {
      button.addEventListener(event, pointer => {
        if (drivingPointers.get(pointer.pointerId)!==button) return;
        drivingPointers.delete(pointer.pointerId);
        if (![...drivingPointers.values()].includes(button)) button.removeAttribute('data-held');
      });
    }
  }
  window.addEventListener('deviceorientation', event => {
    if (event.gamma === null || event.beta === null) return;
    const orientation = screen.orientation?.angle ?? window.orientation ?? 0;
    tilt = T.MathUtils.clamp((Math.abs(orientation) === 90 || orientation === 270
      ? event.beta * (orientation === 90 ? 1 : -1) : event.gamma)/27,-1,1);
    tiltReady = true;
  });
  start.addEventListener('click', () => {
    audio.wake();
    if (rooms.active && !rooms.canDrive) return;
    if (activeMission && activeMission.status !== 'active') {
      activeMission = null;
      reset();
    } else if (crashed) {
      activeMission = null;
      reset();
    }
    setPlaying(true);
  });
  view.addEventListener('click', () => { switchView(); view.blur(); });
  hudCamera?.addEventListener('click', () => { switchView(); hudCamera.blur(); });
  menu.addEventListener('click',event=>{ if (event.target.closest('button')) menu.open=false; });
  document.addEventListener('pointerdown',event=>{ if (menu.open && !menu.contains(event.target)) menu.open=false; });
  window.addEventListener('keydown', event => {
    if (event.code==='Escape' && menu.open && !event.repeat) {
      menu.open=false;
      menu.querySelector('summary').focus();
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyC' && !event.repeat) switchView();
    if (event.code === 'KeyF' && !event.repeat) changeFlightMode();
    if (!event.repeat && event.code.startsWith('Shift')) shift(1);
    if (!event.repeat && event.code.startsWith('Control')) shift(-1);
    if (!event.repeat && event.code === 'KeyH') headlights = (headlights+1)%3;
    if (!event.repeat && !options.modalOpen && event.code === 'KeyL') {
      settings.cabinLight = settings.cabinLight === 'On' ? 'Off' : 'On';
      options.save();
    }
    if (!event.repeat && !options.modalOpen && event.code === 'KeyR') {
      settings.wipers = settings.wipers === 'Off' ? 'Auto' : 'Off';
      options.save();
    }
    if (!event.repeat && event.code === 'KeyQ') signal = signal === -1 ? 0 : -1;
    if (!event.repeat && event.code === 'KeyE') signal = signal === 1 ? 0 : 1;
    if (event.code === 'Escape' && started && !crashed && (!activeMission || activeMission.status === 'active') && !event.repeat && !options.modalOpen && (!rooms.active || rooms.canDrive)) setPlaying(!playing);
    const verticalKey = event.code==='KeyT' || event.code==='KeyG';
    if (!playing || !inputs.has(event.code) || (verticalKey && !flight.active)) return;
    event.preventDefault();
    if (!event.repeat) rollWithArrow(event.code);
    if (event.code==='Space' && !event.repeat) pullBrakeUntil=performance.now()+390;
    held.add(event.code);
  });
  window.addEventListener('keyup', event => held.delete(event.code));
  window.addEventListener('blur', () => { if (playing) setPlaying(false); });
  window.addEventListener('pagehide',saveSolo);
  document.addEventListener('visibilitychange',()=>{ if (document.hidden && playing) setPlaying(false); });
  const resize = () => {
    camera.aspect = viewport.clientWidth / Math.max(1,viewport.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    effects.resize(viewport.clientWidth,viewport.clientHeight);
  };
  window.addEventListener('resize', resize);
  resize();
  if (settings.soloRun) restoreSolo();
  const initialVehicle = vehicles[settings.selected];
  drawGauges(car.gauges,0,true,rpm,initialVehicle.electric ? 'EV' : gear,0,initialVehicle.speed);

  const eye = new T.Vector3();
  const aim = new T.Vector3();
  const mirrorOffset = new T.Vector3();
  const rearView = new T.PerspectiveCamera(47,2,.16,200);
  let frame = 0, mirrorIndex = 0, quality = '', neighborhoodLight = .88;
  const previous = {distance:0,x:0,speed:0};
  const stepScene = now => {
    const frameSeconds = (now-(lastTime||now))/1000;
    const clockDelta = Math.min(frameSeconds,.25);
    const dt = Math.min(frameSeconds,.05);
    lastTime = now;
    const selected = rooms.active ? rooms.vehicle : settings.selected;
    const vehicle = vehicles[selected];
    requestModel(selected);
    const size = playerSizes[selected];
    if (quality !== settings.quality) {
      quality = settings.quality;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, { Low: 1.0, Medium: 1.65, High: 2.35, Ultra: 3.0 }[quality] || 2.35));
      resize();
    }
    const progress = rooms.active ? rooms.route : routeProgress;
    const district = districtAt(distance,progress);
    const missionActive = activeMission?.status === 'active' && !rooms.active;
    const climate = missionActive
      ? { weather: activeMission.spec.weather, daylight: activeMission.spec.daylight }
      : weatherAt(rooms.active ? rooms.elapsed : gameTime,rooms.active ? 'Dynamic' : settings.weather);
    const snowy = district.kind==='ice' || climate.weather==='Snow';
    const weather = snowy ? 'Snow' : district.kind==='desert' ? 'Clear' : climate.weather;
    const {daylight} = climate;
    const wet = {'Clear':0,'Light rain':.42,'Heavy rain':.78,'Thunderstorm':1,'Snow':0}[weather];
    if (snowy || district.kind === 'desert') {
      roadWetHold = 0;
      roadWetPeak = 0;
      roadWet = T.MathUtils.damp(roadWet,0,1.5,dt);
    } else if (wet > 0) {
      roadWetHold = 60;
      roadWetPeak = Math.max(roadWetPeak,wet);
      roadWet = T.MathUtils.damp(roadWet,roadWetPeak,1.6,dt);
    } else if (roadWetHold > 0) {
      roadWetHold = Math.max(0,roadWetHold-(playing ? dt : 0));
      roadWet = T.MathUtils.damp(roadWet,Math.max(.48,roadWetPeak*.85),2.2,dt);
    } else {
      roadWetPeak = 0;
      roadWet = T.MathUtils.damp(roadWet,0,.45,dt);
    }
    const traction = snowy ? .78 : 1;
    const handbrake = Number(playing && has('Space'));
    const previousHeight = flight.height;
    for (const button of handbrakeButtons) {
      const pressed = String(Boolean(handbrake));
      if (button.getAttribute('aria-pressed')!==pressed) button.setAttribute('aria-pressed',pressed);
    }
    let engineLoad = 0, suspensionLoad = 0, suspensionSteer = 0, accelerating = false, usedBrake = false;
    previous.distance = distance;
    previous.x = x;
    previous.speed = speed;
    if (playing && (!rooms.active || rooms.canDrive)) {
      gameTime += clockDelta;
      const steeringInput = Number(has('KeyD','ArrowRight')) - Number(has('KeyA','ArrowLeft'));
      const wheelInput = settings.controllerStyle==='Wheel' ? touchWheel.input : null;
      const target = steeringInput || (wheelInput ?? (settings.steering==='Tilt' && tiltReady ? tilt : 0));
      steering = T.MathUtils.damp(steering,target,(target === 0 ? 18 : 16)*traction,dt);
      const automatic = vehicle.electric || settings.transmission === 'Automatic';
      const maximumSpeed = !automatic && vehicle.manualSpeed ? vehicle.manualSpeed : vehicle.speed;
      const limit = maximumSpeed/3.6;
      const clutch = automatic ? 1 : T.MathUtils.smoothstep(now-lastShift,65,335);
      const wantsThrottle = has('KeyW','ArrowUp');
      const braking = Number(has('KeyS','ArrowDown'));
      usedBrake = Boolean(braking || handbrake);
      const throttleOn = wantsThrottle && !braking && !handbrake;
      accelerating = throttleOn;
      accelerator=T.MathUtils.damp(accelerator,Number(throttleOn),throttleOn ? 3.25 : 11,dt);
      const throttle = throttleOn ? accelerator : 0;
      if (vehicle.flight && !rooms.active) {
        advanceFlight(flight,dt,Number(has('KeyT'))-Number(has('KeyG')));
      }
      engineLoad = throttle*clutch;
      ({speed,gear,rpm} = advanceDrive({speed,gear,rpm},vehicle,{dt,throttle,braking,handbrake,wet,limit,automatic,clutch,traction}));
      suspensionLoad = dt > 0 ? (speed-previous.speed)/dt : 0;
      suspensionSteer = steering;
      ({yaw,yawRate,lateralSpeed,steerAngle:steerScale} = advanceSteering(
        {yaw,yawRate,lateralSpeed},target,
        {dt,speed,grip:vehicle.grip,wet,sensitivity:settings.steeringSensitivity,traction,handbrake}
      ));
      distance += speed*Math.cos(yaw)*dt;
      const limitX = roadLimit-1.18;
      const nextX = x+lateralSpeed*dt;
      if (Math.abs(nextX) >= limitX) {
        x = T.MathUtils.clamp(nextX,-limitX,limitX);
        if (Math.sign(lateralSpeed) === Math.sign(nextX)) lateralSpeed = 0;
        if (Math.sign(-yaw) === Math.sign(nextX)) { yaw *= Math.exp(-dt*14); yawRate = 0; }
      } else {
        x = nextX;
      }
      car.wheel.rotation.z = -steering * 1.68;
      if (mode === 0 && now-lastGauge > 55) {
        drawGauges(car.gauges,Math.abs(speed),headlights,rpm,vehicle.electric ? 'EV' : gear < 0 ? 'R' : gear === 0 ? 'N' : gear,
          Math.floor(now/410)%2 ? signal : 0,maximumSpeed);
        lastGauge = now;
      }
      rooms.send(now,{distance,x,speed,steering,turn:yaw,headlights:headlights>0,signal});
    }
    updateController(vehicle);
    const model = exteriorModels[selected];
    const trafficContactPossible = Math.min(previousHeight,flight.height)<trafficClearance && now >= impactGraceUntil;
    traffic.update(playing ? dt : 0,distance,x,rooms.active ? 0 : settings.traffic,playing && trafficContactPossible,speed,model.footprint,yaw,previous,() => {
      if (flight.height<.1) {
        award(5);
        if (activeMission?.status === 'active') activeMission.closeOvertakes++;
        showToast('+5 NEAR PASS!', 950);
      }
    }, (contact, hitCar) => {
      if (activeMission?.status === 'active') {
        traffic.blinkAndHide(hitCar);
        if (activeMission.spec.objectives.noScratch) {
          activeMission.scratched = true;
          failMission('Car scratched in No-Scratch mission!');
          return;
        }
        impactGraceUntil = now + 700;
        const away = x >= (hitCar?.offset ?? x) ? 1 : -1;
        x = T.MathUtils.clamp(x + away * .55, -roadLimit + 1.18, roadLimit - 1.18);
        speed *= .64;
        yaw *= .4;
        yawRate = lateralSpeed = 0;
        audio.tick(95, .28, .22, 'sawtooth');
        showToast('NPC CONTACT · SLOWED!', 1000);
        if (hitFlash) {
          hitFlash.classList.add('is-active');
          clearTimeout(hitFlashTimer);
          hitFlashTimer = setTimeout(() => hitFlash.classList.remove('is-active'), 220);
        }
        return;
      }
      const relSpeed = Math.max(0, speed - (hitCar?.speed ?? 0));
      const dx = Math.abs(x - (hitCar?.offset ?? x));
      const halfW = ((hitCar?.footprint?.width ?? 2) + model.footprint.width) * .5;
      const crossingOrLight = Math.abs(yaw) > .014 || dx > halfW * .40 || relSpeed < 26;
      const damage = crossingOrLight ? 0 : 25;
      if (damage === 0 || health > damage) {
        traffic.blinkAndHide(hitCar);
        if (damage > 0) health = Math.max(0, health - damage);
        impactGraceUntil = now + 850;
        const away = x >= (hitCar?.offset ?? x) ? 1 : -1;
        x = T.MathUtils.clamp(x + away * .68, -roadLimit + 1.18, roadLimit - 1.18);
        speed *= damage === 0 ? .82 : .72;
        yaw *= .35;
        yawRate = lateralSpeed = 0;
        updateDurability();
        audio.tick(95, .24, .18, 'sawtooth');
        showToast(damage === 0 ? 'CLOSE BRUSH · SLOWED!' : `IMPACT · ${Math.round(health)}% CAR`, 1050);
        if (hitFlash) {
          hitFlash.classList.add('is-active');
          clearTimeout(hitFlashTimer);
          hitFlashTimer = setTimeout(() => hitFlash.classList.remove('is-active'), 220);
        }
        return;
      }
      traffic.blinkAndHide(hitCar);
      health = 0;
      updateDurability();
      distance = T.MathUtils.lerp(previous.distance,distance,contact);
      x = T.MathUtils.lerp(previous.x,x,contact);
      crash();
    });
    if (playing && !rooms.active && !activeMission && health < 100) {
      health = Math.min(100, health + dt * 5);
      updateDurability();
    }
    if (missionActive) {
      actors.update(playing ? dt : 0, now, distance, x, speed, traffic.getActive());
      if (playing && activeMission?.status === 'active') stepMission(dt, now, usedBrake);
    }
    if (playing && !rooms.active) {
      soloDirty=true;
      awardDistance();
      advanceRoute(routeProgress,distance,speed,clockDelta);
      if (now-lastRunSave>=2500) {
        lastRunSave=now;
        saveSolo();
      }
    }
    const districtLight = updateRoad(distance,roadWet,progress,now,daylight,neighborhoodLight);
    animateBirds(district.kind,distance,daylight,now);
    neighborhoodLight = T.MathUtils.damp(neighborhoodLight,districtLight,2.8,dt);
    rooms.render(distance,dt);
    const beamGlare = lightTraffic(distance,x,roadWet,mode===0,daylight);
    const heading = roadYaw(distance);
    const airborne = Math.min(flight.height/3,1);
    rig.position.set(x*Math.cos(heading),flight.height,-x*Math.sin(heading));
    rig.rotation.set(flight.velocity*.017*airborne,yaw+heading,-steering*.22*airborne,'YXZ');
    suspension.update(model.sprung,dt,suspensionLoad,suspensionSteer,speed,size,vehicle.type==='SUV',model.sprung!==model.body);
    model.animateWheels((distance-previous.distance)*(1-airborne),suspensionSteer*steerScale);
    const roll = flightRollAngle(flight);
    car.exterior.rotation.z = roll;
    car.exterior.position.set(.65*Math.sin(roll),.65*(1-Math.cos(roll)),0);
    liftJets.scale.y = 1 + .14*Math.sin(now*.034);
    playerLightbar.visible = Boolean(missionActive && activeMission.spec.mode === 'police_chase');
    if (playerLightbar.visible) {
      playerLightbar.position.set(0, size.height - .05, -.05);
      animateLightbar(playerLightbar, now);
    }
    for (const object of car.exterior.children) {
      object.visible=object===model.body || (object===liftJets && (flight.active || flight.height>.15)) || (object===playerLightbar && playerLightbar.visible);
    }
    const tall = vehicle.type === 'SUV' ? .34 : vehicle.type === 'Sports car' ? -.10 : 0;
    car.cabin.position.y = tall;
    car.cabinLight.intensity = settings.cabinLight === 'On' ? 2.4 : 0;
    const side = settings.driveSide === 'Left-hand drive' ? -1 : 1;
    if (mode === 0) car.pose(side,now,dt,gear,settings.transmission === 'Manual',vehicle,
      Boolean(handbrake) || now<pullBrakeUntil,settings.cigarette==='On' && playing);
    rig.updateMatrixWorld(true);
    car.cabin.visible = mode === 0;
    car.exterior.visible = mode !== 0;
    const bob = playing ? Math.sin(now*.019)*Math.min(Math.abs(speed)/3200,.014) : 0;
    const targetZoom = !playing ? 0 : accelerating ? .42 : -.28;
    chaseZoom = T.MathUtils.damp(chaseZoom,targetZoom,accelerating ? 4.5 : 5.2,dt);
    chaseHeading = T.MathUtils.damp(chaseHeading,heading+yaw*.52,7.5,dt);
    chaseLateral = T.MathUtils.damp(chaseLateral,x,16,dt);
    chaseAltitude = T.MathUtils.damp(chaseAltitude,flight.height,12,dt);
    if (mode === 0) {
      eye.set(side*.385,1.397+bob+tall,.47);
      aim.set(side*.24,.43+bob+tall*.55,-9.6);
      camera.position.copy(rig.localToWorld(eye));
      camera.lookAt(rig.localToWorld(aim));
      camera.rotateZ(-steering*Math.min(Math.abs(speed)/650,.042));
    } else if (mode === 1) {
      eye.set(0, 1.12+bob+tall, -size.length*.365);
      aim.set(0, .9, -14);
      camera.position.copy(rig.localToWorld(eye));
      camera.lookAt(rig.localToWorld(aim));
    } else {
      chasePose(eye,aim,settings,size.height,bob*.35,chaseZoom);
      const cos = Math.cos(chaseHeading), sin = Math.sin(chaseHeading);
      const eyeX = eye.x, eyeZ = eye.z;
      camera.position.set(
        chaseLateral*cos + eyeX*cos + eyeZ*sin,
        chaseAltitude + eye.y,
        -chaseLateral*sin + eyeZ*cos - eyeX*sin,
      );
      const station = distance-camera.position.z;
      const center = roadX(station)-roadX(distance);
      const edge = (roadLimit+2.6)*Math.cos(roadYaw(station));
      camera.position.x = T.MathUtils.clamp(camera.position.x,center-edge,center+edge);
      const aimLateral = T.MathUtils.lerp(chaseLateral,x,.72);
      const aimX = aim.x, aimZ = aim.z;
      aim.set(
        aimLateral*cos + aimX*cos + aimZ*sin,
        chaseAltitude + aim.y,
        -aimLateral*sin + aimZ*cos - aimX*sin,
      );
      camera.lookAt(aim);
    }
    rain.update(wet,Math.abs(speed),dt,1.8+tall);
    snow(snowy,speed,dt,now,1.8+tall);
    if (wet > 0 && playing && settings.wipers !== 'Off') {
      sweep += dt*(settings.wipers === 'Fast' ? 7.4 : 2.2+wet*3.05+Math.min(Math.abs(speed)*.07,2.2));
    } else if (sweep%(2*Math.PI) > 1e-6) {
      sweep = Math.min(sweep+dt*5.5,Math.ceil(sweep/(2*Math.PI))*(2*Math.PI));
    }
    for (const wiper of car.wipers) wiper.rotation.z = bladeAngle(sweep);
    car.updateGlass(now,mode===0 ? wet : 0,speed,sweep);
    const flash = weather === 'Thunderstorm' ? Math.pow(Math.max(0, Math.cos(gameTime*.57)), 180) : 0;
    const sunBlend = daylight * (1 - wet * .55);
    updateSky(snowy ? .53 : wet,neighborhoodLight,flash,daylight,rooms.active ? rooms.elapsed : gameTime);
    scene.fog.color.copy(forestFog).lerp(townFog,neighborhoodLight).lerp(snowy ? snowFog : dayFog,daylight*.92);
    scene.fog.density = Math.max(.0020, .0066+wet*.0034+(snowy ? .0026 : 0)-daylight*.0042);
    ambient.color.copy(nightSky).lerp(sunSky, sunBlend);
    ambient.groundColor.copy(nightGround).lerp(sunGround, sunBlend);
    ambient.intensity = .22+neighborhoodLight*.46+daylight*.56;
    scene.environmentIntensity = .14+neighborhoodLight*.08+daylight*.18;
    key.color.copy(nightKeyColor).lerp(sunColor, sunBlend);
    key.intensity = .12+neighborhoodLight*.28+daylight*(1.48-wet*.65);
    moon.intensity = (.19+neighborhoodLight*.33)*(1-wet*.85)*(1-daylight)+flash*4.5;
    renderer.toneMappingExposure = 1 - daylight*.16;
    for (const beam of beams) {
      beam.intensity = [0,620,1330][headlights]*beamGlare*(1-daylight*.86);
      beam.target.position.z = headlights === 2 ? -46 : -29;
    }
    const acceleration = dt > 0 ? (Math.abs(speed)-Math.abs(previous.speed))/dt : 0;
    audio.update(playing,rpm,wet,Math.abs(speed),settings.audio==='Muted',vehicle,engineLoad,acceleration,gear);
    if (playing) {
      if (!vehicle.electric && gear !== lastGear) audio.tick(140,.13,.13,'triangle');
      lastGear = gear;
      const wipe = Math.floor(sweep/Math.PI);
      if (wet && wipe !== lastWipe) audio.tick(85,.033,.19,'triangle');
      lastWipe = wipe;
      if (signal && now-lastTick > 410) { audio.tick(510,.07,.05,'triangle'); lastTick = now; }
      if (flash>.8 && !lastFlash && gameTime>1) audio.tick(40,.55,1.8,'sawtooth');
      lastFlash = flash>.8;
    }
    const baseFov = camera.aspect < 1.25 ? 74 : 63;
    const fov = baseFov + (mode === 2 ? Math.min(Math.abs(speed)*.022,2.0) : Math.abs(speed)*.055);
    if (Math.abs(camera.fov - fov) > .015) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (garagePanel.open || renderer.getContext().isContextLost()) return;
    if (mode === 0 && ++frame % ({ Low: 4, Medium: 2, High: 1, Ultra: 1 }[quality] || 1) === 0) {
      car.cabin.visible = false;
      const mirror = car.mirrors[mirrorIndex++ % car.mirrors.length];
      rearView.position.copy(rig.localToWorld(eye.copy(mirror.position).add(mirrorOffset.set(0,tall,.2))));
      const target = aim.copy(mirror.position).add(mirror.look);
      target.y += tall;
      rearView.lookAt(rig.localToWorld(target));
      renderer.setRenderTarget(mirror.target);
      renderer.render(scene,rearView);
      renderer.setRenderTarget(null);
      car.cabin.visible = true;
    }
    if (quality !== 'High' && quality !== 'Ultra') renderer.render(scene,camera);
    else effects.render(now,Math.abs(speed),quality,daylight);
  };
  setLoading(90, 'Preparing driving view…');
  stepScene(performance.now());
  if (plants?.trees?.length) {
    const warmFoliage = new T.Group();
    warmFoliage.position.set(0, -10, -25);
    for (const part of plants.trees[0].parts) {
      warmFoliage.add(new T.Mesh(part.geometry, part.material), new T.Mesh(part.geometry, part.winter));
    }
    scene.add(warmFoliage);
    renderer.compile(scene,camera);
    scene.remove(warmFoliage);
  } else {
    renderer.compile(scene,camera);
  }
  window.__afterlane = () => {
    const cars = [];
    traffic.visitVisible(car => cars.push({
      station: car.station,
      offset: car.offset,
      target: car.target,
      speed: car.speed,
      length: car.footprint.length,
      width: car.footprint.width,
    }));
    return {
      playing, started, crashed, distance, speed, x, points, gear, rpm, mode,
      headlights, signal, flightHeight: flight.height,
      roadWet: +roadWet.toFixed(3), roadWetHold: +roadWetHold.toFixed(1),
      health,
      mission: activeMission ? {
        id: activeMission.spec.id, mode: activeMission.spec.mode, title: activeMission.spec.title, status: activeMission.status,
        remaining: +activeMission.remaining.toFixed(1), closeOvertakes: activeMission.closeOvertakes,
        speedHeld: +activeMission.speedHeld.toFixed(1), scratched: activeMission.scratched,
        takedowns: activeMission.takedowns, interceptPct: Math.round(activeMission.interceptPct),
        bustPct: Math.round(activeMission.bustPct),
        policeGap: Number.isFinite(activeMission.policeGap) ? Math.round(activeMission.policeGap) : null,
        suspectGap: Number.isFinite(activeMission.suspectGap) ? Math.round(activeMission.suspectGap) : null,
        rank: activeMission.rank,
      } : null,
      district: districtAt(distance, rooms.active ? rooms.route : routeProgress).name,
      wipers: settings.wipers, cabinLight: settings.cabinLight,
      vehicle: vehicles[rooms.active ? rooms.vehicle : settings.selected]?.name,
      traffic: cars,
    };
  };
  setTimeout(()=>{
    const idle = () => !playing && !garagePanel.open && !options.editingControls;
    updateRoad.prewarmRemaining?.(idle);
    traffic.preload(idle);
  },400);
  renderer.setAnimationLoop(stepScene);
}
