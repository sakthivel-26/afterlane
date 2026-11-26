import * as T from 'three';
import { batchMeshes, box, configureTexture, surface } from './car.js';
import { segmentLength } from './route.js';

export function roadSurfaceAt(number,kind) {
  if (kind==='ice') return 'ice';
  if (kind==='desert') return 'desert';
  if (kind==='bridge') return 'concrete';
  const repeat = T.MathUtils.euclideanModulo(number,32);
  if ((kind==='shops' && repeat>=8 && repeat<=13) ||
      (kind==='homes' && repeat>=15 && repeat<=22) ||
      (kind==='village' && repeat>=9 && repeat<=16)) return 'concrete';
  return 'asphalt';
}

export function roadTextures(asphalt,concrete,verge) {
  if (typeof HTMLImageElement==='undefined') return;
  const loader = new T.TextureLoader();
  const apply = (material,path,repeat,normal,tint) => {
    loader.load('/surfaces/'+path+'.jpg',texture=>{
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(...repeat);
      configureTexture(texture, 1024, 4);
      if (normal) material.normalMap = texture;
      else {
        texture.colorSpace = T.SRGBColorSpace;
        material.map = texture;
        material.color.setRGB(...tint);
      }
      material.needsUpdate = true;
    });
  };
  const pavements = [
    [asphalt,'asphalt',[7.5,9.6],[3.2,4.3,4.8]],
    [concrete,'concrete',[5.5,7],[.83,1.02,1.45]],
  ];
  for (const [material,name,tile,tint] of pavements) {
    apply(material,name+'-color',tile,false,tint);
    apply(material,name+'-normal',tile,true);
  }
  apply(verge,'forest-color',[86,4.25],false,[.62,.62,.62]);
}

const joints = surface(0x37383a,.91);
const brightEdge = surface(0x4d4b47,.91);

export function pavementDetails() {
  const concrete = new T.Group();
  concrete.name = 'Concrete joints';
  for (const x of [-3.68,0,3.68]) box(concrete,joints,x,-.001,0,.045,.003,segmentLength+.80);
  for (const z of [-8.72,-2.86,3.12]) {
    box(concrete,joints,0,-.001,z,14.65,.003,.056);
    for (const x of [-5.5,1.75]) box(concrete,brightEdge,x,-.0004,z-.042,3.10,.002,.023);
  }
  batchMeshes(concrete);
  return finish => finish==='concrete' ? concrete.clone() : null;
}
