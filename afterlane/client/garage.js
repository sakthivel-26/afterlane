import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { vehicleBody } from './traffic.js';
import { vehicles } from './vehicle-specs.js';
import { gearSpeed } from './drivetrain.js';
import { loadVehicleAsset } from './car.js';

export function openGarage(settings,actions) {
  const panel = document.querySelector('#garage-panel');
  const viewport = panel.querySelector('#garage-viewport');
  const list = panel.querySelector('#garage-list');
  const modelName = panel.querySelector('#garage-car-name');
  const stats = panel.querySelector('#garage-car-stats');
  const assetStatus = panel.querySelector('#garage-model-status');
  const wallet = panel.querySelector('#garage-wallet');
  const buy = panel.querySelector('#garage-equip');
  const rotate = panel.querySelector('#garage-rotate');
  const hear = panel.querySelector('#garage-audio');
  const choices = new Map();
  let selected=0, preview=null, spinning=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene, renderer, camera, turntable, id=0, lastTime=0, angle=.75, height=2.9, drag=null;
  const models=new Map();
  const orbit=delta=>{angle+=delta;};
  function init() {
    try {
      renderer=new T.WebGLRenderer({antialias:true});
    } catch {
      viewport.textContent='3D preview unavailable';
      rotate.disabled=true;
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='Low' ? .8 : 1.25));
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFShadowMap;
    renderer.shadowMap.autoUpdate=false;
    renderer.domElement.setAttribute('aria-hidden','true');
    viewport.append(renderer.domElement);
    scene=new T.Scene();
    scene.background=new T.Color(0x121a22);
    scene.fog=new T.Fog(0x121a22,10,31);
    const studio = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(studio,.06).texture;
    scene.environmentIntensity = .82;
    studio.dispose();
    pmrem.dispose();
    camera=new T.PerspectiveCamera(40,1,.05,50);
    turntable=new T.Group();
    scene.add(turntable,new T.HemisphereLight(0xd9e7fa,0x647081,1.08));
    for (const [color,power,position,shadow] of [[0xffe6c6,2.2,[4,7,3],true],[0x9bbfff,1.75,[-3,4,-5],false]]) {
      const lamp=new T.DirectionalLight(color,power);
      lamp.position.set(...position);
      if (shadow) {
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(1024,1024);
        Object.assign(lamp.shadow.camera,{left:-3.6,right:3.6,top:3.6,bottom:-3.6,far:15});
        lamp.shadow.camera.updateProjectionMatrix();
        lamp.shadow.normalBias = .022;
        lamp.shadow.bias = -.0002;
      }
      scene.add(lamp);
    }
    const platform=new T.Mesh(new T.CylinderGeometry(3.16,3.35,.20,64),
      new T.MeshStandardMaterial({color:0x243541,roughness:.57,metalness:.34}));
    platform.position.y=-.114;
    platform.receiveShadow=true;
    scene.add(platform);
    const rim=new T.Mesh(new T.TorusGeometry(3.17,.013,6,84),new T.MeshBasicMaterial({color:0x679aac}));
    rim.rotation.x=-Math.PI/2;
    rim.position.y=-.015;
    scene.add(rim);
    const floor=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshStandardMaterial({color:0x111b24,roughness:.89}));
    floor.rotation.x=-Math.PI/2;
    floor.position.y=-.22;
    floor.receiveShadow=true;
    scene.add(floor);
    new ResizeObserver(resize).observe(viewport);
    resize();
  }
  function resize() {
    if (!renderer||!panel.open) return;
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
  }
  function frame(now) {
    if (!panel.open||!renderer) return;
    if (spinning&&!drag) orbit(Math.min((now-(lastTime||now))/1000,.04)*.43);
    lastTime=now;
    const radius=camera.aspect<1.1 ? 9.1 : 7.5;
    camera.position.set(Math.sin(angle)*radius,height,Math.cos(angle)*radius);
    camera.lookAt(0,.76,0);
    if (!renderer.getContext().isContextLost()) renderer.render(scene,camera);
    id=requestAnimationFrame(frame);
  }
  function showModel() {
    if (!renderer) return;
    if (preview) turntable.remove(preview);
    const vehicle=vehicles[selected], index=selected;
    if (!models.has(index)) {
      const stage=new T.Group();
      const placeholder=vehicleBody(stage,vehicle.type,vehicle.color,vehicle.style).body;
      placeholder.traverse(node=>{if (node.isMesh && node.name!=='Contact shade') node.castShadow=true;});
      stage.userData.ready = true;
      stage.userData.modelStatus='Loading detailed model…';
      models.set(index,stage);
      loadVehicleAsset(vehicle).then(asset=>{
        if (asset) {
          stage.remove(placeholder);
          const detailed = asset.clone(true);
          detailed.traverse(node=>{if (node.isMesh && node.name!=='Contact shade') node.castShadow=true;});
          stage.add(detailed);
          stage.userData.modelStatus = 'Detailed model loaded';
        } else {
          stage.userData.modelStatus = 'Simplified preview · detailed model file unavailable';
        }
        if (index===selected) update();
        renderer.shadowMap.needsUpdate=true;
      });
    }
    preview=models.get(index);
    turntable.add(preview);
    renderer.shadowMap.needsUpdate=true;
  }
  const sortedVehicles = vehicles
    .map((vehicle, index) => vehicle ? { vehicle, index } : null)
    .filter(Boolean)
    .sort((a, b) => a.vehicle.speed - b.vehicle.speed || a.vehicle.acceleration - b.vehicle.acceleration);

  function refreshListLabels() {
    for (const [index, choice] of choices) {
      const vehicle = vehicles[index];
      const owned = settings.owned.includes(index);
      const priceText = owned ? 'Owned'
        : vehicle.cost === 0 ? 'Free'
        : vehicle.unlockMission ? `Free on Mission ${vehicle.unlockMission} · ${vehicle.cost.toLocaleString()} pts`
        : `${vehicle.cost.toLocaleString()} pts`;
      const meta = choice.querySelector('.garage-car-meta');
      if (meta) meta.textContent = `${vehicle.speed} km/h · ${priceText}`;
    }
  }

  function update() {
    const vehicle=vehicles[selected], owned=settings.owned.includes(selected);
    const equipped=settings.selected===selected;
    modelName.textContent=vehicle.name;
    stats.textContent=[vehicle.type,vehicle.paint,
      vehicle.electric ? 'Electric drive' : Math.round(gearSpeed(vehicle,1)*3.6)+' km/h at 1st-gear redline'+(vehicle.transmission.estimated?' (est.)':''),
      (vehicle.estimatedSpeed?'Approx. ':'')+vehicle.speed+' km/h top speed',
      (!owned && vehicle.unlockMission) ? `Free on completing Mission ${vehicle.unlockMission}` : ''].filter(Boolean).join(' · ');
    assetStatus.textContent=models.get(selected)?.userData.modelStatus ?? '';
    wallet.textContent=settings.balance.toLocaleString()+' pts';
    buy.textContent=equipped?'Equipped':(owned || vehicle.cost===0)?'Equip':'Buy & equip · '+vehicle.cost.toLocaleString()+' pts';
    buy.disabled=equipped||!owned&&settings.balance<vehicle.cost;
    hear.textContent=vehicle.electric ? 'Hear motor' : 'Hear engine';
    hear.disabled=settings.audio==='Muted';
    refreshListLabels();
    for (const [i,choice] of choices) choice.setAttribute('aria-pressed',String(i===selected));
    viewport.setAttribute('aria-label',vehicle.name+' 360-degree preview. Drag or use the arrow keys to rotate.');
  }
  for (const {index,vehicle} of sortedVehicles) {
    const choice=document.createElement('button');
    choice.type='button';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'garage-car-title';
    titleSpan.textContent = vehicle.name;
    const metaSpan = document.createElement('small');
    metaSpan.className = 'garage-car-meta';
    choice.append(titleSpan, metaSpan);
    choice.addEventListener('click',()=>{
      actions.stopSound();
      selected=index;showModel();update();
    });
    list.append(choice);
    choices.set(index,choice);
  }
  buy.addEventListener('click',()=>{
    const vehicle=vehicles[selected];
    if (!settings.owned.includes(selected)) {
      if (settings.balance<vehicle.cost) return;
      settings.balance-=vehicle.cost;
      if (selected===0) settings.bmwM4Bought = true;
      settings.owned.push(selected);
    }
    settings.selected=selected;
    actions.equip();
    actions.save();
    update();
  });
  hear.addEventListener('click',()=>actions.previewSound(vehicles[selected]));
  const rotationState=()=>{
    rotate.textContent=spinning?'Pause rotation':'Start rotation';
    rotate.setAttribute('aria-pressed',String(spinning));
  };
  rotate.addEventListener('click',()=>{spinning=!spinning;rotationState();});
  viewport.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')orbit(event.key==='ArrowLeft'?-.24:.24);
    else height=T.MathUtils.clamp(height+(event.key==='ArrowUp'?.35:-.35),1.6,6.9);
  });
  viewport.addEventListener('pointerdown',event=>{
    viewport.setPointerCapture(event.pointerId);
    drag={x:event.clientX,y:event.clientY};
  });
  viewport.addEventListener('pointermove',event=>{
    if(!drag)return;
    orbit((drag.x-event.clientX)*.012);
    height=T.MathUtils.clamp(height+(event.clientY-drag.y)*.021,1.6,6.9);
    drag={x:event.clientX,y:event.clientY};
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture']) viewport.addEventListener(event,()=>{drag=null;});
  panel.querySelector('#garage-close').addEventListener('click',()=>panel.close());
  panel.addEventListener('close',()=>{
    cancelAnimationFrame(id);lastTime=0;drag=null;actions.stopSound();
  });
  rotationState();
  let prewarming = false;
  async function prewarmGarage() {
    if (prewarming) return;
    prewarming = true;
    for (const { vehicle } of sortedVehicles) {
      if (!panel.open) break;
      await loadVehicleAsset(vehicle).catch(() => null);
    }
    prewarming = false;
  }
  return () => {
    actions.pause();
    selected=settings.selected;
    panel.showModal();
    if (!renderer) init();
    showModel();update();resize();
    if(renderer) id=requestAnimationFrame(frame);
    prewarmGarage();
  };
}
