import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchMeshes, box, group, loadVehicleAsset, luminous, mesh, surface, vehicleFootprint } from './car.js';
import { roadX, roadPosition } from './road-layout.js';
import { dimensions, trafficSpecs } from './vehicle-specs.js';
import { moveTraffic, settleLaneChange, signalLaneChange, trafficContact, trafficLanes as lanes, trafficTurn } from './collision.js';
import { applyTrafficHeadlightReflection } from './traffic-lights.js';
import { wheelAnimator, wheelPivot } from './wheel-motion.js';
import { isMobileDevice } from './options.js';

const wheelMaterial = new T.MeshStandardMaterial({vertexColors:true,roughness:.63,metalness:.22});
const glass = surface(0x283845, .22, .25);
const gt3Glass = new T.MeshPhysicalMaterial({color:0x172734,roughness:.17,metalness:.21,clearcoat:.74});
const lensHousing = surface(0x6e8794,.22,.36);
const metal = surface(0x8c9298, .38, .65);
const white = luminous(0xffead2);
const blue = surface(0x1266cc,.29,.14);
const dark = surface(0x131b22,.59);
const proceduralFootprints = new Map();
const goldTint = surface(0xafb2bb,.25,.7);
const bodySeam = surface(0x171a1c,.7);
const shadowMaterial = new T.ShaderMaterial({
  transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1,
  uniforms:{opacity:{value:.36}},
  vertexShader:`varying vec2 p; void main(){
    p = uv * 2.0 - 1.0;
    vec4 mv = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mv = instanceMatrix * mv;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * mv;
  }`,
  fragmentShader:'varying vec2 p;uniform float opacity;void main(){float a=pow(1.0-clamp(dot(p,p),0.0,1.0),1.35);gl_FragColor=vec4(0.0,0.0,0.0,opacity*a);}'
});
const badges = new Map();
const bodyProfiles = {
  'Rear-engine coupe': [
    [-.50,.79,.61],[-.475,.91,.695],[-.445,.96,.754],[-.402,.991,.797],[-.348,1,.85],
    [-.29,.985,.882],[-.18,.942,.897],[-.06,.926,.883],[.07,.935,.882],[.19,.975,.913],
    [.30,1,.948],[.38,.989,.932],[.44,.954,.877],[.48,.901,.802],[.50,.866,.748],
  ],
  'Mid-engine coupe': [
    [-.50,.80,.56],[-.45,.95,.66],[-.33,1,.81],[-.21,.96,.80],[-.04,.91,.76],
    [.14,.94,.82],[.30,1,.91],[.43,.96,.88],[.50,.86,.76],
  ],
  'AMG GT': [
    [-.50,.86,.69],[-.44,.94,.77],[-.34,1,.85],[-.22,.98,.90],[-.07,.95,.95],
    [.13,.94,.91],[.29,1,.90],[.42,.96,.87],[.50,.86,.79],
  ],
  Scorpio: [
    [-.50,.87,.98],[-.46,.97,1.05],[-.34,1,1.10],[-.16,.99,1.09],[.02,.97,1.04],
    [.18,.96,1.02],[.32,1,1.06],[.46,.98,1.05],[.50,.92,.98],
  ],
  'Road saloon': [
    [-.50,.82,.70],[-.43,.96,.78],[-.32,1,.84],[-.15,.96,.92],
    [.09,.92,.95],[.28,.97,.99],[.43,.96,1],[.50,.87,.93],
  ],
  'Executive saloon': [
    [-.50,.89,.71],[-.44,.98,.77],[-.34,1,.82],[-.15,.95,.91],
    [.08,.95,.93],[.29,1,.98],[.44,.96,1.01],[.50,.88,.94],
  ],
  'Compact crossover': [
    [-.50,.86,.88],[-.45,.99,.97],[-.32,1,1.02],[-.17,.98,1.04],
    [.12,.97,1.08],[.29,1,1.12],[.45,.96,1.10],[.50,.91,1.02],
  ],
  'Double-cab pickup': [
    [-.50,.88,1.17],[-.46,.99,1.26],[-.34,1,1.28],[-.18,.97,1.25],
    [.12,.96,1.15],[.28,1,1.16],[.46,.98,1.17],[.50,.91,1.14],
  ],
};

function badge(parent,text,x,y,z,width,height) {
  if (typeof document === 'undefined') return;
  let material = badges.get(text);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 71px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = text === 'GT-R' ? '#ffd5cf' : '#e0e5ef';
    ctx.fillText(text,256,59,470);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    material = new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.12});
    badges.set(text,material);
  }
  mesh(parent,new T.PlaneGeometry(width,height),material,x,y,z);
}

function loft(parent, material, rings) {
  const points = [], indices = [];
  for (const [z,w,base,top,chamfer] of rings) {
    points.push(-w*.8,base,z, -w,base+chamfer,z, -w,top-chamfer,z, -w*.78,top,z,
      w*.78,top,z, w,top-chamfer,z, w,base+chamfer,z, w*.8,base,z);
  }
  for (let i=0;i<rings.length-1;i++) for (let k=0;k<8;k++) {
    const a=i*8+k, b=i*8+(k+1)%8;
    indices.push(a,a+8,b,b,a+8,b+8);
  }
  const end = (rings.length-1)*8;
  for (let k=1;k<7;k++) indices.push(0,k,k+1,end,end+k+1,end+k);
  // Box and cylinder geometry use the same normal and UV attributes for batching.
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(points,3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(points.length/3*2),2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(parent,geometry,material,0,0,0);
}

function bodyLoft(parent,paint,stations,length,width,radius,ground) {
  const archWidth = radius+.096;
  const axle = [-length*.31,length*.29];
  // Keep the original silhouette stations, with extra samples through the arches.
  const samples = new Set(stations.map(([z])=>z*length));
  for (const center of axle) {
    for (let i=0;i<=14;i++) samples.add(center+archWidth*(i/7-1));
  }
  const rings = [];
  let segment = 0;
  for (const z of [...samples].sort((a,b)=>a-b)) {
    if (z<-.5*length || z>.5*length) continue;
    while (segment<stations.length-2 && z>stations[segment+1][0]*length) segment++;
    const [start,w1,y1] = stations[segment], [end,w2,y2] = stations[segment+1];
    const t = (z/length-start)/(end-start);
    const top = T.MathUtils.lerp(y1,y2,t);
    const shape = T.MathUtils.lerp(w1,w2,t)*width/2;
    const fromAxle = Math.min(...axle.map(center=>Math.abs(z-center)));
    const cut = fromAxle>=archWidth ? ground :
      Math.min(top-.062,radius+Math.sqrt(archWidth**2-fromAxle**2));
    const lower = Math.max(ground,cut);
    rings.push([z,shape,lower,top,Math.min(.10,(top-lower)*.42)]);
  }
  loft(parent,paint,rings);
}

function shadeVehicle(parent,width,length) {
  const shade = mesh(parent,new T.PlaneGeometry(width*1.24,length*1.01),shadowMaterial,0,.008,0);
  shade.name = 'Contact shade';
  shade.rotation.x = -Math.PI/2;
}

function porscheRoof(parent,paint,width,length,height) {
  const stations = [
    [-.276,.414,.901],[-.245,.407,.953],[-.199,.393,1.026],[-.148,.378,1.124],
    [-.082,.366,1.227],[-.021,.362,1.273],[.052,.359,1.278],[.124,.360,1.259],
    [.187,.370,1.210],[.238,.385,1.146],[.282,.401,1.064],[.323,.424,.990],[.379,.431,.920],
  ];
  const vertices = [], uv = [], glassFaces = [], paintedFaces = [];
  const slices = 28;
  const sill = .854;
  const roofScale = height/1.278;
  for (let i=0;i<stations.length;i++) {
    const [z,radius,top] = stations[i];
    for (let j=0;j<=slices;j++) {
      const angle = Math.PI*j/slices;
      vertices.push(-width*radius*Math.cos(angle),sill+(top*roofScale-sill)*Math.sin(angle)**.78,z*length);
      uv.push(j/slices,i/(stations.length-1));
      if (!i || !j) continue;
      const a=(i-1)*(slices+1)+j-1, b=a+slices+1;
      const roof = i>=5 && i<=9 && j>=5 && j<=24;
      const frame = j===1 || j===slices || i===1 || i===stations.length-1;
      const pillar = i===4 || (i===9 && (j<=7 || j>=22));
      (roof || frame || pillar ? paintedFaces : glassFaces).push(a,b,a+1,a+1,b,b+1);
    }
  }
  for (const [indices,material] of [[glassFaces,gt3Glass],[paintedFaces,paint]]) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex([...glassFaces,...paintedFaces]);
    geometry.computeVertexNormals();
    geometry.setIndex(indices);
    mesh(parent,geometry,material,0,0,0);
  }
}

function panel(parent,material,x,y,z,outline,angle=0) {
  const shape = new T.Shape();
  outline.forEach(([px,py],i)=>i===0 ? shape.moveTo(px,py) : shape.lineTo(px,py));
  shape.closePath();
  const detail = mesh(parent,new T.ShapeGeometry(shape),material,x,y,z);
  detail.rotation.y = angle;
  return detail;
}

function oval(parent,material,x,y,z,width,height,depth) {
  const detail = mesh(parent,new T.SphereGeometry(1,20,10),material,x,y,z);
  detail.scale.set(width,height,depth);
  return detail;
}

function wheelGeometry(radius,sports,side) {
  const parts = [];
  function add(geometry,color) {
    const rgb = new T.Color(color);
    const colors = new Float32Array(geometry.attributes.position.count*3);
    for (let i=0;i<colors.length;i+=3) rgb.toArray(colors,i);
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));
    parts.push(geometry);
  }
  const axleTurn = Math.PI/2;
  const faceTurn = side*Math.PI/2;
  add(new T.CylinderGeometry(radius,radius,.22,sports ? 32 : 20).rotateZ(axleTurn),0x17181a);
  add(new T.CylinderGeometry(radius*.62,radius*.62,.235,24).rotateZ(axleTurn),0x8c9298);
  const rim = radius*.56;
  add(new T.CircleGeometry(rim,20).rotateY(faceTurn).translate(side*.119,0,0),0x1a2129);
  add(new T.TorusGeometry(rim,.012,6,24).rotateY(faceTurn).translate(side*.122,0,0),0xc8d0da);
  const spokeCount = sports ? 8 : 5;
  for (let spoke=0;spoke<spokeCount;spoke++) {
    const angle = spoke*Math.PI*2/spokeCount;
    const spokeMesh = new T.BoxGeometry(.026,rim*.84,.012).rotateZ(-angle)
      .translate(Math.sin(angle)*rim*.54,Math.cos(angle)*rim*.54,.009)
      .rotateY(faceTurn).translate(side*.119,0,0);
    add(spokeMesh,0xd2dae4);
  }
  add(new T.CircleGeometry(rim*.26,14).rotateY(faceTurn).translate(side*.134,0,0),0x8b97a4);
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

export function vehicleBody(parent, type, color, style = '', options = {}) {
  const { includeShade = true, externalWheels = false } = options;
  const assembly = group(parent);
  assembly.name = style || type;
  const body = group(assembly);
  const paint = new T.MeshPhysicalMaterial({color,roughness:.24,metalness:.30,clearcoat:.72,clearcoatRoughness:.14});
  const tail = new T.MeshBasicMaterial({color:0xff2438,toneMapped:false});
  const heavy = type === 'Heavy truck' || type === 'Bus';
  const pickup = type === 'Pickup';
  const sports = type === 'Sports car';
  const hatch = type === 'Hatchback';
  const suv = type === 'SUV';
  const touring = style === 'Touring coupe';
  const midEngine = style === 'Mid-engine coupe';
  const amg = style === 'AMG GT';
  const porsche = style === 'Rear-engine coupe';
  const scorpio = style === 'Scorpio';
  const altima = style === 'Road saloon';
  const camry = style === 'Executive saloon';
  const crv = style === 'Compact crossover';
  const ford = style === 'Double-cab pickup';
  const profile = bodyProfiles[style];
  const {width,length,height} = dimensions(type,style);
  const radius = heavy ? .49 : pickup ? .39 : suv ? .35 : .32;
  const nose = -length/2, rearEdge = length/2;
  const roofBase = suv ? 1.02 : touring ? .94 : midEngine ? .79 : .89;
  if (ford) {
    bodyLoft(body,paint,profile,length,width,radius,.50);
    box(body,dark,0,1.18,.29*length,1.67,.062,length*.34);
    box(body,metal,0,.60,nose,.1+width*.73,.143,.18);
    box(body,dark,0,.96,nose-.022,1.27,.32,.041);
    for (const y of [.875,.97,1.065]) box(body,metal,0,y,nose-.048,1.20,.030,.022);
    box(body,paint,0,.97,rearEdge+.015,1.66,.28,.06);
    box(body,metal,0,.54,rearEdge+.04,1.75,.13,.17);
  } else if (heavy || pickup) box(body,paint,0,.68,0,width,heavy?.73:.45,length);
  else {
    const deck = suv ? 1.04 : touring ? .94 : midEngine ? .82 : .9;
    const stations = profile ?? [[-.50,.88,deck-.13],[-.43,.99,deck],[-.26,1,deck+.025],[-.03,.94,deck-.008],
      [.25,1,deck+.04],[.44,.95,deck],[.50,.85,deck-.05]];
    if (profile) bodyLoft(body,paint,stations,length,width,radius,.39);
    else loft(body,paint,stations.map(([z,w,y]) => [z*length,w*width/2,.39,y,.105]));
    if (touring) {
      loft(body,blue,stations.map(([z,,y]) => [z*length,.111,y+.002,y+.014,.004]));
      for (const side of [-1,1]) {
        box(body,blue,side*(width/2-.008),.58,.04,.03,.115,length*.48);
        box(body,blue,side*.53,.83,length*.487,.31,.082,.054);
      }
      box(body,dark,0,deck+.105,length*.435,width*.78,.042,.18);
      for (const side of [-1,1]) box(body,dark,side*.41,deck+.055,length*.435,.056,.084,.09);
    }
    const fascia = amg ? [.72] : scorpio ? [.67] : porsche || midEngine || altima || camry || crv ? [] :
      style === 'Executive sedan' ? [.54] : style === 'Sportback' ? [.62] :
        touring || style === 'Touring sedan' ? [.24,.24] : [.43];
    for (const [i,w] of fascia.entries()) {
      const x = fascia.length === 2 ? (i-.5)*.30 : 0;
      const y = scorpio ? .82 : .702;
      box(body,metal,x,y,-length*.50-.004,w+.043,.16,.035);
      box(body,dark,x,y,-length*.50-.026,w,.126,.024);
    }
    box(body,dark,0,.53,length*.501,width*.66,.094,.042);
    box(body,metal,0,.685,length*.504,.28,.084,.019);
    if (style === 'Sportback') box(body,tail,0,.84,length*.501,width*.65,.025,.038);
    if (midEngine || amg || porsche) {
      const rear = length/2;
      box(body,dark,0,.469,rear-.013,1.48,.18,.20);
      if (!amg) {
        const wingHeight = midEngine ? 1.02 : 1.24;
        const wing = box(body,midEngine ? paint : dark,0,wingHeight,rear-.22,1.65,.047,.28);
        wing.rotation.x = -.10;
        for (const side of [-1,1]) {
          const stay = box(body,dark,side*.49,wingHeight-.11,rear-.28,.042,.22,.095);
          stay.rotation.x = porsche ? -.41 : -.17;
          if (porsche) box(body,dark,side*.823,wingHeight+.022,rear-.22,.031,.094,.29);
        }
      }
      if (midEngine) box(body,dark,0,.72,rear+.01,1.64,.13,.045);
      if (amg) for (let i=-5;i<=5;i++) box(body,metal,i*.056,.706,-rear-.047,.009,.105,.012);
      for (const side of [-1,1]) {
        const outlet = midEngine ? .105 : amg ? .62 : .095;
        const height = midEngine ? .75 : .43;
        mesh(body,new T.CircleGeometry(.051,24),dark,side*outlet,height,rear+.092);
        mesh(body,new T.TorusGeometry(.052,.008,10,24),goldTint,side*outlet,height,rear+.096);
      }
    }
    if (scorpio) {
      for (let i=-3;i<=3;i++) box(body,metal,i*.087,.82,-length*.50-.047,.025,.117,.012);
      box(body,dark,0,.51,length*.50+.028,width*.78,.16,.045);
    }
    if (altima) {
      panel(body,metal,0,.606,nose-.022,[[-.49,.111],[.49,.111],[.32,-.15],[-.32,-.15]],Math.PI);
      panel(body,dark,0,.61,nose-.028,[[-.438,.088],[.438,.088],[.289,-.118],[-.289,-.118]],Math.PI);
    }
    if (camry) {
      panel(body,dark,0,.525,nose-.018,[[-.60,.08],[.60,.08],[.55,-.11],[-.55,-.11]],Math.PI);
      for (const y of [.47,.515,.56]) box(body,paint,0,y,nose-.025,1.06,.015,.012);
    }
    if (crv) {
      panel(body,dark,0,.778,nose-.027,[[-.49,.115],[.49,.115],[.395,-.14],[-.395,-.14]],Math.PI);
      box(body,metal,0,.592,nose-.020,1.19,.055,.033);
    }
    if (porsche) {
      panel(body,dark,0,.482,nose-.026,[[-.72,.058],[-.57,.012],[-.41,.014],[-.38,.077],
        [.38,.077],[.41,.014],[.57,.012],[.72,.058],[.67,-.072],[-.67,-.072]],Math.PI);
      box(body,dark,0,.382,nose+.002,1.44,.044,.20);
      box(body,tail,0,.727,rearEdge+.023,1.32,.021,.030);
      box(body,dark,0,.448,rearEdge-.021,1.49,.112,.18);
      for (const side of [-1,1]) {
        const vent = oval(body,dark,side*.233,.814,-length*.375,.173,.011,.143);
        vent.rotation.x = -.31;
        box(body,dark,side*.843,.424,-.09,.050,.062,length*.46);
      }
    }
  }
  box(body, metal, 0, .44, length/2-.07, width*.93, .13, .15);
  if (type === 'Bus') {
    box(body, paint, 0, 1.86, 0, width, 2.48, length-.09);
    box(body, glass, 0, 2.14, -length/2+.035, width*.86, .66, .07);
    for (const side of [-1,1]) for (let z = -3.4; z <= 3.4; z += 1.15) {
      box(body, glass, side*width/2, 2.17, z, .03, .62, .94);
    }
  } else if (ford) {
    loft(body,glass,[
      [-1.54,.84,1.20,1.29,.035],[-.89,.80,1.20,height-.06,.09],[.44,.80,1.20,height-.07,.08],[.82,.77,1.19,1.54,.055],
    ]);
    box(body,paint,0,height-.023,-.17,1.60,.073,1.49);
    for (const side of [-1,1]) {
      box(body,dark,side*.953,1.16,length*.291,.12,.06,length*.395);
      box(body,dark,side*.924,.55,-.55,.16,.075,2.23);
      box(body,paint,side*.91,1.36,-1.21,.29,.15,.23);
      box(body,metal,side*.976,1.15,-.30,.029,.042,.16);
    }
  } else if (heavy || pickup) {
    const cabZ = heavy ? -length/2+.86 : pickup ? -.96 : hatch ? .12 : -.14;
    const cabLength = heavy ? 1.69 : pickup ? 1.79 : hatch ? 2.15 : 1.75;
    const cabBase = heavy ? 1.03 : .89;
    const cabTop = heavy ? 2.53 : height;
    box(body, glass, 0, (cabBase+cabTop)/2, cabZ, width*.83, cabTop-cabBase, cabLength);
    box(body, paint, 0, cabTop, cabZ, width*.87, .09, cabLength+.04);
    if (heavy) {
      box(body, paint, 0, 1.99, .91, width, 2.2, length-1.85);
      box(body, metal, 0, 1.95, length/2+.006, .035, 1.92, .028);
    } else if (pickup) {
      for (const side of [-1,1]) box(body, paint, side*.94, .99, 1.46, .16, .35, 2.22);
      box(body, paint, 0, .98, length/2-.08, width*.9, .38, .13);
    }
  } else if (porsche) {
    porscheRoof(body,paint,width,length,height);
    for (const side of [-1,1]) {
      box(body,dark,side*.748,.970,-.82,.152,.039,.094);
      box(body,paint,side*.840,1.005,-.82,.214,.073,.163);
      box(body,dark,side*.937,.902,-.12,.014,.022,.126);
      box(body,bodySeam,side*.906,.665,.515,.011,.29,.015);
    }
  } else {
    const fastback = style === 'Sportback' || sports;
    const rear = hatch || suv ? .41 : fastback || camry ? .34 : .28;
    const roofEnd = crv ? .30 : hatch || suv ? .33 : fastback || camry ? .12 : .15;
    const roofStart = amg ? -.078 : midEngine ? -.22 : porsche ? -.15 : sports ? -.13 : -.17;
    loft(body,glass,[
      [-length*.295,width*.41,roofBase-.025,roofBase+.05,.02],
      [length*roofStart,width*.35,roofBase-.022,height-.065,.073],
      [length*roofEnd,width*.36,roofBase-.022,height-.065,.073],
      [length*rear,width*.39,roofBase-.025,roofBase+.048,.02]
    ]);
    loft(body,paint,[
      [length*(roofStart-.026),width*.275,height-.13,height-.087,.018],
      [length*roofStart,width*.29,height-.13,height,.019],
      [length*roofEnd,width*.30,height-.13,height-.013,.02],
      [length*(roofEnd+.028),width*.282,height-.137,height-.09,.017]
    ]);
    if (touring) box(body,blue,0,height-.003,length*(roofStart+roofEnd)/2,.214,.02,length*(roofEnd-roofStart)*.92);
    for (const side of [-1,1]) {
      box(body,paint,side*width*.48,roofBase+.126,-length*.206,.20,.082,.16);
      box(body,dark,side*width*.49,roofBase-.025,length*.045,.016,.028,.22);
      if (scorpio) {
        box(body,dark,side*.60,height+.017,length*.11,.039,.058,1.65);
        box(body,dark,side*width*.49,1.31,length*.129,.014,.58,.062);
        box(body,metal,side*width*.493,.898,length*.18,.026,.026,.126);
        box(body,dark,side*width*.48,.44,0,.11,.12,length*.58);
      }
      if (midEngine) {
        const intake = [[-.40,-.035],[.27,-.104],[.36,.036],[-.19,.11],[-.41,.069]]
          .map(([px,py])=>[px*-side,py]);
        const scoop = panel(body,dark,side*width*.463,.656,.34,intake,side*Math.PI/2);
        scoop.rotation.order = 'YXZ';
        scoop.rotation.x = .12*side;
      }
      if (crv) {
        box(body,dark,side*.60,height+.016,.26,.042,.062,1.64);
        box(body,dark,side*width*.491,.44,0,.092,.15,length*.57);
        box(body,metal,side*width*.494,.94,length*.14,.025,.027,.135);
      }
      if (camry || altima) {
        box(body,dark,side*width*.47,.49,0,.048,.074,length*.51);
        box(body,paint,side*width*.493,.855,length*.137,.016,.029,.141);
      }
      if (altima || camry || crv) {
        box(body,bodySeam,side*width*.364,(roofBase+height-.045)/2,.02,
          .019,height-roofBase-.13,.072);
        box(body,bodySeam,side*width*.473,.697,.080,.012,.31,.014);
      }
    }
  }
  const wheelSpecs = [];
  for (const side of [-1,1]) {
    const lampY = heavy || pickup || suv ? .87 : .735;
    const lampWidth = style === 'Sportback' || touring ? .245 : .19;
    if (porsche) {
      const lensX = side*width*.345, lensZ = -length*.414;
      oval(body,dark,lensX,.780,lensZ,.141,.026,.183).rotation.x = -.37;
      oval(body,lensHousing,lensX,.794,lensZ,.122,.020,.165).rotation.x = -.37;
      for (const px of [-.043,.043]) for (const pz of [-.055,.062]) {
        oval(body,white,lensX+px,.809+pz*.35,lensZ+pz,.018,.008,.022).rotation.x = -.37;
      }
      box(body,tail,side*width*.367,.725,length/2+.023,.24,.029,.035);
    } else if (scorpio) {
      const end = length/2;
      box(body,white,side*.68,.889,-end-.029,.37,.072,.038);
      const returnLamp = [[-.128,.13],[.115,.13],[.115,-.10],[.072,-.10],[.072,.084],[-.128,.084]]
        .map(([px,py])=>[px*side,py]);
      panel(body,white,side*.69,.764,-end-.053,returnLamp,Math.PI);
      box(body,dark,side*.836,1.16,end-.27,.143,.57,.089);
      box(body,tail,side*.836,1.17,end-.219,.090,.49,.046);
      box(body,tail,side*.765,.981,end-.216,.20,.060,.044);
    } else if (midEngine || amg) {
      const end = length/2;
      const front = [[-.21,-.014],[.12,-.078],[.25,.026],[.081,.071],[-.18,.035]]
        .map(([px,py])=>[px*side,py]);
      panel(body,dark,side*.58,midEngine ? .625 : .72,-end-.025,front,Math.PI);
      const strip = [[-.18,.019],[.21,.038],[.17,.012],[-.16,-.008]].map(([px,py])=>[px*side,py]);
      panel(body,white,side*.58,midEngine ? .633 : .741,-end-.052,strip,Math.PI);
      panel(body,tail,side*.54,midEngine ? .757 : .777,end+.029,strip);
    } else if (altima || camry || crv) {
      const wing = shape => shape.map(([x,y])=>[x*side,y]);
      const head = altima ? [[-.20,-.008],[-.055,-.032],[.21,.038],[.16,.064],[-.20,.032]]
        : camry ? [[-.19,.008],[-.12,-.025],[.22,.031],[.16,.054],[-.12,.016]]
          : [[-.18,-.01],[.18,-.01],[.22,.041],[-.16,.034]];
      panel(body,white,side*.63,crv ? .863 : .718,nose-.036,wing(head),Math.PI);
      if (crv) {
        const pillarLight = panel(body,tail,side*.733,1.12,length*.406,wing(
          [[-.23,-.14],[.13,-.14],[.132,.39],[.080,.35],[.061,-.062],[-.23,-.079]],
        ));
        pillarLight.rotation.set(-.71,0,side*.24);
        box(body,tail,side*.71,.973,rearEdge+.023,.30,.034,.033);
      } else {
        const rear = altima ? [[-.16,-.038],[.18,-.045],[.24,.019],[.08,.052],[-.17,.016]]
          : [[-.21,-.037],[-.11,-.02],[.20,-.015],[.23,.040],[.01,.014],[-.23,-.008]];
        panel(body,tail,side*.64,.855,rearEdge+.025,wing(rear));
      }
    } else if (ford) {
      box(body,dark,side*.79,.976,nose-.025,.226,.327,.031);
      const light = [[-.105,.155],[.098,.155],[.098,-.14],[-.100,-.14],[-.100,-.104],[.054,-.104],[.054,.116],[-.105,.116]];
      panel(body,white,side*.79,.970,nose-.047,light.map(([x,y])=>[x*side,y]),Math.PI);
      box(body,dark,side*.82,.934,rearEdge+.025,.17,.35,.045);
      box(body,tail,side*.82,.96,rearEdge+.056,.11,.26,.037);
      box(body,white,side*.82,.829,rearEdge+.061,.089,.034,.018);
    } else {
      box(body,white,side*width*.33,lampY,-length/2-.016,width*lampWidth,.061,.032);
      box(body,tail,side*width*.32,lampY+.045,length/2+.012,width*.215,.067,.036);
    }
    if (touring) box(body,tail,side*width*.38,lampY+.006,length/2+.014,width*.092,.026,.031);
    const front = -length*.31, rear = length*.29;
    const wheel = externalWheels ? null : wheelGeometry(radius,sports,side);
    for (const z of heavy ? [front,rear,rear+.79] : [front,rear]) {
      const wx = side*width*.47;
      if (externalWheels) {
        wheelSpecs.push([wx, radius, z, radius, z===front]);
      } else {
        const center = new T.Vector3(wx,radius,z);
        const {roller} = wheelPivot(assembly,center,radius,z===front);
        mesh(roller,wheel,wheelMaterial,0,0,0);
      }
    }
  }
  const labels = {
    'Touring coupe':'BMW',
  };
  const badgeHeight = porsche ? .678 : midEngine ? .652 : amg ? .725 : scorpio || crv ? .914 : ford ? .994 : .795;
  if (labels[style]) badge(body,labels[style],0,badgeHeight,rearEdge+(ford ? .051 : .030),.30,.057);
  batchMeshes(body);
  if (externalWheels) {
    const trimParts = [];
    for (const part of [...body.children]) {
      if (!part.isMesh || part.material === paint || part.material === tail || part.material === white) continue;
      if (part.material.isMeshBasicMaterial) continue;
      let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      const col = part.material.color || new T.Color(0xffffff);
      const verts = g.attributes.position.count;
      const arr = new Float32Array(verts * 3);
      for (let i = 0; i < verts; i++) {
        const o = i * 3;
        arr[o] = col.r; arr[o + 1] = col.g; arr[o + 2] = col.b;
      }
      g.setAttribute('color', new T.BufferAttribute(arr, 3));
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(a)) g.deleteAttribute(a);
      trimParts.push(g);
      part.geometry.dispose();
      body.remove(part);
    }
    if (trimParts.length) {
      const mergedTrim = mergeGeometries(trimParts, false);
      for (const g of trimParts) g.dispose();
      if (mergedTrim) mesh(body, mergedTrim, sharedTrafficTrimMat, 0, 0, 0);
    }
  }
  body.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  if (includeShade) shadeVehicle(assembly,width,length);
  assembly.userData.paint = paint;
  assembly.userData.tailLight = tail;
  const footprintKey = `${type}/${style}`;
  if (!proceduralFootprints.has(footprintKey)) proceduralFootprints.set(footprintKey,vehicleFootprint(assembly));
  let wheelPhase = 0;
  let wheelSteer = 0;
  const animateWheels = externalWheels
    ? (travel, steering = 0) => {
        if (wheelSpecs.length) wheelPhase = (wheelPhase - travel / wheelSpecs[0][3]) % (Math.PI * 2);
        wheelSteer = -.49 * T.MathUtils.clamp(steering, -1, 1);
      }
    : wheelAnimator(assembly);
  return {
    body:assembly,sprung:body,animateWheels,wheelSpecs,
    getWheelPose: () => ({ phase: wheelPhase, steer: wheelSteer }),
    width,length,footprint:proceduralFootprints.get(footprintKey)
  };
}

const sharedTrafficTrimMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .32 });

function buildGlowTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1;
    const dy = (y + .5) / size * 2 - 1;
    const r = Math.hypot(dx * 0.85, dy * 1.15);
    const a = Math.exp(-r * r * 5.2) * Math.max(0, 1 - r);
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(255 * a);
  }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const glowTexture = buildGlowTexture();
const tailGlowMaterial = new T.MeshBasicMaterial({
  map: glowTexture,
  color: 0xff3044,
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
  toneMapped: false,
  opacity: .85,
});
const instancedGlowMaterial = new T.MeshBasicMaterial({
  map: glowTexture,
  color: 0xffffff,
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
  toneMapped: false,
  opacity: 1,
});
const retroReflectorMaterial = new T.MeshPhysicalMaterial({
  color: 0xe82c3a,
  roughness: .06,
  metalness: .42,
  clearcoat: .95,
  clearcoatRoughness: .05,
  emissive: 0x3b080e,
});
const rearChromeTrimMaterial = new T.MeshPhysicalMaterial({
  color: 0xc2ccd6,
  roughness: .10,
  metalness: .88,
  clearcoat: .90,
  clearcoatRoughness: .08,
});
const tailGlowGeometry = new T.PlaneGeometry(1, 1);

function mergeBoxes(specs) {
  const parts = specs.map(([w, h, d, x, y, z]) => {
    const g = new T.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

export function trafficVehicle(parent,type,color,style,asset,prepareShader=null,options={}) {
  const { externalGlow = false, externalShade = false, externalWheels = false } = options;
  const car = vehicleBody(parent,type,color,style,{ includeShade: !externalShade, externalWheels });
  applyTrafficHeadlightReflection(car.body,car.body.userData.paint);
  const fallbackFootprint = car.footprint;
  const fallback = car.body.children.filter(part=>part.name!=='Contact shade');
  const {height} = dimensions(type,style);
  const heavy = type === 'Heavy truck' || type === 'Bus';
  const tailY = heavy ? height * .34 : T.MathUtils.clamp(height * .48, .56, .98);
  const headY = heavy ? height * .36 : T.MathUtils.clamp(height * .46, .52, .92);
  const tailZ = car.length * .506;
  const headZ = -car.length * .506;
  const reflectorY = Math.max(.36, tailY - (heavy ? .14 : .16));
  const lampW = Math.max(.20, car.width * .19);
  const tailX = car.width * .34;
  car.haloSpec = { width: car.width, tailY, tailZ, headY, headZ, heavy };

  const tailGeom = mergeBoxes([
    [lampW, heavy ? .115 : .072, .038, -tailX, tailY, tailZ],
    [lampW, heavy ? .115 : .072, .038,  tailX, tailY, tailZ],
  ]);
  const lamp = mesh(car.body, tailGeom, car.body.userData.tailLight, 0, 0, 0);
  lamp.userData.sharedVehicleGeometry = true;

  if (externalWheels) {
    // Consolidate chrome bumper trim and red retro-reflectors into one vertex-colored mesh.
    const reflGeom = mergeBoxes([
      [lampW * .92, .044, .024, -tailX, reflectorY, tailZ + .002],
      [lampW * .92, .044, .024,  tailX, reflectorY, tailZ + .002],
    ]);
    const trimGeom = new T.BoxGeometry(car.width * .46, .024, .018);
    trimGeom.translate(0, Math.max(.42, reflectorY + .06), tailZ);
    const rNon = reflGeom.toNonIndexed(), tNon = trimGeom.toNonIndexed();
    reflGeom.dispose(); trimGeom.dispose();
    const paintVerts = (geom, hex) => {
      const c = new T.Color(hex), n = geom.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const o = i * 3; a[o] = c.r; a[o + 1] = c.g; a[o + 2] = c.b; }
      geom.setAttribute('color', new T.BufferAttribute(a, 3));
      for (const k of Object.keys(geom.attributes)) if (!['position', 'normal', 'color'].includes(k)) geom.deleteAttribute(k);
    };
    paintVerts(rNon, 0xe82c3a);
    paintVerts(tNon, 0xc2ccd6);
    const mergedRear = mergeGeometries([rNon, tNon], false);
    rNon.dispose(); tNon.dispose();
    if (mergedRear) {
      const rearPart = mesh(car.body, mergedRear, sharedTrafficTrimMat, 0, 0, 0);
      rearPart.userData.sharedVehicleGeometry = true;
    }
  } else {
    const trimStrip = box(car.body, rearChromeTrimMaterial, 0, Math.max(.42, reflectorY + .06), tailZ, car.width * .46, .024, .018);
    trimStrip.userData.sharedVehicleGeometry = true;
    const reflGeom = mergeBoxes([
      [lampW * .92, .044, .024, -tailX, reflectorY, tailZ + .002],
      [lampW * .92, .044, .024,  tailX, reflectorY, tailZ + .002],
    ]);
    const reflector = mesh(car.body, reflGeom, retroReflectorMaterial, 0, 0, 0);
    reflector.userData.sharedVehicleGeometry = true;
  }

  if (!externalGlow) {
    for (const side of [-1, 1]) {
      const halo = mesh(car.body, tailGlowGeometry, tailGlowMaterial, side * tailX, tailY, tailZ + .028);
      halo.scale.set(car.width * .46, .44, 1);
      halo.userData.sharedVehicleGeometry = true;
    }
    car.body.userData.tailGlowMaterial = tailGlowMaterial;
  }

  const indZ = car.length * .5 + .025;
  const indX = car.width * .38;
  const indY = height * .52;
  const leftInd = mesh(car.body, mergeBoxes([[.16, .056, .035, -indX, indY, -indZ], [.16, .056, .035, -indX, indY, indZ]]), indicatorLamp, 0, 0, 0);
  const rightInd = mesh(car.body, mergeBoxes([[.16, .056, .035,  indX, indY, -indZ], [.16, .056, .035,  indX, indY, indZ]]), indicatorLamp, 0, 0, 0);
  leftInd.visible = rightInd.visible = false;
  leftInd.userData.sharedVehicleGeometry = rightInd.userData.sharedVehicleGeometry = true;
  car.flashSignal = (side, seconds) => {
    const blink = seconds % .78 < .44;
    leftInd.visible = side === -1 && blink;
    rightInd.visible = side === 1 && blink;
  };
  const rollFallback = car.animateWheels;
  let model, pendingModel, rollModel, requested = false, near = false;

  function updateVisibility() {
    if (!model) return;
    model.visible = near;
    for (const part of fallback) part.visible = !near;
    car.useExternalWheels = !near && externalWheels;
    car.footprint = near ? model.userData.footprint : fallbackFootprint;
  }
  car.useExternalWheels = externalWheels;
  const lodBands = isMobileDevice
    ? { Low: [0, 0], Medium: [28, 36], High: [42, 52], Ultra: [56, 68] }
    : { Low: [0, 0], Medium: [48, 60], High: [76, 92], Ultra: [95, 115] };
  car.updateModel = (distance, canAttach = true, quality = 'High') => {
    const [enterDist, exitDist] = lodBands[quality] || lodBands.High;
    const useDetail = enterDist > 0 && distance < (near ? exitDist : enterDist);
    if (useDetail !== near) {
      near = useDetail;
      updateVisibility();
    }
    if (pendingModel && canAttach) {
      model = pendingModel.clone(true);
      pendingModel = null;
      applyTrafficHeadlightReflection(model);
      model.traverse(part => {
        if (part.isMesh) {
          part.userData.sharedVehicleGeometry = true;
          part.castShadow = !part.material?.transparent;
          part.receiveShadow = !part.material?.transparent;
        }
      });
      car.body.add(model);
      rollModel = wheelAnimator(model);
      updateVisibility();
      return true;
    }
    if (!near || requested || !asset) return false;
    requested = true;
    loadVehicleAsset({ asset, type, style }).then(async template => {
      if (!template || !car.body.parent) return;
      if (prepareShader) {
        try { await prepareShader(template); } catch {}
      }
      if (car.body.parent) pendingModel = template;
    });
    return false;
  };
  car.animateWheels = (travel,steering)=>{
    rollFallback(travel,steering);
    rollModel?.(travel,steering);
  };
  return car;
}

const indicatorLamp = new T.MeshBasicMaterial({color:0xffa22c,toneMapped:false});
const random = (lo, hi) => lo + Math.random() * (hi-lo);

export function buildTraffic(scene, prepareShader=null) {
  const fleet = Array.from({length:Math.max(24,trafficSpecs.length)}, (_,i) => {
    const spec = trafficSpecs[i % trafficSpecs.length];
    const model = trafficVehicle(scene,...spec,prepareShader,{ externalGlow: true, externalShade: true, externalWheels: true });
    model.body.visible = false;
    model.type = spec[0];
    return model;
  });

  const unitWheelGeom = wheelGeometry(1, false, 1);
  const wheelInstanced = new T.InstancedMesh(unitWheelGeom, wheelMaterial, fleet.length * 6);
  wheelInstanced.frustumCulled = false;
  wheelInstanced.castShadow = true;
  wheelInstanced.count = 0;
  scene.add(wheelInstanced);
  const wheelObj = new T.Object3D();

  const shadePlane = new T.PlaneGeometry(1, 1);
  shadePlane.rotateX(-Math.PI / 2);
  const shadeInstanced = new T.InstancedMesh(shadePlane, shadowMaterial, fleet.length);
  shadeInstanced.frustumCulled = false;
  shadeInstanced.count = 0;
  scene.add(shadeInstanced);

  const glowInstanced = new T.InstancedMesh(tailGlowGeometry, instancedGlowMaterial, fleet.length * 4);
  glowInstanced.frustumCulled = false;
  glowInstanced.setColorAt(0, new T.Color(0xffffff));
  glowInstanced.instanceColor.setUsage(T.DynamicDrawUsage);
  glowInstanced.count = 0;
  scene.add(glowInstanced);

  const scratchObj = new T.Object3D();
  const tailTint = new T.Color(0xff283e);
  const headTint = new T.Color(0xffe4bc);
  const tmpTint = new T.Color();
  const posScratch = { x: 0, z: 0, heading: 0 };

  function spawn(car, station, lane) {
    car.station = station;
    car.lane = lane;
    car.offset = lanes[lane];
    car.target = lane;
    car.signal = 0;
    car.signalAge = 0;
    car.pace = random(16,29) - (car.type === 'Heavy truck' || car.type === 'Bus' ? 4 : 0);
    car.speed = car.pace;
    car.timer = random(4,17);
    car.passed = false;
    car.closest = Infinity;
    car.ghosted = false;
    car.blinkUntil = 0;
  }
  function blinkAndHide(car) {
    if (!car) return;
    car.ghosted = true;
    car.blinkUntil = performance.now() + 950;
  }
  function reset(distance) {
    const sideLanes = [0,1,3];
    for (const [i,car] of fleet.entries()) {
      const station = distance - 22 + i*14;
      const nearStart = station >= distance-24 && station <= distance+34;
      const lane = nearStart ? sideLanes[i%sideLanes.length] : i%4;
      spawn(car, station, lane);
    }
  }
  reset(0);

  const active = [];
  const solidActive = [];
  const playerDrivers = [{station:0,offset:0,speed:0}];
  const emptyDrivers = [];
  function stationOccupied(car,lane,station) {
    for (const other of active) {
      if (other !== car && (other.lane===lane || other.target===lane) && Math.abs(other.station-station)<17) return true;
    }
    return false;
  }

  function update(dt,distance,offset,count,canScore,playerSpeed,playerFootprint,playerYaw,previous,near,crash,quality='High',daylight=0) {
    let firstContact = null, hitCar = null;
    const player = {distance,x:offset};
    let drivers = emptyDrivers;
    if (canScore) {
      playerDrivers[0].station = distance;
      playerDrivers[0].offset = offset;
      playerDrivers[0].speed = playerSpeed;
      drivers = playerDrivers;
    }
    const now = performance.now();
    active.length = 0;
    solidActive.length = 0;
    for (let i=0;i<fleet.length;i++) {
      const car = fleet[i];
      const inRange = i < count;
      if (inRange) {
        active.push(car);
        if (!car.ghosted) solidActive.push(car);
      }
      if (!inRange) {
        car.body.visible = false;
      } else if (car.ghosted) {
        car.body.visible = now < car.blinkUntil ? Math.floor(now / 85) % 2 === 0 : false;
      } else {
        car.body.visible = true;
      }
    }
    for (const car of active) {
      if (car.station < distance-38 || car.station > distance+475) {
        const lane = Math.floor(random(0,4));
        let station = distance+122+random(0,8);
        while (stationOccupied(car,lane,station)) station += 18;
        spawn(car,station,lane);
      }
      car.timer -= dt;
      let next = car.lane;
      if (car.timer <= 0) {
        next = T.MathUtils.clamp(car.lane + (Math.random() < .5 ? 1 : -1), 0, lanes.length-1);
        car.timer = random(5,15);
      }
      signalLaneChange(car,dt,next,solidActive,drivers);
    }
    moveTraffic(solidActive,dt);
    for (const car of active) {
      car.previousOffset = car.offset;
      car.offset = T.MathUtils.damp(car.offset,lanes[car.target],1.15,dt);
      settleLaneChange(car);
      const dz = car.station - distance;
      const dx = Math.abs(car.offset-offset);
      if (!canScore || car.ghosted) continue;
      const halfWidth = (car.footprint.width+playerFootprint.width)/2;
      const halfLength = (car.footprint.length+playerFootprint.length)/2;
      const impact = trafficContact(player,previous,playerFootprint,playerYaw,car,car.footprint);
      if (impact !== null) {
        if (firstContact === null || impact < firstContact) {
          firstContact = impact;
          hitCar = car;
        }
      } else if (!car.passed && playerSpeed > car.speed + 2.5) {
        if (Math.abs(dz) < halfLength+1) car.closest = Math.min(car.closest,Math.max(0,dx-halfWidth));
        if (dz < -halfLength) {
          car.passed = true;
          if (car.closest <= .65) near();
        }
      }
    }
    if (firstContact !== null) {
      const stop = firstContact;
      distance = T.MathUtils.lerp(previous.distance,distance,stop);
      for (const car of active) {
        car.station = T.MathUtils.lerp(car.previousStation,car.station,stop);
        car.offset = T.MathUtils.lerp(car.previousOffset,car.offset,stop);
      }
      crash(stop,hitCar);
    }
    const roadOrigin = roadX(distance);
    let attachedThisFrame = false;
    let shadeCount = 0, glowCount = 0, wheelCount = 0;
    const maxForward = isMobileDevice ? 260 : 320;
    const isSpriteTier = isMobileDevice && (quality === 'High' || quality === 'Ultra');
    const tailAlpha = (.52 + .44 * (1 - daylight)) * (isSpriteTier ? 1.15 : .88);
    const headAlpha = (1.0 - daylight * .62) * .78;

    for (const car of active) {
      const gap = car.station - distance;
      if (car.body.visible && (gap < -34 || gap > maxForward)) {
        car.body.visible = false;
      }
      const position = roadPosition(car.station,car.offset,posScratch);
      const bx = position.x-roadOrigin;
      const bz = position.z+distance;
      const byaw = position.heading+trafficTurn(car);
      car.body.position.set(bx,0,bz);
      car.body.rotation.y = byaw;
      if (car.updateModel(Math.abs(gap),!attachedThisFrame,quality)) attachedThisFrame = true;
      car.flashSignal(car.signal,car.signalAge);
      car.animateWheels(car.station-car.previousStation,(lanes[car.target]-car.offset)*.19);

      if (car.body.visible) {
        const cos = Math.cos(byaw), sin = Math.sin(byaw);
        if (car.useExternalWheels && car.wheelSpecs?.length) {
          const { phase, steer } = car.getWheelPose();
          for (let w = 0; w < car.wheelSpecs.length; w++) {
            const [wx, wy, wz, wr, isFront] = car.wheelSpecs[w];
            wheelObj.position.set(bx + wx * cos + wz * sin, wy, bz + wz * cos - wx * sin);
            wheelObj.rotation.set(phase, byaw + (isFront ? steer : 0) + (wx < 0 ? Math.PI : 0), 0, 'YXZ');
            wheelObj.scale.setScalar(wr);
            wheelObj.updateMatrix();
            if (wheelCount < fleet.length * 6) wheelInstanced.setMatrixAt(wheelCount++, wheelObj.matrix);
          }
        }
        scratchObj.position.set(bx, .008, bz);
        scratchObj.rotation.set(0, byaw, 0);
        scratchObj.scale.set(car.width * 1.24, 1, car.length * 1.01);
        scratchObj.updateMatrix();
        shadeInstanced.setMatrixAt(shadeCount++, scratchObj.matrix);

        const hs = car.haloSpec;
        if (hs && Math.abs(car.station - distance) < 220) {
          const tailX = hs.width * .34;
          const tailScaleW = hs.width * (isSpriteTier ? .54 : .46);
          const tailScaleH = isSpriteTier ? .52 : .44;
          tmpTint.copy(tailTint).multiplyScalar(tailAlpha);
          for (const side of [-1, 1]) {
            const lx = side * tailX, lz = hs.tailZ + .028;
            scratchObj.position.set(bx + lx * cos + lz * sin, hs.tailY, bz + lz * cos - lx * sin);
            scratchObj.rotation.set(0, byaw, 0);
            scratchObj.scale.set(tailScaleW, tailScaleH, 1);
            scratchObj.updateMatrix();
            if (glowCount < fleet.length * 4) {
              glowInstanced.setMatrixAt(glowCount, scratchObj.matrix);
              glowInstanced.setColorAt(glowCount++, tmpTint);
            }
          }
          if (isSpriteTier) {
            tmpTint.copy(headTint).multiplyScalar(headAlpha);
            for (const side of [-1, 1]) {
              const lx = side * tailX, lz = hs.headZ - .03;
              scratchObj.position.set(bx + lx * cos + lz * sin, hs.headY, bz + lz * cos - lx * sin);
              scratchObj.rotation.set(0, byaw + Math.PI, 0);
              scratchObj.scale.set(hs.width * .50, .48, 1);
              scratchObj.updateMatrix();
              if (glowCount < fleet.length * 4) {
                glowInstanced.setMatrixAt(glowCount, scratchObj.matrix);
                glowInstanced.setColorAt(glowCount++, tmpTint);
              }
            }
          }
        }
      }
    }
    shadeInstanced.count = shadeCount;
    if (shadeCount) shadeInstanced.instanceMatrix.needsUpdate = true;
    wheelInstanced.count = wheelCount;
    wheelInstanced.visible = wheelCount > 0;
    if (wheelCount) wheelInstanced.instanceMatrix.needsUpdate = true;
    glowInstanced.count = glowCount;
    if (glowCount) {
      glowInstanced.instanceMatrix.needsUpdate = true;
      glowInstanced.instanceColor.needsUpdate = true;
    }
  }
  async function preload(canWork = () => true) {
    const seen = new Set();
    for (const [type,,style,asset] of trafficSpecs) {
      if (!asset || seen.has(asset)) continue;
      seen.add(asset);
      while (!canWork()) await new Promise(resolve=>setTimeout(resolve,400));
      await loadVehicleAsset({asset,type,style});
      await new Promise(resolve=>setTimeout(resolve,120));
    }
  }
  return {update,reset,preload,blinkAndHide,getActive:() => solidActive,visitVisible(visit) {
    for (const car of fleet) if (car.body.visible) visit(car);
  }};
}
