import * as T from 'three';

const capacity = 56;
const tailColor = new T.Color(0xff2438);
const headColor = new T.Color(0xffe8c8);
const headlightReflection = {value:1};
const reflectiveTrafficMaterials = new WeakMap();
// The two player headlamps are the scene's spotlights. Let them brightly illuminate
// NPC rear surfaces and retro-reflectors without clipping into bloom artifacts.
const trafficLightShader = T.ShaderChunk.lights_fragment_begin.replace(
  /(getSpotLightInfo\([^;]+\);[\s\S]*?)(RE_Direct\([^;]+\);)/,
  (_,spotSetup,light)=>`${spotSetup}{
    directLight.color *= npcHeadlightReflection;
    float incoming = max(max(directLight.color.r,directLight.color.g),directLight.color.b);
    float reflectionLimit = mix(1.2,3.4,clamp(npcHeadlightReflection,0.,1.2));
    directLight.color *= min(1.,reflectionLimit/max(incoming,1e-5));
    float glintLimit = mix(.18,.68,clamp(npcHeadlightReflection,0.,1.2));
    vec3 specularBefore = reflectedLight.directSpecular;
    #ifdef USE_CLEARCOAT
      vec3 clearcoatBefore = clearcoatSpecularDirect;
    #endif
    #ifdef USE_SHEEN
      vec3 sheenBefore = sheenSpecularDirect;
    #endif
    ${light}
    reflectedLight.directSpecular = specularBefore+min(reflectedLight.directSpecular-specularBefore,vec3(glintLimit));
    #ifdef USE_CLEARCOAT
      clearcoatSpecularDirect = clearcoatBefore+min(clearcoatSpecularDirect-clearcoatBefore,vec3(glintLimit));
    #endif
    #ifdef USE_SHEEN
      sheenSpecularDirect = sheenBefore+min(sheenSpecularDirect-sheenBefore,vec3(glintLimit));
    #endif
  }`,
);

export function nighttimeReflection(daylight) {
  return 1.12 - .24 * T.MathUtils.smoothstep(daylight, .05, .45);
}

export function applyTrafficHeadlightReflection(body,ownedPaint) {
  const decorate = (source, meshName = '')=>{
    if (!source?.isMeshStandardMaterial) return source;
    const isTire = /tire|wheel|rubber|tread/i.test(meshName) || /tire|wheel|rubber|tread/i.test(source.name || '');
    if (reflectiveTrafficMaterials.has(source)) return reflectiveTrafficMaterials.get(source);
    const material = source===ownedPaint ? source : source.clone();
    if (!isTire && material !== ownedPaint) {
      material.roughness = Math.min(typeof material.roughness === 'number' ? material.roughness : .45, .36);
      if (material.isMeshPhysicalMaterial) {
        material.clearcoat = Math.max(material.clearcoat || 0, .55);
        material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? .2, .16);
      }
    }
    const originalKey = source.customProgramCacheKey();
    material.onBeforeCompile = shader=>{
      shader.uniforms.npcHeadlightReflection = headlightReflection;
      shader.fragmentShader = 'uniform float npcHeadlightReflection;\n'+shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',trafficLightShader,
      );
    };
    material.customProgramCacheKey = ()=>originalKey+'|afterlane-traffic-reflection-v2';
    reflectiveTrafficMaterials.set(source,material);
    return material;
  };
  body.traverse(node=>{
    if (node.isMesh) node.material = Array.isArray(node.material) ? node.material.map(m => decorate(m, node.name)) : decorate(node.material, node.name);
  });
}

function streakTexture() {
  const size = 32;
  const pixels = new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const width = Math.abs((x+.5)/size*2-1);
    const length = (y+.5)/size;
    const taper = Math.exp(-width*width*6.9)*Math.sin(Math.PI*length)**1.7;
    const ripple = .77+.23*Math.sin(y*2.7+x*.69);
    const i = (y*size+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=255;
    pixels[i+3]=Math.round(255*taper*ripple);
  }
  const texture = new T.DataTexture(pixels,size,size,T.RGBAFormat);
  texture.minFilter=texture.magFilter=T.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

export function trafficLighting(scene,visitTraffic) {
  const shape = new T.PlaneGeometry(1,1);
  shape.rotateX(-Math.PI/2);
  const material = new T.MeshBasicMaterial({
    map:streakTexture(),transparent:true,depthWrite:false,blending:T.AdditiveBlending
  });
  const streaks = new T.InstancedMesh(shape,material,capacity);
  streaks.count = 0;
  streaks.frustumCulled = false;
  streaks.renderOrder = 1;
  streaks.instanceMatrix.setUsage(T.DynamicDrawUsage);
  streaks.setColorAt(0,tailColor);
  streaks.instanceColor.setUsage(T.DynamicDrawUsage);
  scene.add(streaks);
  const transform = new T.Object3D();
  const color = new T.Color();
  const nearby = [];

  function streak(index,car,x,z,width,length,tone,brightness) {
    const yaw = car.body.rotation.y;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    transform.position.set(car.body.position.x+x*cos+z*sin,.018,car.body.position.z+z*cos-x*sin);
    transform.rotation.y = yaw;
    transform.scale.set(width,1,length);
    transform.updateMatrix();
    streaks.setMatrixAt(index,transform.matrix);
    streaks.setColorAt(index,color.copy(tone).multiplyScalar(brightness));
  }

  return (distance,x,wet,cabin,daylight) => {
    headlightReflection.value = nighttimeReflection(daylight);
    let beam = 1, count = 0;
    nearby.length = 0;
    visitTraffic(car=> {
      const gap = car.station-distance;
      const ahead = gap>0;
      const glare = cabin && ahead ? 1.05+.35*T.MathUtils.smoothstep(gap,5,30) : 1.15;
      car.body.userData.tailLight?.color.copy(tailColor).multiplyScalar(glare);
      if (cabin && ahead && Math.abs(car.offset-x)<2.7) {
        beam=Math.min(beam,.80+.20*T.MathUtils.smoothstep(gap,4,21));
      }
      if (wet>0 && Math.abs(gap)<92) nearby.push(car);
    });
    nearby.sort((a,b)=>Math.abs(a.station-distance)-Math.abs(b.station-distance));
    material.opacity = wet*(.69-daylight*.42);
    for (const car of nearby) {
      if (count+4>capacity) break;
      const tailBrightness = cabin && car.station>distance ? .60 : .90;
      for (const side of [-1,1]) {
        const x = side*car.width*.32;
        streak(count++,car,x,car.length/2+2.05,.51,4.6,tailColor,tailBrightness);
        if (car.headlights!==false) streak(count++,car,x,-car.length/2-2.9,.75,5.8,headColor,.66);
      }
    }
    streaks.count = count;
    if (count) {
      streaks.instanceMatrix.needsUpdate = true;
      streaks.instanceColor.needsUpdate = true;
    }
    return beam;
  };
}
