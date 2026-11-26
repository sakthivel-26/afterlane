export const vehicles = [
  { asset:'starter-m4', name:'BMW M4 Competition', type:'Sports car', style:'Touring coupe', paint:'Silver / blue', cost:70000, unlockMission:5, speed:290, acceleration:8.5, grip:1.17, brake:10, color:'#c7ced6', engine:{cylinders:6,redline:7200,tone:'inline',pop:true} },
  // Keep the retired slots so older saves and room messages retain their vehicle IDs.
  null, null, null, null,
  { asset:'challenger-rt-1970', modelRevision:'2', name:'1970 Dodge Challenger R/T', type:'Sports car', style:'Classic muscle', cost:50000, speed:215, estimatedSpeed:true, acceleration:6.4, grip:1.01, brake:8.6, color:'#b75430', engine:{cylinders:8,redline:5700,tone:'crossplane',pop:true} },
  { asset:'gallardo', name:'Lamborghini Gallardo', type:'Sports car', style:'V10 coupe', cost:80000, speed:309, estimatedSpeed:true, acceleration:8.9, grip:1.17, brake:10.1, color:'#e3ad40', engine:{cylinders:10,redline:8000,tone:'crossplane',pop:true} },
  { asset:'skyline', modelRevision:'2', name:'Nissan Skyline R34 GT-R', type:'Sports car', style:'Japanese sports coupe', cost:60000, speed:250, estimatedSpeed:true, acceleration:7.1, grip:1.14, brake:9.4, color:'#4e76af', engine:{cylinders:6,redline:8000,tone:'inline',pop:true} },
  { asset:'rsr', name:'Porsche 911 GT3 RSR', type:'Sports car', style:'Rear-engine coupe', cost:75000, speed:295, estimatedSpeed:true, acceleration:9.2, grip:1.25, brake:10.8, color:'#d9d7d4', engine:{cylinders:6,redline:9000,tone:'flat',pop:true} },
  { asset:'suv', name:'Generic SUV ZYX0', type:'SUV', style:'Utility SUV', cost:45000, speed:175, estimatedSpeed:true, acceleration:5.2, grip:.97, brake:8.4, color:'#435061', engine:{cylinders:4,redline:4900,tone:'diesel',pop:false} },
  { asset:'camaro', name:'Chevrolet Camaro', type:'Sports car', style:'Modern muscle', paint:'Yellow / black', cost:65000, speed:250, estimatedSpeed:true, acceleration:7.5, grip:1.09, brake:9.5, color:'#e6a51c', engine:{cylinders:8,redline:6600,tone:'crossplane',pop:true} },
  { asset:'classic-mini', name:'Classic Mini', type:'Hatchback', style:'Classic compact', cost:0, speed:138, estimatedSpeed:true, acceleration:3.8, grip:1.02, brake:8.4, color:'#538780', engine:{cylinders:4,redline:6200,tone:'inline',pop:false} },
  { asset:'jaguar-xjr9', name:'Jaguar XJR-9', type:'Sports car', style:'Endurance prototype', cost:95000, speed:386, estimatedSpeed:true, acceleration:9.3, grip:1.26, brake:11.1, color:'#e6e6dc', engine:{cylinders:12,redline:7600,tone:'inline',pop:true} },
  { asset:'laferrari-restyled', name:'LaFerrari Restyled Concept', type:'Sports car', style:'Hybrid hypercar', paint:'Red / black', cost:90000, speed:350, estimatedSpeed:true, acceleration:9.7, grip:1.22, brake:10.8, color:'#bd2830', engine:{cylinders:12,redline:9250,tone:'inline',pop:true} },
  { asset:'lamborghini-centenario', name:'Lamborghini Centenario', type:'Sports car', style:'V12 supercar', paint:'Carbon grey / yellow', cost:85000, speed:350, estimatedSpeed:true, acceleration:9.6, grip:1.24, brake:10.8, color:'#444a56', engine:{cylinders:12,redline:8650,tone:'inline',pop:true} },
  { asset:'g63', name:'Mercedes-AMG G63', type:'SUV', style:'G-Class', cost:55000, speed:220, estimatedSpeed:true, acceleration:6.9, grip:1.02, brake:9.4, color:'#43494e', engine:{cylinders:8,redline:6500,tone:'crossplane',pop:true} },
  { asset:'t-rdstr', name:'T+RDSTR', type:'Sports car', style:'Flight roadster', flight:true, electric:true, cost:100000, speed:420, estimatedSpeed:true, acceleration:11, grip:1.28, brake:11.4, color:'#526c80', engine:{redline:19000,tone:'electric',pop:false} },
];

// Overall reduction includes the differential and any gearbox drop gears.
const transmissions = {
  'starter-m4':{ratios:[5,3.2,2.14,1.72,1.31,1,.82,.64],reverse:3.48,finalDrive:3.154,diameter:.679},
  'challenger-rt-1970':{ratios:[2.44,1.77,1.34,1],reverse:2.36,finalDrive:3.54,diameter:.66,estimated:true},
  gallardo:{ratios:[2.563,1.85,1.423,1.138,.939,.784],reverse:2.813,finalDrive:4,diameter:.66,estimated:true},
  skyline:{ratios:[3.827,2.36,1.685,1.312,1,.793],reverse:3.28,finalDrive:3.545,diameter:.653},
  rsr:{ratios:[41/13,39/17,36/19,35/22,31/23,29/25],reverse:3.15,finalDrive:(32/25)*(26/9),diameter:.71},
  suv:{ratios:[3.92,2.35,1.58,1.16,.88,.69],reverse:3.5,finalDrive:3.73,diameter:.74,estimated:true},
  camaro:{ratios:[2.66,1.78,1.3,1,.74,.5],reverse:2.9,finalDrive:3.45,diameter:.72,estimated:true},
  'classic-mini':{ratios:[3.52,2.21,1.43,1],reverse:3.35,finalDrive:3.76,diameter:.49,estimated:true},
  'jaguar-xjr9':{ratios:[2.55,1.72,1.28,1,.79],reverse:2.76,finalDrive:3.35,diameter:.72,estimated:true},
  'laferrari-restyled':{ratios:[3.08,2.18,1.64,1.30,1.05,.87,.70],reverse:2.79,finalDrive:3.68,diameter:.71,estimated:true},
  'lamborghini-centenario':{ratios:[3.91,2.44,1.81,1.46,1.19,.97,.79],reverse:2.93,finalDrive:2.86,diameter:.74,estimated:true},
  g63:{ratios:[5.35,3.24,2.25,1.64,1.21,1,.87,.72,.60],reverse:4.80,finalDrive:3.27,diameter:.80,estimated:true},
  't-rdstr':{ratios:[1],reverse:1,finalDrive:5.9,diameter:.75,estimated:true},
};
for (const vehicle of vehicles) if (vehicle) vehicle.transmission=transmissions[vehicle.asset];

export const trafficSpecs = [
  ['Sedan',0xa83232,'LP Wide Sedan','lp-sedan-red'],
  ['SUV',0xc62d38,'LP Offroad SUV','lp-suv-red'],
  ['Sedan',0x16a8b8,'LP Muscle Sedan','lp-sedan-cyan'],
  ['Pickup',0x8c2f32,'LP Utility Pickup','lp-pickup-red'],
  ['Heavy truck',0x8c2f32,'LP Semi Truck','lp-truck-red'],
  ['Sedan',0xe57c24,'LP Scoop Sedan','lp-sedan-orange'],
  ['SUV',0x2c6d96,'LP Offroad SUV','lp-suv-blue'],
  ['SUV',0x234c68,'LP Utility Van','lp-van-blue'],
  ['Sedan',0xe6c728,'LP Wide Sedan','lp-sedan-yellow'],
  ['Heavy truck',0xdcc129,'LP Cargo Truck','lp-truck-yellow'],
  ['Sedan',0x25282c,'LP Muscle Sedan','lp-sedan-black'],
  ['SUV',0xd9dde0,'LP Offroad SUV','lp-suv-white'],
  ['Sedan',0x1e5478,'LP Scoop Sedan','lp-sedan-navy'],
  ['SUV',0xdc621d,'LP Offroad SUV','lp-suv-orange'],
  ['Sedan',0x16a65a,'LP Muscle Sedan','lp-sedan-emerald'],
  ['Sedan',0x285f76,'LP Wide Sedan','lp-sedan-teal'],
  ['SUV',0xdcc129,'LP Offroad SUV','lp-suv-yellow'],
  ['Sedan',0x2f8f5b,'LP Scoop Sedan','lp-sedan-green'],
  ['SUV',0x5b6065,'LP Offroad SUV','lp-suv-grey'],
  ['Sedan',0x9c2142,'LP Wide Sedan','lp-sedan-crimson'],
  ['Bus',0x6f8466,undefined,'traffic-bus'],
  ['Sedan',0x586c80,'Road saloon','road-saloon'],
  ['Sedan',0xc7c9cc,'Executive saloon','executive-saloon'],
  ['Hatchback',0xd38649,'City hatch','traffic-hatchback'],
];

export function dimensions(type,style) {
  if (style === 'LP Wide Sedan') return {width:1.90,length:4.98,height:1.43};
  if (style === 'LP Scoop Sedan') return {width:2.00,length:4.71,height:1.55};
  if (style === 'LP Muscle Sedan') return {width:1.79,length:4.81,height:1.40};
  if (style === 'LP Offroad SUV') return {width:2.30,length:5.00,height:1.95};
  if (style === 'LP Utility Pickup') return {width:2.20,length:5.20,height:2.04};
  if (style === 'LP Utility Van') return {width:2.16,length:5.10,height:2.00};
  if (style === 'LP Semi Truck') return {width:2.36,length:10.60,height:3.27};
  if (style === 'LP Cargo Truck') return {width:2.71,length:10.00,height:3.36};
  if (style === 'G-Class') return {width:1.98,length:4.87,height:1.97};
  if (style === 'Flight roadster') return {width:2.17,length:5.0,height:1.33};
  if (style === 'Road saloon') return {width:1.85,length:4.90,height:1.45};
  if (style === 'Executive saloon') return {width:1.84,length:4.92,height:1.44};
  if (style === 'Compact crossover') return {width:1.87,length:4.69,height:1.69};
  if (style === 'Double-cab pickup') return {width:2.03,length:5.89,height:1.96};
  if (style === 'Volkswagen Bus') return {width:2.46,length:4.45,height:2.98};
  if (style === 'Ice Cream Truck') return {width:3.19,length:5.60,height:3.43};
  if (type === 'Bus') return {width:2.43,length:8.8,height:3.1};
  if (type === 'Heavy truck') return {width:2.43,length:7.4,height:3.1};
  if (type === 'Pickup') return {width:2.06,length:5.2,height:1.84};
  if (type === 'SUV') return {width:2.01,length:4.6,height:1.81};
  if (type === 'Hatchback') return {width:1.74,length:3.84,height:1.55};
  if (style === 'Executive sedan') return {width:1.92,length:4.95,height:1.54};
  if (style === 'Sportback') return {width:1.88,length:4.75,height:1.42};
  if (style === 'Touring coupe') return {width:1.94,length:4.62,height:1.41};
  if (style === 'Classic muscle') return {width:1.95,length:4.86,height:1.30};
  if (style === 'V10 coupe') return {width:1.96,length:4.34,height:1.17};
  if (style === 'Modern muscle') return {width:1.92,length:4.84,height:1.38};
  if (style === 'Classic compact') return {width:1.41,length:3.05,height:1.35};
  if (style === 'Endurance prototype') return {width:2.00,length:4.80,height:1.10};
  if (style === 'Hybrid hypercar') return {width:1.99,length:4.70,height:1.12};
  if (style === 'V12 supercar') return {width:2.06,length:4.92,height:1.14};
  if (style === 'Japanese sports coupe') return {width:1.86,length:4.60,height:1.36};
  if (style === 'AMG GT') return {width:1.99,length:4.73,height:1.35};
  if (style === 'Mid-engine coupe') return {width:1.97,length:4.57,height:1.20};
  if (type === 'Sports car') return {width:1.93,length:4.42,height:1.27};
  return {width:1.85,length:4.48,height:1.49};
}
