import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, configureTexture, group, luminous, mesh, surface } from './car.js';
import { getCropPattern, getCropResources, prepareRoadside } from './scenery.js';
import { debugToggles } from './debug.js';
import { desertStartDistance, districtAt, districtLight, nearestJunction, segmentLength as length } from './route.js';
import { makeBridge, makeBridgeWater } from './bridge.js';
import { pavementDetails, roadSurfaceAt, roadTextures } from './road-surfaces.js';
import { roadX, roadYaw } from './road-layout.js';
import { isMobileDevice } from './options.js';
import { loadCachedModel } from './model-cache.js';

export { roadX, roadYaw };

const count = isMobileDevice ? 18 : 20;
export const roadLimit = 7.25;

const asphalt = surface(0x686a6d);
asphalt.emissive.setHex(0x5c5e62);
asphalt.emissiveIntensity = .18;
const concrete = surface(0x82827e, .85);
asphalt.name = 'Asphalt';
concrete.name = 'Concrete';
const roadWaterUniforms = {
  uRoadWet: { value: 0 },
  uRoadOrigin: { value: 0 },
  uDaylight: { value: 0 },
  uSkyGlow: { value: 0 },
};
function enableRoadWaterReflection(material) {
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, roadWaterUniforms);
    shader.vertexShader = 'varying vec3 vRoadWorld;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vec4 roadLocal = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        roadLocal = instanceMatrix * roadLocal;
      #endif
      vRoadWorld = (modelMatrix * roadLocal).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vRoadWorld;
      uniform float uRoadWet, uRoadOrigin, uDaylight, uSkyGlow;
      float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float roadNoise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(roadHash(i),roadHash(i+vec2(1.,0.)),f.x),
          mix(roadHash(i+vec2(0.,1.)),roadHash(i+vec2(1.)),f.x),f.y);
      }
      float roadPuddle(vec2 p){
        float n = 0.62*roadNoise(p*0.095) + 0.38*roadNoise(p*0.24 + 4.7);
        return smoothstep(0.32, 0.72, n);
      }\n` + shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      vec2 wetCoord = vec2(vRoadWorld.x, vRoadWorld.z - uRoadOrigin);
      float wetPuddle = roadPuddle(wetCoord) * uRoadWet;
      roughnessFactor = mix(roughnessFactor, 0.045, wetPuddle);`,
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.44 * uRoadWet * (0.35 + 0.65 * roadPuddle(vec2(vRoadWorld.x, vRoadWorld.z - uRoadOrigin)));`,
    ).replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      if (uRoadWet > 0.005) {
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.2);
        float lampBand = pow(max(0.0, cos((vRoadWorld.z - uRoadOrigin) * 0.1745)), 7.0) * smoothstep(1.5, 7.2, abs(vRoadWorld.x));
        vec3 skyRefl = mix(vec3(0.035, 0.065, 0.115), vec3(0.32, 0.42, 0.52), uDaylight);
        vec3 cityRefl = vec3(1.0, 0.65, 0.32) * (0.16 + 0.68 * lampBand) * uSkyGlow * (1.0 - 0.65 * uDaylight);
        float sheen = roadPuddle(vec2(vRoadWorld.x, vRoadWorld.z - uRoadOrigin)) * uRoadWet;
        reflectedLight.indirectSpecular += (skyRefl + cityRefl) * sheen * (0.22 + 0.92 * fresnel);
      }`,
    );
  };
  material.customProgramCacheKey = () => baseKey + '|afterlane-road-water-v1';
}
enableRoadWaterReflection(asphalt);
enableRoadWaterReflection(concrete);

const verge = surface(0x252d28);
const distantVerge = surface(0x252d28);
const gravel = surface(0x2c3031);
const stripe = surface(0xbab9a7);
const edge = surface(0xc39a55);
const rail = surface(0x565963, .61, .49);
const pavement = surface(0x4e4e50);
const curb = surface(0x7b7670);
const pole = surface(0x4b4d50);
const reflector = luminous(0x755f3f);
const drain = surface(0x24272c, .6, .30);
const sand = surface(0x98704a);
const dust = surface(0x77716a, .89);
const ice = surface(0x6a899c, .21, .12);
const frost = surface(0x97afba, .30, .05);
const snow = surface(0xbec7d1, .86);
const iceCut = surface(0x45708b, .15, .24);
const sharedVertexMatte = new T.MeshStandardMaterial({ vertexColors: true, roughness: .84, metalness: .08 });

function addVertexColor(geometry, color) {
  const verts = geometry.attributes.position.count;
  const arr = new Float32Array(verts * 3);
  for (let i = 0; i < verts; i++) {
    const o = i * 3;
    arr[o] = color.r; arr[o + 1] = color.g; arr[o + 2] = color.b;
  }
  geometry.setAttribute('color', new T.BufferAttribute(arr, 3));
}

function mergeGroupVertexColored(root, skipTransparent = true) {
  root.updateMatrixWorld(true);
  const opaque = [];
  const other = new Map();
  for (const part of [...root.children]) {
    if (!part.isMesh) continue;
    if (part.material.transparent && skipTransparent) continue;
    let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    g.applyMatrix4(part.matrix);
    if (part.material.isMeshBasicMaterial) {
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal'].includes(a)) g.deleteAttribute(a);
      if (!other.has(part.material)) other.set(part.material, []);
      other.get(part.material).push(g);
    } else {
      addVertexColor(g, part.material.color || new T.Color(0xffffff));
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(a)) g.deleteAttribute(a);
      opaque.push(g);
    }
    part.geometry.dispose();
    root.remove(part);
  }
  const result = { main: null, accent: [] };
  if (opaque.length) {
    result.main = mergeGeometries(opaque, false);
    for (const g of opaque) g.dispose();
  }
  for (const [material, geoms] of other) {
    const g = mergeGeometries(geoms, false);
    for (const part of geoms) part.dispose();
    if (g) result.accent.push({ geometry: g, material });
  }
  return result;
}

function roadEdgeParts(urban, terrain = verge) {
  const root = new T.Group();
  for (const side of [-1, 1]) {
    if (urban) {
      box(root, pavement, side * 8.57, .035, 0, 1.91, .084, length + .9);
      box(root, curb, side * 7.66, .041, 0, .17, .118, length + 1.0);
      box(root, drain, side * 7.57, .013, -3, .14, .019, .69);
      for (let x = -6; x <= 6; x += 3) box(root, drain, side * 8.6, .078, x, 1.65, .003, .025);
    } else {
      box(root, gravel, side * 8.25, -.074, 0, 1.25, .092, length + 1.1);
      box(root, terrain, side * 32.4, -.12, 0, 47.2, .118, length + 1.6);
      box(root, rail, side * 8.55, .58, 0, .13, .13, length + 1.61);
      for (let z = -6; z <= 6; z += 6) {
        box(root, pole, side * 8.59, .28, z, .10, .58, .10);
        box(root, reflector, side * 8.47, .57, z, .025, .04, .09);
      }
    }
  }
  return mergeGroupVertexColored(root);
}

const poolGeometry = new T.PlaneGeometry(12.5, 24);
poolGeometry.rotateX(-Math.PI / 2);
poolGeometry.translate(5.52, .022, 0);
const poolMaterial = new T.ShaderMaterial({
  transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  uniforms: { strength: { value: .10 } },
  vertexShader: `
    varying vec2 p;
    void main() {
      p = uv * 2.0 - 1.0;
      vec4 world = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        world = instanceMatrix * world;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * world;
    }`,
  fragmentShader: 'uniform float strength; varying vec2 p; void main(){float glow=pow(max(0.0,1.0-dot(p,p)),2.5);gl_FragColor=vec4(.84,.54,.32,glow*strength);}',
});

const poleX = 9.04;
const cableHeights = [7.14, 7.43];
const streetDistrict = kind => kind === 'shops' || kind === 'homes' || kind === 'village';
const up = new T.Vector3(0, 1, 0);

function streetLampGeometries() {
  const root = new T.Group();
  box(root, pole, poleX, 3.76, 0, .145, 7.52, .145);
  box(root, pole, 8.19, 6.83, 0, 1.82, .077, .099);
  box(root, pole, 7.2, 6.81, 0, .66, .114, .251);
  const darkHead = surface(0x555054);
  for (const height of cableHeights) box(root, darkHead, poleX, height, 0, .26, .10, .22);
  const { main: poleGeom } = mergeGroupVertexColored(root);
  const bulbGeom = new T.BoxGeometry(.59, .040, .198);
  bulbGeom.translate(7.2, 6.738, 0);
  return { poleGeom, bulbGeom };
}

const cableCache = new Map();

function streetCables(station, heading, next, crossesRoad) {
  const nextHeading = next !== null ? roadYaw(next) : 0;
  const dx = next !== null ? roadX(next) - roadX(station) : 0;
  const dz = next !== null ? station - next : 0;
  const key = next !== null
    ? `${Math.round(dx * 20)}|${Math.round(heading * 200)}|${Math.round(nextHeading * 200)}|${crossesRoad ? 1 : 0}`
    : `cross|${crossesRoad ? 1 : 0}`;
  let geometry = cableCache.get(key);
  if (!geometry) {
    const parts = [];
    function saggingSpan(start, end, sag) {
      const low = start.clone().lerp(end, .5);
      low.y -= sag * 2;
      const curve = new T.QuadraticBezierCurve3(start, low, end);
      parts.push(new T.TubeGeometry(curve, 6, .022, 4, false));
    }
    if (next !== null) {
      for (const side of [-1, 1]) for (const height of cableHeights) {
        const x = side * poleX;
        const end = new T.Vector3(dx + x * Math.cos(nextHeading), height, dz - x * Math.sin(nextHeading));
        end.applyAxisAngle(up, -heading);
        end.z *= Math.cos(heading);
        saggingSpan(new T.Vector3(x, height, 0), end, .86);
      }
    }
    if (crossesRoad) {
      const height = cableHeights[1];
      saggingSpan(new T.Vector3(-poleX, height, 0), new T.Vector3(poleX, height, 0), .64);
    }
    if (!parts.length) return null;
    geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (cableCache.size < 256) cableCache.set(key, geometry);
  }
  const cables = new T.Mesh(geometry, surface(0x303943, .79, .12));
  cables.name = 'Streetlight cables';
  return cables;
}

function frozenShouldersGeometry() {
  const root = new T.Group();
  for (const side of [-1, 1]) {
    box(root, snow, side * 8.24, -.031, 0, 1.37, .082, length + 1.05);
    for (const [i, x] of [2.29, 4.92, 6.18].entries()) {
      const patch = mesh(root, new T.CircleGeometry(1, 10), i % 2 ? frost : iceCut, side * x, .009,
        ((i * 5 + (side === 1 ? 8 : 1)) % 15) - 7);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = side * (.12 + i * .08);
      patch.scale.set(i === 2 ? .40 : .62, 1.78 + i * .38, 1);
    }
  }
  return mergeGroupVertexColored(root).main;
}

export async function loadJunctionAsset() {
  try {
    const { scene } = await loadCachedModel(new GLTFLoader(), '/models/road-junction.glb');
    scene.traverse(node => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (m?.map) configureTexture(m.map, 1024, 4);
      }
    });
    return scene;
  } catch {
    return null;
  }
}

function makeJunction(scene, asset) {
  const root = group(scene);
  root.name = 'Four-way junction';
  const paving = [
    box(root, asphalt, 0, .012, 0, 15.4, .026, 27),
    box(root, asphalt, 0, .014, 0, 19.8, .026, 15.3),
  ];
  for (const p of paving) p.receiveShadow = true;
  if (asset) {
    asset.traverse(part => {
      if (part.isMesh && part.material.name === 'Junction pavement') paving.push(part);
    });
    root.add(asset);
  } else {
    const cross = box(root, asphalt, 0, -.005, 0, 130, .026, 15.2);
    cross.receiveShadow = true;
    paving.push(cross);
    for (const side of [-1, 1]) {
      for (let x = -6.7; x <= 6.7; x += 1.32) box(root, stripe, x, .034, side * 11.5, .8, .009, 2.6);
      for (let z = -6.7; z <= 6.7; z += 1.32) box(root, stripe, side * 11.5, .033, z, 2.6, .009, .8);
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [-.13, .13]) box(root, edge, side * 38, .031, z, 46, .008, .10);
    for (const z of [-7.36, 7.36]) box(root, stripe, side * 38, .030, z, 46, .008, .10);
  }
  return { root, paving };
}

function buildRoadMarkingGeometries() {
  const edges = [];
  for (const side of [-1, 1]) {
    const g = new T.BoxGeometry(.088, .008, length + 1.48);
    g.translate(side * 7.37, .003, 0);
    edges.push(g);
  }
  const edgeGeom = mergeGeometries(edges, false);
  for (const g of edges) g.dispose();

  const stripes = [];
  for (const x of [-3.68, 0, 3.68]) {
    for (const z of [-4.5, 4.5]) {
      const g = new T.BoxGeometry(.11, .008, 3.8);
      g.translate(x, .004, z);
      stripes.push(g);
    }
  }
  const stripeGeom = mergeGeometries(stripes, false);
  for (const g of stripes) g.dispose();
  return { edgeGeom, stripeGeom };
}

export function buildRoad(scene, plants, junctionAsset) {
  const roadside = prepareRoadside(plants);
  roadside.prewarm([['shops', true, 8], ['shops', false, 4], ['homes', true, 8], ['forest', false, 8]]);
  roadTextures(asphalt, concrete, distantVerge);
  const pavementWear = pavementDetails();

  const sidewalkParts = roadEdgeParts(true);
  const guardrailParts = roadEdgeParts(false);
  const sandEdgeParts = roadEdgeParts(false, sand);
  const iceEdgeParts = roadEdgeParts(false, snow);
  const frozenBankGeom = frozenShouldersGeometry();

  const shoulderInst = {
    sidewalk: new T.InstancedMesh(sidewalkParts.main, sharedVertexMatte, count),
    guardrail: new T.InstancedMesh(guardrailParts.main, sharedVertexMatte, count),
    sandEdge: new T.InstancedMesh(sandEdgeParts.main, sharedVertexMatte, count),
    iceEdge: new T.InstancedMesh(iceEdgeParts.main, sharedVertexMatte, count),
    frozenBank: new T.InstancedMesh(frozenBankGeom, sharedVertexMatte, count),
  };
  for (const inst of Object.values(shoulderInst)) {
    inst.frustumCulled = false;
    inst.receiveShadow = true;
    inst.castShadow = inst === shoulderInst.guardrail || inst === shoulderInst.sandEdge || inst === shoulderInst.iceEdge;
    inst.count = 0;
    scene.add(inst);
  }
  const guardrailReflInst = guardrailParts.accent[0]
    ? new T.InstancedMesh(guardrailParts.accent[0].geometry, guardrailParts.accent[0].material, count)
    : null;
  if (guardrailReflInst) {
    guardrailReflInst.frustumCulled = false;
    guardrailReflInst.count = 0;
    scene.add(guardrailReflInst);
  }

  const bridge = makeBridge(), water = makeBridgeWater();
  const junction = makeJunction(scene, junctionAsset);
  let junctionKind;

  const { poleGeom, bulbGeom } = streetLampGeometries();
  const maxPoles = count * 2;
  const lampPoleInst = new T.InstancedMesh(poleGeom, sharedVertexMatte, maxPoles);
  lampPoleInst.frustumCulled = false;
  lampPoleInst.castShadow = true;
  lampPoleInst.count = 0;
  scene.add(lampPoleInst);

  const bulbMaterial = new T.MeshBasicMaterial({ color: 0xffffff });
  const lampBulbInst = new T.InstancedMesh(bulbGeom, bulbMaterial, maxPoles);
  lampBulbInst.frustumCulled = false;
  lampBulbInst.setColorAt(0, new T.Color(0xffce98));
  lampBulbInst.instanceColor.setUsage(T.DynamicDrawUsage);
  lampBulbInst.count = 0;
  scene.add(lampBulbInst);

  const lampPoolInst = new T.InstancedMesh(poolGeometry, poolMaterial, maxPoles);
  lampPoolInst.frustumCulled = false;
  lampPoolInst.count = 0;
  scene.add(lampPoolInst);

  const { edgeGeom, stripeGeom } = buildRoadMarkingGeometries();
  const edgeInst = new T.InstancedMesh(edgeGeom, edge, count);
  const stripeInst = new T.InstancedMesh(stripeGeom, stripe, count);
  edgeInst.frustumCulled = false;
  stripeInst.frustumCulled = false;
  edgeInst.receiveShadow = stripeInst.receiveShadow = true;
  scene.add(edgeInst, stripeInst);

  const landGeom = new T.BoxGeometry(530, .12, length + .02);
  const landFlatMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .88 });
  const landFlatInst = new T.InstancedMesh(landGeom, landFlatMat, count);
  const landForestInst = new T.InstancedMesh(landGeom, distantVerge, count);
  landFlatInst.frustumCulled = false;
  landForestInst.frustumCulled = false;
  landFlatInst.receiveShadow = landForestInst.receiveShadow = true;
  landFlatInst.setColorAt(0, verge.color);
  landFlatInst.instanceColor.setUsage(T.DynamicDrawUsage);
  scene.add(landFlatInst, landForestInst);

  // Global instanced crops (up to 36 blocks * 56 stalks = ~2016)
  const cropRes = getCropResources();
  const maxCrops = 2200;
  const cornInst = new T.InstancedMesh(cropRes.cornGeometry, cropRes.material, maxCrops);
  const riceInst = new T.InstancedMesh(cropRes.riceGeometry, cropRes.material, maxCrops);
  cornInst.frustumCulled = false;
  riceInst.frustumCulled = false;
  cornInst.count = riceInst.count = 0;
  scene.add(cornInst, riceInst);

  // Pooled roadside InstancedMeshes keyed by prototype (blockKey + meshIdx)
  const maxBlockInstances = count * 2;
  const blockPool = new Map();
  const activeBlockPools = [];
  function getBlockInst(cacheKey, protoMesh) {
    let inst = blockPool.get(cacheKey);
    if (!inst) {
      inst = new T.InstancedMesh(protoMesh.geometry, protoMesh.material, maxBlockInstances);
      inst.frustumCulled = false;
      inst.castShadow = protoMesh.castShadow;
      inst.receiveShadow = protoMesh.receiveShadow;
      inst.count = 0;
      scene.add(inst);
      blockPool.set(cacheKey, inst);
      activeBlockPools.push(inst);
    }
    return inst;
  }

  const activeLamps = [];
  const lightObjects = Array.from({ length: 2 }, () => {
    const light = new T.PointLight(0xffcb94, 0, 25, 2);
    scene.add(light);
    return light;
  });

  const deckGeom = new T.BoxGeometry(15.2, .10, length + 1.52);
  const trackInst = {
    asphalt: new T.InstancedMesh(deckGeom, asphalt, count),
    concrete: new T.InstancedMesh(deckGeom, concrete, count),
    ice: new T.InstancedMesh(deckGeom, ice, count),
    dust: new T.InstancedMesh(deckGeom, dust, count),
  };
  for (const inst of Object.values(trackInst)) {
    inst.frustumCulled = false;
    inst.receiveShadow = true;
    inst.count = 0;
    scene.add(inst);
  }

  const wearProto = pavementWear('concrete', 0);
  const wearInsts = wearProto
    ? wearProto.children.map(part => {
        const inst = new T.InstancedMesh(part.geometry, part.material, count);
        inst.frustumCulled = false;
        inst.receiveShadow = true;
        inst.count = 0;
        scene.add(inst);
        return inst;
      })
    : [];

  const slots = Array.from({ length: count }, (_, n) => {
    const root = group(scene);
    const scenery = group(root);
    const waves = water.tile.clone();
    waves.visible = false;
    scene.add(waves);
    return {
      root, scenery, waves, n,
      number: null, district: null, lit: false, cableEnd: null,
      cables: null, shoulderKind: '', trackKind: 'asphalt', hasConcreteWear: false,
      isFrozen: false, isBridge: false, isUrban: false, isDesert: false, hasPoles: false,
      sideBlocks: [null, null],
      matrix: new T.Matrix4(),
    };
  });

  // Reusable scratch objects (zero per-frame heap allocations)
  const litBulbColor = new T.Color(0xffce98);
  const darkBulbColor = new T.Color(0x555054);
  const tmpPos = new T.Vector3();
  const tmpQuat = new T.Quaternion();
  const tmpEuler = new T.Euler(0, 0, 0, 'XYZ');
  const tmpScale = new T.Vector3(1, 1, 1);
  const tmpMat = new T.Matrix4();
  const sideLocalMats = [-1, 1].map(side => {
    const m = new T.Matrix4();
    const q = new T.Quaternion().setFromAxisAngle(up, -side * Math.PI / 2);
    m.compose(new T.Vector3(side * 9.55, 0, 0), q, new T.Vector3(1, 1, 1));
    return m;
  });
  const blockMat = new T.Matrix4();
  const stalkLocalMat = new T.Matrix4();
  const stalkWorldMat = new T.Matrix4();
  const mirrorPoleQuat = new T.Quaternion().setFromAxisAngle(up, Math.PI);
  const identityQuat = new T.Quaternion();
  const oneScale = new T.Vector3(1, 1, 1);

  const cropDensityTable = { Low: .25, Medium: .50, High: .75, Ultra: 1.0 };
  let cropDensity = .75;

  const update = (distance, wet, progress, now = 0, daylight = 0, skyGlow = .88) => {
    asphalt.roughness = 1 - wet * .64;
    concrete.roughness = .86 - wet * .39;
    asphalt.normalScale.setScalar(.60 - wet * .24);
    concrete.normalScale.setScalar(.54 - wet * .16);
    roadWaterUniforms.uRoadWet.value = wet;
    roadWaterUniforms.uRoadOrigin.value = distance;
    roadWaterUniforms.uDaylight.value = daylight;
    roadWaterUniforms.uSkyGlow.value = skyGlow;
    poolMaterial.uniforms.strength.value = .068 + wet * .063;
    water.update(distance, wet, now);

    const index = Math.floor(distance / length), origin = roadX(distance);
    const crossing = nearestJunction(distance);
    junction.root.visible = crossing - distance >= -48 && crossing - distance < length * (count - 2);
    if (junction.root.visible) {
      junction.root.position.set(roadX(crossing) - origin, 0, distance - crossing);
      junction.root.rotation.y = roadYaw(crossing);
      const kind = districtAt(crossing, progress).kind;
      if (kind !== junctionKind) {
        junctionKind = kind;
        for (const part of junction.paving) part.material = kind === 'ice' ? ice : kind === 'desert' ? dust : asphalt;
      }
    }

    activeLamps.length = 0;
    let edgeCount = 0;
    let landFlatCount = 0;
    let landForestCount = 0;
    let swCount = 0, grCount = 0, saCount = 0, icCount = 0, frCount = 0, rfCount = 0;
    let asCount = 0, coCount = 0, itCount = 0, duCount = 0, wearCount = 0;
    let poleCount = 0, poolCount = 0;
    let cornCount = 0, riceCount = 0;
    const fieldsOn = debugToggles.fields;

    for (let i = 0; i < activeBlockPools.length; i++) activeBlockPools[i].count = 0;

    for (let i = -1; i < count - 1; i++) {
      const number = index + i;
      const station = number * length;
      const slot = slots[((number % count) + count) % count];
      const heading = roadYaw(station);
      const district = districtAt(station, progress);
      const roadZ = distance - station;
      const slotX = roadX(station) - origin;
      slot.root.position.set(slotX, 0, roadZ);
      slot.waves.position.z = roadZ;
      slot.root.rotation.y = heading;
      slot.root.scale.z = 1 / Math.cos(heading);

      tmpEuler.set(0, heading, 0);
      tmpQuat.setFromEuler(tmpEuler);
      tmpPos.set(slotX, 0, roadZ);
      tmpScale.set(1, 1, 1 / Math.cos(heading));
      slot.matrix.compose(tmpPos, tmpQuat, tmpScale);

      const { kind } = district;
      const urban = streetDistrict(kind);
      const junctionOpening = Math.abs(station - nearestJunction(station)) < 25;
      const hasPoles = !junctionOpening && urban && number % 2 === 0;
      const next = station + 2 * length;
      const cableEnd = hasPoles && Math.abs(next - nearestJunction(next)) >= 25 &&
        streetDistrict(districtAt(station + length, progress).kind) &&
        streetDistrict(districtAt(next, progress).kind) ? next : null;

      if (slot.number !== number || slot.district !== district || slot.cableEnd !== cableEnd) {
        const onBridge = kind === 'bridge';
        const desert = kind === 'desert', frozen = kind === 'ice';
        const finish = roadSurfaceAt(number, kind);
        slot.scenery.clear();
        slot.cables = null;
        slot.isBridge = onBridge;
        slot.isFrozen = frozen;
        slot.isDesert = desert;
        slot.isUrban = urban;
        slot.hasPoles = hasPoles;
        slot.lit = hasPoles && district.lit;
        slot.waves.visible = onBridge;
        slot.trackKind = frozen ? 'ice' : desert ? 'dust' : finish === 'concrete' ? 'concrete' : 'asphalt';
        slot.hasConcreteWear = !junctionOpening && finish === 'concrete';
        slot.shoulderKind = '';

        if (onBridge) {
          slot.scenery.add(bridge.deck.clone());
          if (number % 4 === 0) slot.scenery.add(bridge.piers.clone());
          if (districtAt(station - 72, progress).kind === 'bridge' &&
              districtAt(station - 90, progress).kind !== 'bridge') slot.scenery.add(bridge.towers.clone());
          slot.sideBlocks[0] = null;
          slot.sideBlocks[1] = null;
        } else if (!junctionOpening) {
          slot.shoulderKind = desert ? 'sandEdge' : frozen ? 'iceEdge' : urban ? 'sidewalk' : 'guardrail';
          for (let s = 0; s < 2; s++) {
            const side = s === 0 ? -1 : 1;
            const entry = roadside.getBlockEntry(district, number, side);
            const pattern = (kind === 'corn' || kind === 'rice') ? getCropPattern(kind, entry.variant) : null;
            slot.sideBlocks[s] = { key: entry.key, group: entry.group, kind, pattern };
          }
          if (desert && Math.floor((station - desertStartDistance) / length) % 44 === 7) {
            slot.scenery.add(roadside.landmark('desert', number % 2 === 0 ? 1 : -1));
          }
          if (['village', 'corn', 'rice'].includes(kind) && number % 17 === 4) {
            slot.scenery.add(roadside.landmark('mountain', number % 2 === 0 ? 1 : -1));
          }
        } else {
          slot.sideBlocks[0] = null;
          slot.sideBlocks[1] = null;
        }

        if (number === 2 || kind !== districtAt(station - length, progress).kind) {
          slot.scenery.add(roadside.sign(kind));
        }
        if (hasPoles) {
          slot.cables = streetCables(station, heading, cableEnd, number % 8 === 0);
          if (slot.cables) slot.scenery.add(slot.cables);
        }
        slot.cableEnd = cableEnd;
        slot.number = number;
        slot.district = district;
      }
      if (slot.cables) slot.cables.visible = roadZ > (isMobileDevice ? -140 : -200) && roadZ < 24;

      // Update per-frame instanced road deck accessories
      tmpPos.set(0, -.055 - (slot.n % 2) * .001, 0);
      tmpMat.compose(tmpPos, identityQuat, oneScale);
      tmpMat.premultiply(slot.matrix);
      if (slot.trackKind === 'asphalt') trackInst.asphalt.setMatrixAt(asCount++, tmpMat);
      else if (slot.trackKind === 'concrete') trackInst.concrete.setMatrixAt(coCount++, tmpMat);
      else if (slot.trackKind === 'ice') trackInst.ice.setMatrixAt(itCount++, tmpMat);
      else trackInst.dust.setMatrixAt(duCount++, tmpMat);
      if (slot.hasConcreteWear) {
        for (let w = 0; w < wearInsts.length; w++) wearInsts[w].setMatrixAt(wearCount, slot.matrix);
        wearCount++;
      }

      edgeInst.setMatrixAt(edgeCount, slot.matrix);
      stripeInst.setMatrixAt(edgeCount, slot.matrix);
      edgeCount++;

      if (!slot.isBridge) {
        tmpPos.set(0, -.203, roadZ);
        tmpMat.compose(tmpPos, identityQuat, oneScale);
        if (slot.isFrozen || slot.isDesert || slot.isUrban) {
          landFlatInst.setMatrixAt(landFlatCount, tmpMat);
          landFlatInst.setColorAt(landFlatCount, slot.isFrozen ? snow.color : slot.isDesert ? sand.color : verge.color);
          landFlatCount++;
        } else {
          landForestInst.setMatrixAt(landForestCount++, tmpMat);
        }
      }

      if (slot.shoulderKind === 'sidewalk') shoulderInst.sidewalk.setMatrixAt(swCount++, slot.matrix);
      else if (slot.shoulderKind === 'guardrail') {
        shoulderInst.guardrail.setMatrixAt(grCount++, slot.matrix);
        if (guardrailReflInst) guardrailReflInst.setMatrixAt(rfCount++, slot.matrix);
      } else if (slot.shoulderKind === 'sandEdge') shoulderInst.sandEdge.setMatrixAt(saCount++, slot.matrix);
      else if (slot.shoulderKind === 'iceEdge') shoulderInst.iceEdge.setMatrixAt(icCount++, slot.matrix);
      if (slot.isFrozen && !slot.isBridge && !junctionOpening) {
        shoulderInst.frozenBank.setMatrixAt(frCount++, slot.matrix);
      }

      if (slot.hasPoles) {
        for (let s = 0; s < 2; s++) {
          const q = s === 0 ? mirrorPoleQuat : identityQuat;
          tmpPos.set(0, 0, 0);
          tmpMat.compose(tmpPos, q, oneScale);
          tmpMat.premultiply(slot.matrix);
          lampPoleInst.setMatrixAt(poleCount, tmpMat);
          lampBulbInst.setMatrixAt(poleCount, tmpMat);
          lampBulbInst.setColorAt(poleCount, slot.lit ? litBulbColor : darkBulbColor);
          if (slot.lit) lampPoolInst.setMatrixAt(poolCount++, tmpMat);
          poleCount++;
        }
      }

      for (let s = 0; s < 2; s++) {
        const blk = slot.sideBlocks[s];
        if (!blk) continue;
        const isCropField = blk.kind === 'corn' || blk.kind === 'rice';
        if (isCropField && !fieldsOn) continue;
        blockMat.multiplyMatrices(slot.matrix, sideLocalMats[s]);
        const meshes = blk.group.children;
        for (let m = 0; m < meshes.length; m++) {
          const inst = getBlockInst(blk.key + '|' + m, meshes[m]);
          if (inst.count < maxBlockInstances) {
            inst.setMatrixAt(inst.count++, blockMat);
          }
        }
        if (blk.pattern) {
          const pat = blk.pattern;
          const totalPlants = pat.length / 5;
          const activePlants = Math.max(1, Math.floor(totalPlants * cropDensity));
          const targetInst = blk.kind === 'rice' ? riceInst : cornInst;
          const isRice = blk.kind === 'rice';
          for (let k = 0; k < activePlants; k++) {
            const idx = k * 5;
            tmpPos.set(pat[idx], pat[idx + 1], pat[idx + 2]);
            tmpEuler.set(0, pat[idx + 4], 0);
            tmpQuat.setFromEuler(tmpEuler);
            tmpScale.set(1, pat[idx + 3], 1);
            stalkLocalMat.compose(tmpPos, tmpQuat, tmpScale);
            stalkWorldMat.multiplyMatrices(blockMat, stalkLocalMat);
            if (isRice) {
              if (riceCount < maxCrops) targetInst.setMatrixAt(riceCount++, stalkWorldMat);
            } else {
              if (cornCount < maxCrops) targetInst.setMatrixAt(cornCount++, stalkWorldMat);
            }
          }
        }
      }

      if (slot.lit && Math.abs(distance - station) < 50) {
        for (const side of [-1, 1]) activeLamps.push({ root: slot.root, side });
      }
    }

    edgeInst.count = stripeInst.count = edgeCount;
    edgeInst.instanceMatrix.needsUpdate = true;
    stripeInst.instanceMatrix.needsUpdate = true;

    trackInst.asphalt.count = asCount;
    trackInst.concrete.count = coCount;
    trackInst.ice.count = itCount;
    trackInst.dust.count = duCount;
    for (const inst of Object.values(trackInst)) {
      inst.visible = inst.count > 0;
      if (inst.visible) inst.instanceMatrix.needsUpdate = true;
    }
    for (let w = 0; w < wearInsts.length; w++) {
      wearInsts[w].count = wearCount;
      wearInsts[w].visible = wearCount > 0;
      if (wearCount) wearInsts[w].instanceMatrix.needsUpdate = true;
    }

    landFlatInst.count = landFlatCount;
    if (landFlatCount) {
      landFlatInst.instanceMatrix.needsUpdate = true;
      landFlatInst.instanceColor.needsUpdate = true;
    }
    landForestInst.count = landForestCount;
    if (landForestCount) landForestInst.instanceMatrix.needsUpdate = true;

    shoulderInst.sidewalk.count = swCount;
    shoulderInst.guardrail.count = grCount;
    shoulderInst.sandEdge.count = saCount;
    shoulderInst.iceEdge.count = icCount;
    shoulderInst.frozenBank.count = frCount;
    for (const inst of Object.values(shoulderInst)) {
      if (inst.count) inst.instanceMatrix.needsUpdate = true;
    }
    if (guardrailReflInst) {
      guardrailReflInst.count = rfCount;
      if (rfCount) guardrailReflInst.instanceMatrix.needsUpdate = true;
    }

    lampPoleInst.count = lampBulbInst.count = poleCount;
    if (poleCount) {
      lampPoleInst.instanceMatrix.needsUpdate = true;
      lampBulbInst.instanceMatrix.needsUpdate = true;
      lampBulbInst.instanceColor.needsUpdate = true;
    }
    lampPoolInst.count = poolCount;
    if (poolCount) lampPoolInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < activeBlockPools.length; i++) {
      const inst = activeBlockPools[i];
      inst.visible = inst.count > 0;
      if (inst.visible) inst.instanceMatrix.needsUpdate = true;
    }

    cornInst.visible = fieldsOn && cornCount > 0;
    cornInst.count = fieldsOn ? cornCount : 0;
    if (cornInst.visible) cornInst.instanceMatrix.needsUpdate = true;
    riceInst.visible = fieldsOn && riceCount > 0;
    riceInst.count = fieldsOn ? riceCount : 0;
    if (riceInst.visible) riceInst.instanceMatrix.needsUpdate = true;

    activeLamps.sort((a, b) => Math.abs(a.root.position.z) - Math.abs(b.root.position.z));
    for (const [i, light] of lightObjects.entries()) {
      const slot = activeLamps[i];
      light.intensity = slot ? 80 : 0;
      if (!slot) continue;
      light.position.set(slot.side * 7.2, 6.69, 0);
      slot.root.localToWorld(light.position);
    }
    return districtLight(distance, progress);
  };

  update.setQuality = tier => {
    cropDensity = cropDensityTable[tier] ?? .75;
  };
  update.prewarmRemaining = async (canWork = () => true) => {
    const queue = [['village', true, 8], ['corn', false, 8], ['rice', false, 8], ['desert', false, 8], ['ice', false, 8]];
    for (const entry of queue) {
      while (!canWork()) await new Promise(resolve => setTimeout(resolve, 400));
      roadside.prewarm([entry]);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  };
  return update;
}

export function buildSky(scene) {
  const cover = { value: 0 }, glow = { value: 0 }, flash = { value: 0 }, sun = { value: 0 };
  const cloudTime = { value: 0 };
  const radius = isMobileDevice ? 275 : 350;
  const sky = new T.Mesh(new T.SphereGeometry(radius, 24, 12), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: { cover, glow, flash, sun, cloudTime },
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction;
      uniform float cover,glow,flash,sun,cloudTime;
      float cell(vec2 p) {
        return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
      }
      float cloudNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(cell(i),cell(i+vec2(1.,0.)),f.x),
          mix(cell(i+vec2(0.,1.)),cell(i+vec2(1.)),f.x),f.y);
      }
      float cloudField(vec2 p) {
        mat2 turn = mat2(1.6,1.2,-1.2,1.6);
        float density = .54*cloudNoise(p);
        p=turn*p+5.2;
        density+=.25*cloudNoise(p);
        p=turn*p+3.6;
        density+=.14*cloudNoise(p);
        return density+.07*cloudNoise(turn*p+1.9);
      }
      void main() {
        vec3 ray = normalize(direction);
        if (ray.y < -0.04) { gl_FragColor = vec4(.005,.008,.014,1.); return; }
        float elevation = max(0.,ray.y);
        float horizon = exp(-elevation*8.);
        float skyglow = exp(-abs(ray.x+.1)*1.9)*horizon*glow;
        vec2 cloudUV = ray.xz/(.16+elevation)*2.1+vec2(cloudTime*.006,-cloudTime*.0028);
        float density = cloudField(cloudUV);
        float edge = mix(.56,.27,cover);
        float cloudMask = smoothstep(edge,edge+.18,density)*smoothstep(.012,.12,ray.y);
        float streaks = smoothstep(.61,.79,cloudNoise(cloudUV*.65+vec2(24.,13.)))
          *smoothstep(.1,.43,ray.y)*.23*(1.-cover);
        float shadow = cloudNoise(cloudUV+vec2(.26,-.20));
        float thickness = smoothstep(.36,.79,.68*density+.32*shadow);
        vec3 clear = mix(vec3(.0045,.0067,.013),vec3(.014,.022,.036),horizon);
        vec3 cloud = mix(vec3(.003,.0055,.009),vec3(.013,.019,.030),horizon)*(1.+density*.25);
        vec3 color = mix(clear,cloud,min(1.,cover*1.6))*(.57+.43*glow);
        color += vec3(.027,.016,.009)*skyglow;
        float angular = distance(ray,normalize(vec3(-.24,.15,-1.)));
        float moon = (1.-step(.01,cover))*(1.-sun);
        color += moon*vec3(.051,.046,.039)*exp(-angular*66.);
        color += moon*vec3(.51,.47,.37)*(1.-smoothstep(.006,.009,angular));
        vec3 sunDirection = normalize(vec3(-.36,mix(.14,.46,sun),-1.));
        float sunAngle = distance(ray,sunDirection);
        float light = exp(-sunAngle*2.5)*(1.-cover);
        vec3 day = mix(vec3(.11,.37,.76),vec3(.62,.76,.88),horizon);
        day += vec3(.34,.25,.14)*light;
        vec3 gray = mix(vec3(.145,.18,.235),vec3(.32,.37,.40),horizon);
        vec3 daytime = mix(day,gray,smoothstep(.06,.83,cover));
        vec3 litCloud = mix(vec3(.88,.89,.91),vec3(.60,.64,.70),thickness);
        vec3 rainCloud = mix(vec3(.34,.38,.43),vec3(.13,.165,.205),thickness);
        daytime = mix(daytime,vec3(.74,.82,.88),streaks);
        daytime = mix(daytime,mix(litCloud,rainCloud,cover)+vec3(.24,.17,.08)*light,cloudMask);
        daytime += vec3(.52,.38,.20)*(1.-cloudMask)*(1.-smoothstep(.009,.018,sunAngle))*(1.-cover);
        float golden = (1.-smoothstep(.25,.85,sun))*sun;
        daytime += vec3(.55,.27,.09)*horizon*exp(-sunAngle*1.4)*(1.-cover*.6)*(.45 + golden);
        color = mix(color,daytime,sun)+vec3(.052,.067,.085)*flash;
        gl_FragColor = vec4(color,1.);
      }`
  }));
  scene.add(sky);
  return (wet, district, lightning, daylight = 0, elapsed = 0) => {
    cover.value = wet;
    glow.value = district;
    flash.value = lightning;
    sun.value = daylight;
    cloudTime.value = elapsed;
  };
}
