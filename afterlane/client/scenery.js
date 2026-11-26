import * as T from 'three';
import { batchMeshes, box, group, luminous, mesh, surface } from './car.js';

const concrete = surface(0x666263);
const pavement = surface(0x333941);
const dark = surface(0x21252a);
const trim = surface(0x888381);
const windows = surface(0x242e35,.34);
const plaster = [0x8a7d68,0x6f7877,0x8b6a56,0x627077].map(color=>surface(color));
const brick = [0x705046,0x5e625f,0x83725b,0x4d5962].map(color=>surface(color));
const roofs = [0x482e2e,0x42474a,0x61503f].map(color=>surface(color));
const shutters = surface(0x3e464a,.6,.25);
const warmGlass = luminous(0x946939);
const warmLamp = luminous(0xffcf8e);
const upperWindow = luminous(0x61513a);
const blind = surface(0x6d6255);
const snowMound = new T.IcosahedronGeometry(1,1);
const rock = new T.IcosahedronGeometry(1,0);
const stone = surface(0x333941);
const snowBank = surface(0xbfc8cb,.88);
const redRock = [0x7a4533,0x98624a,0xad795b].map(color=>surface(color,.92));
const cactus = surface(0x294634,.84);
const desertLeaves = surface(0x56714a,.88);
const desertGrass = surface(0x9a7942,.95);
const desertBlade = new T.ConeGeometry(1,1,4);
const branch = new T.CylinderGeometry(.80,1,1,8);
const soil = surface(0x6e5034,.9);
const crop = surface(0x6e8235,.84);
const cornTips = surface(0xbf9a45,.88);
const paddyWater = new T.MeshPhysicalMaterial({color:0x496b5f,roughness:.20,metalness:.12,clearcoat:.48});
const riceLeaves = surface(0x83984d);
const mountain = surface(0x637165);
const peak = new T.ConeGeometry(1,1,7);
const pyramidStone = surface(0xc4a176,.90);
const pyramidShape = new T.ConeGeometry(1,1,4);
const labels = new Map();
const storefronts = [
  {name:'MIRA MARKET',note:'GROCERIES',ink:'#f7e8a6',field:'#20372b',glass:0x8a9b6b},
  {name:'NIGHT CAFE',note:'COFFEE & BAKES',ink:'#ffe09f',field:'#492625',glass:0xbb8053},
  {name:'PAPER & INK',note:'BOOKS',ink:'#f4dbf3',field:'#49354d',glass:0x8e7390},
  {name:'ARCADE',note:'OPEN LATE',ink:'#a9f7e7',field:'#122d3c',glass:0x648591},
  {name:'CORNER DELI',note:'SANDWICHES',ink:'#ffe6c2',field:'#3e2525',glass:0x977255},
  {name:'PHARMACY',note:'PRESCRIPTIONS',ink:'#c2f2d7',field:'#193a38',glass:0x709b94},
  {name:'BAKERY NO. 12',note:'FRESH BREAD',ink:'#ffc799',field:'#493229',glass:0x9b714c},
  {name:'CYCLE WORKS',note:'SALES & REPAIRS',ink:'#b8dfff',field:'#263647',glass:0x72839b}
].map((info,index)=>({...info,glow:luminous(info.glass),awning:surface(info.field),wall:brick[index%brick.length]}));

function paintedSign(name,field,ink,note='') {
  const key = [name,field,ink,note].join('|');
  if (labels.has(key)) return labels.get(key);
  let material = luminous(field);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = field;
    ctx.fillRect(0,0,512,128);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(8,8,496,112);
    ctx.fillStyle = ink;
    ctx.font = '750 49px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name,256,note ? 52 : 64,462);
    if (note) {
      ctx.font = '650 19px system-ui';
      ctx.fillText(note,256,95,430);
    }
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    material = new T.MeshBasicMaterial({map});
  }
  labels.set(key,material);
  return material;
}

function pane(root,x,y,z,width,height,glass,divided=true) {
  box(root,dark,x,y,z,width+.10,height+.10,.105);
  box(root,glass,x,y,z+.062,width,height,.024);
  box(root,trim,x,y-height/2-.063,z+.077,width+.19,.076,.16);
  if (divided) {
    box(root,dark,x,y,z+.085,.048,height,.055);
    box(root,dark,x,y+.10,z+.085,width,.043,.055);
  }
}

function shop(root,center,index,lit) {
  const style = storefronts[index%storefronts.length];
  const face = -1.36;
  const upper = index%3 !== 1;
  const h = upper ? 6.55 : 4.0;
  const width = 7.68;
  const depth = 7.2;
  const unit = group(root,center,.008,0);
  box(unit,style.wall,0,h/2,face-depth/2,width,h,depth);
  box(unit,concrete,0,.11,-3.5,width+.26,.22,6.15);
  box(unit,dark,0,h-.045,face-depth/2,width+.22,.14,depth+.22);
  box(unit,trim,0,3.82,face+.012,width+.13,.12,.20);
  for (const x of [-3.62,3.62]) box(unit,dark,x,1.48,face+.085,.177,2.92,.16);
  const glass = lit ? style.glow : windows;
  for (const x of [-2.27,2.18]) pane(unit,x,1.56,face+.065,2.20,1.55,glass);
  box(unit,dark,0,1.28,face+.095,1.29,2.42,.10);
  box(unit,glass,0,1.56,face+.155,.95,1.53,.018);
  box(unit,dark,0,.62,face+.179,.95,.40,.022);
  box(unit,trim,.35,1.10,face+.183,.051,.23,.038);
  box(unit,concrete,0,.125,face+.33,1.59,.23,.72);
  if (!lit) {
    box(unit,shutters,index%2 ? -2.27 : 2.18,1.49,face+.166,2.28,1.76,.09);
    for (let i=0;i<8;i++) box(unit,dark,index%2 ? -2.27 : 2.18,.71+i*.217,face+.216,2.21,.021,.033);
  }

  const sign = lit ? paintedSign(style.name,style.field,style.ink,style.note) : style.awning;
  box(unit,dark,0,3.43,face+.062,5.78,.75,.14);
  if (lit) mesh(unit,new T.PlaneGeometry(5.53,.60),sign,0,3.43,face+.142);
  const awning = box(unit,style.awning,0,2.76,face+.36,6.90,.11,1.11);
  awning.rotation.x = .13;
  box(unit,style.awning,0,2.66,face+.87,6.90,.19,.052);
  if (index%3 !== 2) {
    for (const x of [-2.8,-1.68,-.56,.56,1.68,2.8]) box(unit,concrete,x,2.67,face+.90,.41,.155,.025);
  }
  if (lit) {
    box(unit,warmLamp,0,2.675,face+.45,3.85,.023,.035);
    box(unit,dark,-2.84,2.96,face+.52,.107,.58,1.17);
    const blade = new T.PlaneGeometry(1.085,.47);
    mesh(unit,blade,sign,-2.779,2.96,face+.52).rotation.y = Math.PI/2;
    mesh(unit,blade,sign,-2.901,2.96,face+.52).rotation.y = -Math.PI/2;
  }

  if (upper) {
    for (const [i,x] of [-2.47,0,2.47].entries()) {
      pane(unit,x,5.05,face+.04,1.15,1.39,lit && (index+i)%3===0 ? upperWindow : windows);
    }
    box(unit,style.wall,0,6.31,face+.079,7.48,.072,.14);
  }
  box(unit,dark,1.55,h+.21,-5.15,1.52,.38,1.14);
  batchMeshes(unit);
}

function roof(root,centerX,baseY,centerZ,width,depth,rise,material) {
  const outline = new T.Shape();
  outline.moveTo(-width/2,0);
  outline.lineTo(width/2,0);
  outline.lineTo(0,rise);
  outline.closePath();
  const geometry = new T.ExtrudeGeometry(outline,{depth,bevelEnabled:false});
  mesh(root,geometry,material,centerX,baseY,centerZ-depth/2);
}

function house(root,center,index,lit) {
  const unit = group(root,center,0,0);
  const face = -3.35-(index%3)*.35;
  const h = 2.87+(index%2)*.39;
  const width = 6.2+(index%2)*.48;
  const wall = plaster[index%plaster.length];
  const depth = 6.7;
  box(unit,wall,0,h/2,face-depth/2,width,h,depth);
  box(unit,brick[(index+2)%brick.length],0,.25,face-depth/2,width+.06,.5,depth+.07);
  roof(unit,0,h,face-depth/2,width+.48,depth+.48,1.55,roofs[index%roofs.length]);
  box(unit,brick[(index+1)%brick.length],1.1,h+1.13,face-3.3,.51,.94,.58);
  const doorX = index%2 ? -.46 : .55;
  box(unit,dark,doorX,1.08,face+.074,1.04,2.13,.12);
  box(unit,roofs[(index+1)%roofs.length],doorX,1.06,face+.14,.82,1.87,.04);
  box(unit,trim,doorX+.31,.96,face+.167,.054,.069,.037);
  for (const [i,x] of [-1.95,1.95].entries()) {
    const lamp = lit && (index+i)%3===0;
    pane(unit,x,1.67,face+.03,1.25,1.03,lamp ? warmGlass : windows);
    if (lamp) box(unit,blind,x+.36,1.67,face+.105,.28,.96,.024);
  }
  box(unit,dark,doorX+.82,2.14,face+.19,.149,.30,.182);
  if (lit && index%2===0) box(unit,warmLamp,doorX+.82,2.14,face+.29,.09,.14,.053);
  box(unit,concrete,doorX,.10,face+.22,1.60,.20,.67);
  box(unit,pavement,doorX,.007,(face-.63)/2,1.04,.038,Math.abs(face+.63));
  for (const [start,end] of [[-4.22,doorX-.72],[doorX+.72,4.22]]) {
    box(unit,brick[index%brick.length],(start+end)/2,.23,-.80,end-start,.46,.22);
    box(unit,concrete,(start+end)/2,.465,-.80,end-start+.06,.062,.28);
    box(unit,dark,(start+end)/2,.92,-.798,end-start,.045,.043);
    for (let x=start+.12;x<end;x+=.37) box(unit,dark,x,.69,-.79,.042,.48,.042);
  }
  for (const x of [-4.24,doorX-.69,doorX+.69,4.24]) {
    box(unit,brick[index%brick.length],x,.46,-.80,.31,.91,.31);
    box(unit,concrete,x,.94,-.80,.39,.10,.39);
  }
  for (const x of [-4.19,4.19]) box(unit,brick[index%brick.length],x,.20,-3.35,.24,.4,5.25);
  batchMeshes(unit);
  return unit;
}

function plant(root,model,x,z,height,angle,snowy=false) {
  if (!model) return;
  for (const part of model.parts) {
    const foliage = mesh(root,part.geometry,snowy ? part.winter : part.material,x,-.14,z);
    foliage.rotation.y = angle;
    foliage.scale.setScalar(height/model.height);
  }
}

function offset(seed) {
  const hash = Math.imul(seed^0x3c6ef372,0x45d9f3b) ^ Math.imul(seed+7,0x119de1f3);
  return (hash>>>0)/4294967296;
}

function desertBlock(root,index) {
  for (let i=0;i<6;i++) {
    const seed = index*128+i*13;
    const boulder = mesh(root,rock,redRock[i%3],-8+offset(seed)*16,.14,-3-offset(seed+8)*5);
    boulder.scale.set(.40+offset(seed+9)*.80,.28+offset(seed+12)*.52,.35+offset(seed+3)*.80);
    boulder.rotation.y = offset(seed+7)*Math.PI;
  }
  const x = index%2 ? -4.5 : 5.2, z = -3.5-index*.67, h = 1.55+index*.12;
  mesh(root,branch,cactus,x,h*.50,z).scale.set(.22,h,.23);
  for (const side of [-1,1]) {
    const elbowY = h*(side===1 ? .54 : .43);
    mesh(root,branch,cactus,x+side*.24,elbowY,z).scale.set(.13,.53,.135);
    const arm = root.children.at(-1);
    arm.rotation.z = -side*Math.PI/2;
    mesh(root,branch,cactus,x+side*.47,elbowY+.25,z).scale.set(.126,.65,.12);
  }
  for (let i=0;i<7;i++) {
    const seed = index*83+i*19;
    const px = -7+offset(seed)*14, pz = -2.1-offset(seed+31)*11;
    const agave = i%3===0;
    const height = agave ? .82 : .34+offset(seed+7)*.36;
    for (let leaf=0;leaf<5;leaf++) {
      const angle = leaf*Math.PI*2/5+offset(seed+25);
      const blade = mesh(root,desertBlade,agave ? desertLeaves : desertGrass,
        px+Math.cos(angle)*height*.25,height*.30,pz+Math.sin(angle)*height*.25);
      blade.scale.set(agave ? .11 : .028,height,agave ? .047 : .026);
      blade.rotation.order = 'YXZ';
      blade.rotation.y = -angle;
      blade.rotation.z = -(.42+leaf*.15);
    }
  }
}

function cropField(root,index,isRice) {
  const width=17.5, depth=27;
  box(root,soil,0,-.027,-16.8,width,.18,depth);
  if (isRice) box(root,paddyWater,0,.075,-16.8,width-.45,.033,depth-.68);
  for (const side of [-1,1]) box(root,soil,side*8.69,.092,-16.8,.27,.18,depth);
  for (const row of [-4.2,-14.1,-23.9,-29.8]) box(root,soil,0,.089,row,width,.15,.39);
  for (let row=0;row<9;row++) for (let column=0;column<8;column++) {
    const seed=index*80+row*11+column*13;
    const x=-7.44+column*2.13+offset(seed)*.22, z=-4.04-row*2.85;
    if (isRice) {
      for (const side of [-1,1]) {
        const blade=box(root,riceLeaves,x+side*.07,.238,z,.036,.34+offset(seed)*.12,.030);
        blade.rotation.z=side*.24;
      }
    } else {
      const height=.64+offset(seed)*.47;
      box(root,crop,x,height/2+.08,z,.043,height,.043);
      for (const side of [-1,1]) {
        const leaf=box(root,crop,x+side*.083,height*.53+.08,z,.027,.39,.083);
        leaf.rotation.z=side*.61;
      }
      box(root,cornTips,x,height+.09,z,.054,.16,.055);
    }
  }
}

function makeBlock(kind,lit,index,plants) {
  const root = new T.Group();
  function tree(x,z,height,seed,snowy=false) {
    const treeModel = plants?.trees[Math.floor(offset(seed+32)*plants.trees.length)];
    plant(root,treeModel,x,z,height,offset(seed+5)*Math.PI*2,snowy);
  }
  if (kind === 'forest' || kind === 'ice') {
    const snowy = kind === 'ice';
    for (let i=0;i<9;i++) {
      const seed = index*452+i*19;
      const x = -8.55+Math.floor(i/3)*6.1+offset(seed)*4.8;
      const z = -4.0-(i%3)*11.2-offset(seed+11)*3.5;
      tree(x,z,6.0+offset(seed+27)*7.3,seed,snowy);
    }
    for (let i=0;i<5;i++) {
      const x = -8+offset(index*23+i)*16;
      mesh(root,rock,stone,x,.16,-2.1-i*.64).scale.set(.36,.28,.52);
      if (snowy) mesh(root,snowMound,snowBank,x,.035,-.3-i*.57).scale.set(1.5,.34,.80);
    }
    batchMeshes(root);
  } else if (kind === 'desert') {
    desertBlock(root,index);
    batchMeshes(root);
  } else if (kind === 'corn' || kind === 'rice') {
    cropField(root,index,kind==='rice');
    batchMeshes(root);
  } else if (kind === 'village') {
    const cottage=house(root,-4.46,index,lit);
    cottage.scale.setScalar(.77);
    if (index%4===1) shop(root,4.14,index+3,lit);
    else {
      const farmhouse=house(root,4.14,index+1,lit);
      farmhouse.scale.set(index%2 ? .93 : 1.02,index%2 ? 1.14 : 1.57,1);
      farmhouse.position.z=-1.7;
    }
    tree(-.12,-13.4,8.2+offset(index*43)*3.1,index*4);
    if (index%3!==1) tree(index%2 ? -6.9 : 7.10,-20.3,10.7,index*4+1);
    for (let i=0;i<5;i++) {
      plant(root,plants?.shrubs[i%2],-7.65+i*3.81,-1.75-offset(i*41+index)*2,.88+offset(i+index)*.43,i*1.4);
    }
    for (const [i,x] of [-7.5,-2.5,2.45,7.25].entries()) {
      plant(root,plants?.shrubs[(i+index)%2],x,-.32-offset(index*19+i)*.30,.71+offset(i*23+index)*.33,i*1.8);
    }
    batchMeshes(root);
  } else if (kind === 'shops') {
    box(root,pavement,0,.048,-.65,17.94,.096,1.87);
    shop(root,-4.36,index*2,lit);
    shop(root,4.28,index*2+1,lit);
    if (index%3 !== 1) {
      const h = 8+index*.96;
      box(root,brick[index%brick.length],1.4,h/2,-20.0,13.3,h,10.5);
      if (lit) for (let floor=0;floor<4;floor++) for (let column=0;column<5;column++) {
        if ((floor*3+column+index)%4!==0) continue;
        box(root,upperWindow,-3.1+column*2.25,h-1.32-floor*1.82,-14.74,.78,.69,.022);
      }
    }
    batchMeshes(root);
  } else {
    house(root,-4.34,index,lit);
    house(root,4.34,index+1,lit);
    if (index%2===0) {
      tree(0,-2.1,4.3,index*3);
      batchMeshes(root);
    }
  }
  return root;
}

const streetLabels = {shops:'MAIN STREET',homes:'RESIDENTIAL',forest:'CEDAR WOODS',
  bridge:'NORTH CHANNEL',desert:'RED BASIN',ice:'FROSTWOOD',
  village:'BROOKFIELD',corn:'CORN FIELDS',rice:'RICE PADDIES'};

export function prepareRoadside(plants) {
  const blocks = new Map();
  const signs = new Map();
  const landmarks = new Map();
  function block(district,number,side) {
    const variant = Math.floor(offset(number*29+side*217)*8);
    const key = district.kind+district.lit+variant;
    if (!blocks.has(key)) blocks.set(key,makeBlock(district.kind,district.lit,variant,plants));
    const row = blocks.get(key).clone();
    row.position.x = side*9.55;
    row.rotation.y = -side*Math.PI/2;
    return row;
  }
  function sign(kind) {
    if (!signs.has(kind)) {
      const assembly = new T.Group();
      const green = surface(0x25443d);
      const paint = paintedSign(streetLabels[kind],'#25443d','#e1e6cb');
      for (const x of [-.84,.84]) box(assembly,trim,x,1.15,0,.076,2.35,.076);
      box(assembly,green,0,2.22,0,2.35,.54,.095);
      mesh(assembly,new T.PlaneGeometry(2.27,.46),paint,0,2.22,.051);
      signs.set(kind,assembly);
    }
    const marker = signs.get(kind).clone();
    marker.position.set(9.06,0,-4.4);
    return marker;
  }
  function landmark(kind,side) {
    if (!landmarks.has(kind)) {
      const root=new T.Group();
      if (kind==='desert') {
        for (const [x,z,width,height] of [[40,-12,19,22],[59,-40,15,15],[34,-48,11,12]]) {
          const building=mesh(root,pyramidShape,pyramidStone,x,height/2-.03,z);
          building.scale.set(width,height,width);
          building.rotation.y=Math.PI/4;
        }
      } else {
        for (const [x,z,width,height] of [[73,-37,34,31],[103,-52,42,48],[124,-22,29,27],[90,12,33,34]]) {
          const mountainPeak=mesh(root,peak,mountain,x,height/2-1,z);
          mountainPeak.scale.set(width,height,width*.82);
          mountainPeak.rotation.y=x*.47;
        }
      }
      batchMeshes(root);
      landmarks.set(kind,root);
    }
    const model=landmarks.get(kind).clone();
    model.scale.x=side;
    return model;
  }
  function prewarm(entries) {
    for (const kind of Object.keys(streetLabels)) sign(kind);
    for (const [kind,lit,variants] of entries) {
      for (let variant=0;variant<variants;variant++) {
        const key = kind+lit+variant;
        if (!blocks.has(key)) blocks.set(key,makeBlock(kind,lit,variant,plants));
      }
    }
  }
  return {block,sign,landmark,prewarm};
}
