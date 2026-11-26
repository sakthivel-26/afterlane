import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCachedModel } from './model-cache.js';

export function preparePlantKit(scene) {
  scene.updateMatrixWorld(true);
  const winterMaterials = new Map();
  function winter(material) {
    if (!material.alphaTest) return material;
    if (!winterMaterials.has(material)) {
      const frosted = material.clone();
      frosted.name = 'Shapespark frosted leaves';
      frosted.onBeforeCompile = shader=>{
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.68,.84,.91), vec3(.63,.73,.81), .53);');
      };
      winterMaterials.set(material,frosted);
    }
    return winterMaterials.get(material);
  }

  function prepare(node) {
    const bounds = new T.Box3().setFromObject(node);
    const center = bounds.getCenter(new T.Vector3());
    const parts = [];
    node.traverse(object=>{
      if (!object.isMesh) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      geometry.translate(-center.x,-bounds.min.y,-center.z);
      if (object.material.map) object.material.map.anisotropy = 4;
      parts.push({geometry,material:object.material,winter:winter(object.material)});
    });
    return {name:node.name,height:bounds.max.y-bounds.min.y,parts};
  }

  return {
    trees:scene.children.filter(node=>node.name.startsWith('Tree-')).map(prepare),
    shrubs:scene.children.filter(node=>node.name.startsWith('Bush-')).map(prepare),
  };
}

export async function loadPlantKit() {
  try {
    const {scene} = await loadCachedModel(new GLTFLoader(),'/models/shapespark-plants.glb');
    return preparePlantKit(scene);
  } catch (error) {
    console.warn('Roadside plant models could not load.',error);
    return null;
  }
}
