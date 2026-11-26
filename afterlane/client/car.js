import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wetGlass } from './glass.js';
import { dimensions } from './vehicle-specs.js';
import { buildSmoke } from './smoke.js';
import { rigBmwWheels, rigNamedWheels } from './wheel-motion.js';
import { gearGate } from './touch-controls.js';
import { loadCachedModel } from './model-cache.js';

export const group = (parent, x = 0, y = 0, z = 0) => {
  const object = new T.Group();
  object.position.set(x, y, z);
  parent.add(object);
  return object;
};
export const surface = (color, roughness = .75, metalness = 0) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
export const luminous = color => new T.MeshBasicMaterial({ color });
export function mesh(parent, geometry, material, x, y, z) {
  const part = new T.Mesh(geometry, material);
  parent.add(part);
  part.position.set(x, y, z);
  return part;
}
export function configureTexture(texture, maxSize = 1024, maxAniso = 4) {
  if (!texture || !texture.isTexture) return texture;
  if (!texture.isDataTexture && !texture.isRenderTargetTexture) {
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(texture.anisotropy || maxAniso, maxAniso);
    if (typeof document !== 'undefined' && texture.image) {
      const w = texture.image.width || texture.image.naturalWidth || 0;
      const h = texture.image.height || texture.image.naturalHeight || 0;
      if (w > maxSize || h > maxSize) {
        const scale = maxSize / Math.max(w, h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
          texture.image = canvas;
          texture.needsUpdate = true;
        }
      }
    }
  }
  return texture;
}

export const box = (parent, material, x, y, z, w, h, d) =>
  mesh(parent, new T.BoxGeometry(w, h, d), material, x, y, z);

export function batchMeshes(parent, vertexColorBucket = false) {
  const materials = new Map();
  for (const part of [...parent.children]) {
    if (!part.isMesh || part.material.transparent || part.userData.noBatch) continue;
    part.updateMatrix();
    let key = part.material;
    if (vertexColorBucket && part.material?.isMeshStandardMaterial && !part.material.map) {
      key = '__vertex__';
    }
    if (!materials.has(key)) materials.set(key, { material: key === '__vertex__' ? null : part.material, geoms: [] });
    let g = part.geometry.index && key === '__vertex__' ? part.geometry.toNonIndexed() : part.geometry.clone();
    g.applyMatrix4(part.matrix);
    if (key === '__vertex__') {
      const col = part.material.color;
      const count = g.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        colors[o] = col.r; colors[o + 1] = col.g; colors[o + 2] = col.b;
      }
      g.setAttribute('color', new T.BufferAttribute(colors, 3));
      for (const attr of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'color'].includes(attr)) g.deleteAttribute(attr);
      }
    }
    materials.get(key).geoms.push(g);
    if (!part.userData.keepGeom && !part.userData.sharedVehicleGeometry) {
      part.geometry.dispose();
    }
    parent.remove(part);
  }
  for (const [key, { material, geoms }] of materials) {
    const mat = material ?? new T.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .16 });
    const keepAttrs = Object.keys(geoms[0].attributes).filter(attr =>
      geoms.every(g => Boolean(g.attributes[attr]))
    );
    const normalized = geoms.map(g => {
      for (const attr of Object.keys(g.attributes)) {
        if (!keepAttrs.includes(attr)) g.deleteAttribute(attr);
      }
      return g;
    });
    const merged = mergeGeometries(normalized, false);
    normalized.forEach(geometry => geometry.dispose());
    if (merged) mesh(parent, merged, mat, 0, 0, 0);
  }
}

function trim(parent, material, start, end, width, depth = width) {
  const a = new T.Vector3(...start);
  const b = new T.Vector3(...end);
  const mid = a.clone().lerp(b, .5);
  const bar = box(parent, material, mid.x, mid.y, mid.z, width, a.distanceTo(b), depth);
  bar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize());
}

function display(parent, x, y, z, w, h, resolutionX, resolutionY) {
  const canvas = document.createElement('canvas');
  canvas.width = resolutionX;
  canvas.height = resolutionY;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshBasicMaterial({ map: texture, toneMapped: false });
  const screen = mesh(parent, new T.PlaneGeometry(w, h), material, x, y, z);
  return { canvas, texture, screen, ctx: canvas.getContext('2d') };
}

export async function loadDriverHand() {
  try {
    const {scene} = await loadCachedModel(new GLTFLoader(),'/models/driver-hand.glb');
    return scene.children.find(part=>part.isMesh) ?? null;
  } catch (error) {
    console.warn('Driver hand model could not load.',error);
    return null;
  }
}

export function buildCar(rig,driverHand=null,mirrorWidth=256,mirrorHeight=128) {
  const exterior = group(rig);
  const cabin = group(rig);
  const rubber = surface(0x111216);
  const alloy = surface(0x86929a, .35, .72);
  const leather = surface(0x272a2e, .9);
  const padded = surface(0x393b3b, .88);
  const seam = luminous(0x9c7958);
  const accent = luminous(0xd38e4c);
  const hoodPaint = surface(0x628e99,.32,.28);
  box(cabin, leather, 0, .91, -.98, 1.88, .25, .48).rotation.x = -.09;
  box(cabin, padded, 0, 1.035, -1.03, 1.90, .08, .46).rotation.x = -.09;
  box(cabin, padded, 0, 1.045, -1.17, 1.86, .10, .18);
  box(cabin, accent, 0, .979, -.751, 1.82, .007, .01);
  box(cabin, rubber, 0, .505, -.08, 1.92, .073, 2.28);
  box(cabin, leather, 0, .71, -1.03, 1.92, .45, .22);
  box(cabin, leather, 0, .98, .96, 1.88, 1.05, .14);
  const hood = box(cabin,hoodPaint,0,.955,-1.58,1.75,.092,.96);
  hood.rotation.x = -.055;
  hood.userData.noBatch = true;
  const hoodStripe = box(hood,surface(0x1266cc,.28),0,.047,0,.16,.003,.957);
  box(cabin, leather, 0, 1.65, .36, 1.69, .10, 1.56);
  box(cabin, padded, 0, 1.60, -.49, 1.66, .067, .29);
  const cabinLight = new T.PointLight(0xeab88e, 2.4, 1.35, 2);
  cabinLight.position.set(.02, 1.39, .08);
  cabin.add(cabinLight);
  for (const side of [-1, 1]) {
    trim(cabin, padded, [side*.9,1,-1.15], [side*.76,1.59,-.62], .093, .09);
    trim(cabin, leather, [side*.76,1.57,-.63], [side*.82,1.56,.92], .10);
    box(cabin, leather, side*.91, .76, -.02, .14, .56, 2.26);
    box(cabin, leather, side*.89, .76, -1.03, .16, .62, .40);
    box(cabin, padded, side*.86, 1.025, .06, .14, .055, 2.12);
    box(cabin, padded, side*.778, 1.048, -.11, .20, .034, .59);
    box(cabin, accent, side*.835, .967, -.12, .008, .007, 1.28);
    box(cabin, alloy, side*.823, .921, -.29, .014, .027, .16);
    box(cabin, leather, side*.47, .56, .42, .46, .18, .61);
    box(cabin, padded, side*.47, .855, .74, .46, .58, .13).rotation.x = .13;
    box(cabin, leather, side*.47, 1.195, .78, .28, .19, .105);
  }

  box(cabin, leather, 0, .69, -.04, .29, .22, 1.07);
  const shifter = group(cabin,.11,.811,-.26);
  const brakeMount = group(cabin,.15,.821,.175);
  box(brakeMount,alloy,0,0,-.106,.084,.025,.255);
  const parkingLever = group(brakeMount,0,.015,.02);
  parkingLever.name = 'Parking brake lever';
  box(parkingLever,rubber,0,.018,-.101,.067,.052,.244);
  box(parkingLever,padded,0,.025,-.225,.068,.056,.106);
  box(parkingLever,alloy,0,.025,-.283,.036,.027,.016);
  const brakeHandle = group(parkingLever,0,.044,-.213);
  box(shifter,alloy,0,.007,0,.154,.018,.21);
  box(shifter,rubber,0,.017,0,.134,.017,.189);
  const lever = group(shifter,0,.028,0);
  for (let rib=0;rib<4;rib++) {
    const size = .053-rib*.009;
    mesh(lever,new T.CylinderGeometry(size*.86,size,.024,12),leather,0,.008+rib*.017,0);
  }
  mesh(lever,new T.CylinderGeometry(.012,.014,.18,16),alloy,0,.12,0);
  const knob = mesh(lever,new T.SphereGeometry(.046,20,16),leather,0,.218,0);
  knob.scale.set(1,.98,.90);
  mesh(lever,new T.CylinderGeometry(.032,.025,.012,20),alloy,0,.247,0);
  const pattern = display(lever,0,.265,0,.058,.058,180,180);
  pattern.screen.geometry.dispose();
  pattern.screen.geometry = new T.CircleGeometry(.032,24);
  pattern.screen.rotation.x = -Math.PI/2;
  pattern.screen.userData.noBatch = true;
  batchMeshes(lever, true);
  batchMeshes(parkingLever, true);
  const patternCtx = pattern.ctx;
  function drawPattern({columns,slots}) {
    const xFor = x=>20+x*140;
    const yFor = y=>30+y*120;
    patternCtx.fillStyle = '#171e23';
    patternCtx.fillRect(0,0,180,180);
    patternCtx.strokeStyle = '#abb9c2';
    patternCtx.lineWidth = 3;
    patternCtx.beginPath();
    patternCtx.moveTo(xFor(columns[0].x),90);
    patternCtx.lineTo(xFor(columns.at(-1).x),90);
    for (const column of columns) {
      const x = xFor(column.x);
      patternCtx.moveTo(x,column.up===null ? 90 : 65);
      patternCtx.lineTo(x,column.down===null ? 90 : 115);
    }
    patternCtx.stroke();
    patternCtx.font = 'bold 19px monospace';
    patternCtx.textAlign = 'center';
    patternCtx.textBaseline = 'middle';
    for (const [number,{x,y}] of slots) {
      if (number===0) continue;
      patternCtx.fillStyle = number===-1 ? '#ffba76' : '#f1f3ed';
      patternCtx.fillText(number===-1 ? 'R' : String(number),xFor(x),yFor(y));
    }
    pattern.texture.needsUpdate = true;
  }
  const gaugeFrame = box(cabin, rubber, .46, 1.073, -.789, .55, .21, .105);
  gaugeFrame.userData.noBatch = true;
  const gauges = display(cabin, .46, 1.067, -.731, .50, .164, 768, 252);
  gauges.screen.userData.noBatch = true;
  box(cabin, rubber, 0, 1.041, -.78, .40, .217, .092);
  const info = display(cabin, 0, 1.041, -.731, .364, .173, 420, 200);
  info.screen.userData.noBatch = true;
  for (const x of [-.68, -.42, -.20, .79]) {
    box(cabin, rubber, x, .933, -.749, .17, .057, .012);
    for (let i = 0; i < 4; i++) box(cabin, alloy, x, .914 + i*.012, -.741, .15, .0025, .003);
  }
  trim(cabin, leather, [0,1.60,-.41], [0,1.459,-.839], .04);
  box(cabin, rubber, 0, 1.46, -.843, .33, .094, .025);
  const mirrors = [];
  function mirror(x,y,z,w,h,look,yaw) {
    const target = new T.WebGLRenderTarget(mirrorWidth,mirrorHeight);
    target.texture.generateMipmaps = false;
    const material = new T.MeshBasicMaterial({map:target.texture,toneMapped:false});
    const face = mesh(cabin,new T.PlaneGeometry(w,h),material,x,y,z);
    face.userData.noBatch = true;
    const uv = face.geometry.attributes.uv;
    for (let i=0;i<uv.count;i++) uv.setX(i,1-uv.getX(i));
    face.rotation.y = yaw;
    mirrors.push({target,position:new T.Vector3(x,y,z),look:new T.Vector3(look,-.035,1)});
  }
  mirror(0,1.46,-.826,.31,.073,0,0);
  for (const side of [-1,1]) {
    box(cabin,rubber,side*1.03,1.125,-.63,.26,.109,.092);
    mirror(side*1.03,1.125,-.581,.25,.091,side*.44,-side*.16);
  }
  const updateGlass = wetGlass(cabin);
  const wipers = [-.48,.41].map(x => {
    const mount = group(cabin,x,1.055,-1.156);
    mount.rotation.x = Math.PI/4;
    const pivot = group(mount);
    box(pivot,rubber,.29,0,0,.57,.015,.014);
    box(pivot,leather,.431,.006,0,.395,.018,.016);
    return pivot;
  });

  const column = group(cabin, .46, .945, -.385);
  column.rotation.x = -.22;
  const wheel = group(column);
  mesh(wheel, new T.TorusGeometry(.166,.024,18,96), leather,0,0,0);
  mesh(wheel, new T.TorusGeometry(.151,.0015,6,96), padded,0,0,.015);
  for (let i = 0; i < 72; i++) {
    const a = i * Math.PI / 36;
    const stitch = box(wheel, seam, Math.cos(a)*.155, Math.sin(a)*.155, .020, .004, .0015, .002);
    stitch.rotation.z = a + .55;
  }
  for (const end of [[-.15,.028,0], [.15,.028,0], [-.08,-.13,0], [.08,-.13,0]]) {
    trim(wheel, leather, [0,0,0], end, .029, .029);
  }
  const hub = mesh(wheel, new T.SphereGeometry(.073,24,16), padded,0,0,.007);
  hub.scale.set(1,.74,.31);
  box(wheel, alloy, 0, 0, .03, .033, .009, .003);
  const emblem = display(wheel,0,0,.034,.061,.023,240,90);
  emblem.screen.userData.noBatch = true;
  batchMeshes(wheel, true);
  emblem.ctx.fillStyle = '#272a2e';
  emblem.ctx.fillRect(0,0,240,90);
  emblem.ctx.strokeStyle = '#d5dce2';
  emblem.ctx.lineWidth = 5;
  emblem.ctx.strokeRect(5,7,230,76);
  emblem.ctx.fillStyle = '#d5dce2';
  emblem.ctx.textAlign = 'center';
  emblem.ctx.font = 'bold 43px sans-serif';
  emblem.ctx.fillText('BMW',120,61);
  emblem.texture.needsUpdate = true;
  const sleeve = surface(0x314250);
  const skin = surface(0xb98777,.83);
  const joints = new T.SphereGeometry(1,14,10);
  const arms = new T.CylinderGeometry(.036,.057,1,16);
  function hand() {
    const model = group(cabin);
    if (driverHand) {
      model.add(driverHand.clone());
      return model;
    }
    mesh(model,joints,skin,0,0,.005).scale.set(.036,.022,.043);
    for (let i=0;i<4;i++) {
      const finger = mesh(model,joints,skin,(i-1.5)*.016,.002,-.033);
      finger.scale.set(.0095,.013,.026-i*.002);
      finger.rotation.x = .25;
    }
    const thumb = mesh(model,joints,skin,.036,-.002,-.008);
    thumb.scale.set(.012,.015,.025);
    thumb.rotation.y = .5;
    return model;
  }
  const leftHand = hand(), rightHand = hand();
  leftHand.name = 'Driver left hand';
  rightHand.name = 'Driver right hand';
  rightHand.scale.x = -1;
  const paper=surface(0xeee7d4,.79), filterTip=surface(0xb88a50,.72), ember=luminous(0xf98f48);
  const cigarettes=[leftHand,rightHand].map(hand=>{
    const prop=group(hand,-.013,.017,-.048);
    prop.rotation.x=-.72;
    box(prop,filterTip,0,.008,0,.010,.019,.010);
    mesh(prop,new T.CylinderGeometry(.0049,.0049,.049,10),paper,0,.040,0);
    const tip=mesh(prop,new T.SphereGeometry(.0057,10,8),ember,0,.065,0);
    prop.visible=false;
    return {prop,tip};
  });
  const smoke=buildSmoke(cabin);
  const smokeOrigin=new T.Vector3(),breath=new T.Vector3(),face=new T.Vector3();
  let cigaretteTime=0;
  box(leftHand,rubber,0,.001,.039,.055,.032,.030);
  const watchBacking = box(leftHand,alloy,0,.023,.039,.049,.010,.034);
  watchBacking.rotation.x = -.15;
  const watch = display(leftHand,0,.029,.039,.042,.027,220,100);
  watch.screen.rotation.x = -Math.PI/2-.15;
  const dashClock = display(cabin,.319,1.155,-.729,.118,.045,220,100);
  dashClock.screen.userData.noBatch = true;
  let previousClock = '';
  const clockFormat = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function updateClock() {
    const text = clockFormat.format(new Date());
    if (previousClock === text) return;
    previousClock = text;
    for (const {ctx,texture} of [watch,dashClock]) {
      ctx.fillStyle = '#10171c';
      ctx.fillRect(0,0,220,100);
      ctx.font = 'bold 62px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#b1eaff';
      ctx.fillText(text,110,53);
      texture.needsUpdate = true;
    }
  }
  updateClock();
  const forearms = [mesh(cabin,arms,sleeve,0,0,0),mesh(cabin,arms,sleeve,0,0,0)];
  forearms[0].userData.noBatch = forearms[1].userData.noBatch = true;
  batchMeshes(cabin, true);
  const leftWheel = group(wheel,-.135,.092,.042);
  const rightWheel = group(wheel,.135,.092,.042);
  const axis = new T.Vector3(0,1,0);
  const from = new T.Vector3(), wrist = new T.Vector3(), knobPosition = new T.Vector3(), wheelPosition = new T.Vector3();
  const handlePosition = new T.Vector3();
  let patternLayout, patternGearCount = 0;
  let previousGear = 1, shiftAt = -Infinity, shiftStart = [0,0], nextClock = 0, brakeReach = 0;
  function pose(side,now,dt,gear,manual,vehicle,pullBrake,smoking=false) {
    shifter.visible = !vehicle.electric;
    manual = manual && !vehicle.electric;
    column.position.x = gauges.screen.position.x = gaugeFrame.position.x = side*.46;
    shifter.position.x = side*.105;
    brakeMount.position.x = side*.163;
    dashClock.screen.position.x = side*.319;
    hoodPaint.color.set(vehicle.color);
    hoodStripe.visible = vehicle.style === 'Touring coupe';
    emblem.screen.visible = vehicle.style === 'Touring coupe';
    if (patternGearCount!==vehicle.transmission.ratios.length) {
      patternGearCount = vehicle.transmission.ratios.length;
      patternLayout = gearGate(patternGearCount);
      drawPattern(patternLayout);
    }
    if (now >= nextClock) {
      nextClock = now+1000;
      updateClock();
    }
    if (gear !== previousGear && manual) {
      shiftAt = now;
      shiftStart = [lever.rotation.x,lever.rotation.z];
    }
    previousGear = gear;
    const slot = patternLayout.slots.get(gear) ?? patternLayout.slots.get(0);
    const tilt = manual ? (slot.y-.5)*1.06 : Math.sign(gear)*.21;
    const lateral = manual ? (.5-slot.x)*.53 : 0;
    const elapsed = manual ? now-shiftAt : Infinity;
    const shift = T.MathUtils.smoothstep(elapsed,155,320);
    lever.rotation.x = elapsed < 320 ? T.MathUtils.lerp(shiftStart[0],tilt,shift) : T.MathUtils.damp(lever.rotation.x,tilt,15,dt);
    lever.rotation.z = elapsed < 320 ? T.MathUtils.lerp(shiftStart[1],lateral,shift) : T.MathUtils.damp(lever.rotation.z,lateral,15,dt);
    const reach = T.MathUtils.smoothstep(elapsed,0,155)*(1-T.MathUtils.smoothstep(elapsed,330,560));
    brakeReach = T.MathUtils.damp(brakeReach,Number(pullBrake),pullBrake ? 13 : 9,dt);
    parkingLever.rotation.x = T.MathUtils.damp(parkingLever.rotation.x,
      pullBrake ? T.MathUtils.smoothstep(brakeReach,.46,.94)*.74 : 0,16,dt);
    cabin.updateWorldMatrix(true,false);
    cabin.worldToLocal(knob.getWorldPosition(knobPosition));
    knobPosition.y += .018;
    knobPosition.z += .021;
    cabin.worldToLocal(brakeHandle.getWorldPosition(handlePosition));
    handlePosition.y += .013;
    const consoleReach = Math.max(reach,brakeReach);
    cigaretteTime=smoking && consoleReach<.03 ? cigaretteTime+dt : 0;
    const phase=cigaretteTime%9.7;
    const raise=T.MathUtils.smoothstep(phase,5.8,6.45)*(1-T.MathUtils.smoothstep(phase,6.98,7.50));

    for (const [index,model] of [leftHand,rightHand].entries()) {
      const centerHand = index === (side === 1 ? 0 : 1);
      const handSide = index===0 ? -1 : 1;
      const wheelAnchor = index===0 ? leftWheel : rightWheel;
      if (centerHand) {
        cabin.worldToLocal(wheelAnchor.getWorldPosition(wrist));
        wrist.lerp(knobPosition,reach*(1-brakeReach)).lerp(handlePosition,brakeReach);
      }
      else {
        wrist.set(side*.730,1.079+Math.sin(now*.002)*.006,-.245);
        if (consoleReach>0) {
          cabin.worldToLocal(wheelAnchor.getWorldPosition(wheelPosition));
          wrist.lerp(wheelPosition,consoleReach);
        }
        face.set(side*.48,1.23,.116);
        wrist.lerp(face,raise);
      }
      model.position.copy(wrist);
      cigarettes[index].prop.visible=smoking&&!centerHand&&consoleReach<.15;
      const grab = centerHand ? consoleReach : 0;
      const wheelTurn = wheel.rotation.z-handSide*.22;
      model.rotation.set(.07+grab*.22+(!centerHand?raise*.77:0),handSide*(.23+grab*.39),
        centerHand ? wheelTurn*(1-grab) : T.MathUtils.lerp(side*.13,wheelTurn,consoleReach));
      from.set(side*.46+handSide*(centerHand ? .147 : .225),centerHand ? .87 : .945,.32);
      const arm = forearms[index];
      wrist.z += .046;
      arm.position.copy(from).lerp(wrist,.5);
      arm.scale.y = from.distanceTo(wrist);
      arm.quaternion.setFromUnitVectors(axis,wrist.sub(from).normalize());
    }
    const cigarette=cigarettes[side===1?1:0];
    cabin.worldToLocal(cigarette.tip.getWorldPosition(smokeOrigin));
    breath.set(side*.37,1.24,.29);
    smoke(smokeOrigin,breath,phase>=7.50&&phase<8.14,smoking&&consoleReach<.15,dt,side);
  }

  const {ctx, texture} = info;
  ctx.fillStyle = '#111920'; ctx.fillRect(0,0,420,200);
  ctx.strokeStyle = '#26343c'; ctx.lineWidth = 2;
  for (let x = 0; x < 420; x += 38) { ctx.beginPath(); ctx.moveTo(x,52); ctx.lineTo(x+45,200); ctx.stroke(); }
  ctx.fillStyle = '#ddc9a8'; ctx.font = '600 23px system-ui'; ctx.fillText('ROUTE 07',22,31);
  ctx.fillStyle = '#a8b9bf'; ctx.font = '17px system-ui'; ctx.fillText('NORTHBOUND',282,30);
  ctx.strokeStyle = '#ffc176'; ctx.lineWidth = 5; ctx.beginPath();
  ctx.moveTo(175,185); ctx.lineTo(196,141); ctx.lineTo(218,128); ctx.lineTo(240,83); ctx.lineTo(245,58); ctx.stroke();
  ctx.fillStyle = '#fff3db'; ctx.beginPath(); ctx.arc(196,141,8,0,Math.PI*2); ctx.fill();
  texture.needsUpdate = true;

  return { cabin, cabinLight, exterior, wheel, gauges, wipers, mirrors, pose, updateGlass };
}

const footprintDirections = Array.from({length:24},(_,index)=>{
  const angle = index*Math.PI/12;
  return [Math.cos(angle),Math.sin(angle)];
});

export function vehicleFootprint(model) {
  const limits = footprintDirections.map(()=>({dot:-Infinity,x:0,z:0}));
  const toParent = new T.Matrix4(), transform = new T.Matrix4();
  model.updateWorldMatrix(true,true);
  if (model.parent) toParent.copy(model.parent.matrixWorld).invert();
  model.traverse(mesh=>{
    const positions = mesh.geometry?.getAttribute('position');
    if (!mesh.isMesh || !positions || mesh.name === 'Contact shade') return;
    const m = transform.multiplyMatrices(toParent,mesh.matrixWorld).elements;
    const step = positions.count > 2400 ? Math.floor(positions.count / 1200) : 1;
    for (let i=0;i<positions.count;i+=step) {
      const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
      const x = m[0]*px+m[4]*py+m[8]*pz+m[12];
      const z = m[2]*px+m[6]*py+m[10]*pz+m[14];
      for (let j=0;j<limits.length;j++) {
        const [dx,dz] = footprintDirections[j];
        const dot = dx*x+dz*z;
        const limit = limits[j];
        if (dot > limit.dot) {
          limit.dot = dot;
          limit.x = x;
          limit.z = z;
        }
      }
    }
  });
  const points = limits.filter(({x,z},index)=>{
    const last = limits[(index+limits.length-1)%limits.length];
    return Math.hypot(x-last.x,z-last.z)>1e-5;
  }).map(({x,z})=>[x,z]);
  return {
    points,
    radius:Math.max(...points.map(([x,z])=>Math.hypot(x,z))),
    width:limits[0].x-limits[12].x,
    length:limits[6].z-limits[18].z,
  };
}

export function prepareVehicleModel(scene,vehicle) {
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if (!node.isMesh) return;
    if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const slot of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap']) {
        if (mat[slot]) configureTexture(mat[slot], 1024, 4);
      }
      if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness,.14);
      if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness,.86);
      if (typeof mat.envMapIntensity === 'number') mat.envMapIntensity = Math.min(mat.envMapIntensity,.78);
      if (mat.emissive && mat.emissive.r > .8 && mat.emissive.g > .8 && mat.emissive.b > .8) {
        mat.emissiveIntensity = Math.min(mat.emissiveIntensity ?? 1,.55);
      }
    }
  });
  const bounds = new T.Box3().setFromObject(scene);
  const size = bounds.getSize(new T.Vector3());
  if (bounds.isEmpty() || !size.toArray().every(value=>Number.isFinite(value) && value>0)) return null;
  const scale = dimensions(vehicle.type,vehicle.style).length/size.z;
  const center = bounds.getCenter(new T.Vector3());
  const model = new T.Group();
  model.add(scene);
  model.scale.setScalar(scale);
  model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const rigged = vehicle.asset==='starter-m4' ? rigBmwWheels(model) : rigNamedWheels(model);
  batchStaticGlbMeshes(rigged);
  rigged.userData.footprint = vehicleFootprint(rigged);
  return rigged;
}

function batchStaticGlbMeshes(root) {
  if (typeof document === 'undefined') return; // Keep server collision geometry intact without altering nodes.
  root.updateMatrixWorld(true);
  const wheelSet = new Set();
  root.traverse(obj => {
    if (obj.userData?.wheelRadius) {
      obj.traverse(child => wheelSet.add(child));
    }
  });
  const rootInv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const nodesToRemove = [];
  root.traverse(node => {
    if (!node.isMesh || wheelSet.has(node) || Array.isArray(node.material)) return;
    const mat = node.material;
    if (!mat || mat.transparent) return;
    if (!node.geometry?.attributes?.position) return;
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(node);
  });
  const relMatrix = new T.Matrix4();
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue;
    const raw = [];
    for (const node of list) {
      relMatrix.multiplyMatrices(rootInv, node.matrixWorld);
      let g = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      g.applyMatrix4(relMatrix);
      raw.push(g);
    }
    const commonAttrs = Object.keys(raw[0].attributes).filter(name =>
      name === 'position' || name === 'normal' || name === 'uv'
    );
    const keepAttrs = commonAttrs.filter(attr => raw.every(g => Boolean(g.attributes[attr])));
    const normalized = raw.map(g => {
      for (const attr of Object.keys(g.attributes)) {
        if (!keepAttrs.includes(attr)) g.deleteAttribute(attr);
      }
      return g;
    });
    const merged = mergeGeometries(normalized, false);
    for (const g of normalized) g.dispose();
    if (!merged) continue;
    for (const node of list) nodesToRemove.push(node);
    const combined = new T.Mesh(merged, mat);
    combined.name = list[0].name || 'Batched mesh';
    combined.userData.sharedVehicleGeometry = true;
    root.add(combined);
  }
  for (const node of nodesToRemove) {
    node.parent?.remove(node);
  }
}

const vehicleAssets = new Map();
export function loadVehicleAsset(vehicle) {
  if (!vehicleAssets.has(vehicle.asset)) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const request = loadCachedModel(loader,'/models/'+vehicle.asset+'.glb',vehicle.modelRevision)
      .then(({scene})=>prepareVehicleModel(scene,vehicle)).catch(()=>null);
    vehicleAssets.set(vehicle.asset,request);
  }
  return vehicleAssets.get(vehicle.asset);
}

const dialLabels = new Array(7);
export function drawGauges({ctx, texture}, speed, headlights, rpm = 850, gear = 1, signal = 0, maximum = 332) {
  ctx.fillStyle = '#0d1319'; ctx.fillRect(0,0,768,252);
  const dial = (x, value, labels, caption) => {
    const y = 123;
    const angle = fraction => Math.PI*(.76 + fraction*1.48);
    ctx.strokeStyle = '#5d6971'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x,y,91,angle(0),angle(1)); ctx.stroke();
    for (let i = 0; i <= 30; i++) {
      const a = angle(i/30), long = i%5 === 0;
      ctx.strokeStyle = long ? '#f2eee0' : '#76818a';
      ctx.beginPath(); ctx.moveTo(x+86*Math.cos(a),y+86*Math.sin(a));
      ctx.lineTo(x+(long?73:80)*Math.cos(a),y+(long?73:80)*Math.sin(a)); ctx.stroke();
      if (long) {
        ctx.fillStyle = '#e5e9e8'; ctx.font = '18px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(labels[i/5],x+59*Math.cos(a),y+59*Math.sin(a)+6);
      }
    }
    ctx.strokeStyle = '#ffc176'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+69*Math.cos(angle(value)),y+69*Math.sin(angle(value))); ctx.stroke();
    ctx.fillStyle = '#ffc176'; ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c2c9ce'; ctx.font = '16px system-ui'; ctx.fillText(caption,x,206);
  };
  const kmh = Math.round(speed*3.6);
  const scale = Math.ceil(maximum/60)*60;
  for (let i = 0; i < 7; i++) dialLabels[i] = i * scale / 6;
  dial(131,kmh/scale,dialLabels,'km/h');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3db'; ctx.font = '700 82px monospace'; ctx.fillText(kmh,384,143);
  ctx.fillStyle = '#adbec5'; ctx.font = '19px system-ui'; ctx.fillText('KM/H',384,173);
  ctx.fillStyle = headlights ? '#9ce5bb' : '#809197'; ctx.font = '15px system-ui';
  ctx.fillText((signal < 0 ? '◀  ' : '') + (headlights === 2 ? 'HIGH BEAM' : headlights ? 'LOW BEAM' : 'LIGHTS OFF') + (signal > 0 ? '  ▶' : ''),384,213);
  ctx.fillStyle = rpm > 5700 ? '#ff7979' : '#ffc176'; ctx.font = 'bold 20px system-ui';
  ctx.fillText(gear==='EV' ? 'ELECTRIC DRIVE' : Math.round(rpm/100)*100 + ' RPM  ·  ' + gear,624,215);
  for (const [label, value, y] of [['FUEL',.78,63], ['TEMP',.49,125]]) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#d7dee0'; ctx.font = '21px system-ui'; ctx.fillText(label,543,y);
    ctx.fillStyle = '#28353d'; ctx.fillRect(543,y+13,172,7);
    ctx.fillStyle = '#ffc176'; ctx.fillRect(543,y+13,172*value,7);
  }
  texture.needsUpdate = true;
}
