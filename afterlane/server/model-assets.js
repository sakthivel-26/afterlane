import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { prepareVehicleModel } from '../client/car.js';
import { trafficSpecs, vehicles } from '../client/vehicle-specs.js';

export async function loadModelAssets() {
  const directory = new URL('../client/models/',import.meta.url);
  const specs = new Map([
    ...vehicles.filter(Boolean).map(vehicle=>[vehicle.asset,vehicle]),
    ...trafficSpecs.map(([type,,style,asset])=>[asset,{type,style,asset}]),
  ]);
  const versions = {};
  const footprints = new Map();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser=>({
    name:'AfterlaneCollisionGeometry',
    beforeRoot() {
      // Collision uses the same geometry as the browser and needs no textures.
      for (const mesh of parser.json.meshes ?? []) {
        for (const primitive of mesh.primitives) delete primitive.material;
      }
    },
  }));
  const files = await readdir(directory,{withFileTypes:true});
  await Promise.all(files.filter(file=>file.isFile() && file.name.endsWith('.glb')).map(async ({name})=>{
    try {
      const bytes = await readFile(new URL(encodeURIComponent(name),directory));
      versions['/models/'+name] = createHash('sha256').update(bytes).digest('hex');
      const asset = name.slice(0,-4);
      const spec = specs.get(asset);
      if (!spec) return;
      const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      const {scene} = await loader.parseAsync(buffer,'');
      const model = prepareVehicleModel(scene,spec);
      if (model) footprints.set(asset,model.userData.footprint);
    } catch (error) {
      console.warn('Using procedural collision geometry for '+name+'.',error.message);
    }
  }));
  return {versions,footprints};
}
