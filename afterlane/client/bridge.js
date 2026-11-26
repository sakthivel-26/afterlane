import * as T from 'three';
import { batchMeshes, box, luminous, mesh, surface } from './car.js';
import { segmentLength } from './route.js';

const steel = surface(0x637789,.37,.48);
const cable = surface(0x8e9eac,.43,.44);
const concrete = surface(0x626e77);
const dark = surface(0x313c49);
const marker = luminous(0x487895);
const beacon = luminous(0xe84d49);

function brace(parent,material,start,end,width) {
  const a = new T.Vector3(...start), b = new T.Vector3(...end);
  const center = a.clone().lerp(b,.5);
  const part = box(parent,material,center.x,center.y,center.z,width,a.distanceTo(b),width);
  part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());
}

export function makeBridge() {
  const deck = new T.Group();
  box(deck,concrete,0,-.427,0,18.56,.81,segmentLength+1.52);
  for (const side of [-1,1]) {
    box(deck,concrete,side*8.40,.047,0,1.37,.13,segmentLength+1.36);
    box(deck,steel,side*8.68,.94,0,.12,.106,segmentLength+1.38);
    box(deck,steel,side*8.68,.50,0,.074,.072,segmentLength+1.38);
    for (const z of [-6,-2,2,6]) {
      box(deck,steel,side*8.68,.52,z,.095,1.02,.10);
      box(deck,marker,side*8.59,.68,z,.035,.050,.13);
    }
    box(deck,dark,side*7.41,-.80,0,.48,.45,segmentLength+.83);
  }
  batchMeshes(deck);

  const piers = new T.Group();
  for (const side of [-1,1]) {
    box(piers,concrete,side*5.24,-4.28,0,2.22,7.78,2.80);
    box(piers,dark,side*5.24,-7.01,0,3.12,.53,4.27);
    box(piers,concrete,side*5.24,-1.23,0,3.36,1.0,3.7);
  }
  batchMeshes(piers);

  const towers = new T.Group();
  for (const side of [-1,1]) {
    brace(towers,steel,[side*9.07,-.16,0],[side*8.24,15.5,0],.72);
    box(towers,concrete,side*8.94,.34,0,1.1,1.20,1.24);
    box(towers,beacon,side*8.24,15.72,0,.25,.28,.25);
    for (const direction of [-1,1]) for (let i=0;i<4;i++) {
      brace(towers,cable,[side*8.26,14.3-i*1.34,direction*.07],
        [side*8.75,.92,direction*(43-i*8)],.038);
    }
  }
  box(towers,steel,0,12.5,0,16.97,.62,.66);
  box(towers,dark,0,12.18,0,16.24,.096,.20);
  batchMeshes(towers);
  return {deck,piers,towers};
}

export function makeBridgeWater() {
  const uniforms = T.UniformsUtils.merge([T.UniformsLib.fog,{
    origin:{value:0},time:{value:0},wet:{value:0}
  }]);
  const material = new T.ShaderMaterial({
    uniforms,fog:true,
    vertexShader:`
      varying vec2 waterPosition;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix*vec4(position,1.);
        waterPosition = world.xz;
        vec4 mvPosition = viewMatrix*world;
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform float origin,time,wet;
      varying vec2 waterPosition;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vec2(waterPosition.x,waterPosition.y-origin);
        float lapping = sin(p.y*1.18+p.x*.14+time*.87)+sin(p.y*.66-p.x*.31-time*.61)*.52;
        float ripple = pow(max(0.,lapping*.59),3.);
        float glint = .12+.88*sin(p.x*.35+p.y*.22+time*.41)*sin(p.x*.35+p.y*.22+time*.41);
        vec3 water = vec3(.006,.015,.024)+vec3(.016,.035,.055)*ripple*glint*(1.-wet*.26);
        gl_FragColor = vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const tile = new T.Mesh(new T.PlaneGeometry(530,segmentLength+.01),material);
  tile.position.y = -7.35;
  tile.rotation.x = -Math.PI/2;
  return {
    tile,
    update(distance,wet,now) {
      uniforms.origin.value = distance;
      uniforms.wet.value = wet;
      uniforms.time.value = now/1000;
    }
  };
}
