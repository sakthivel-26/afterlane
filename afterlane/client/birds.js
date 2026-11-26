import * as T from 'three';

export function countryBirds(scene) {
  const count=9, vertices=12;
  const points=new Float32Array(count*vertices*3);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(points,3).setUsage(T.DynamicDrawUsage));
  const material=new T.MeshBasicMaterial({color:0x14181a,side:T.DoubleSide,fog:false});
  const flock=new T.Mesh(geometry,material);
  flock.frustumCulled=false;
  flock.visible=false;
  scene.add(flock);
  let station=0, previousTime=null;
  return (kind,distance,daylight,now) => {
    flock.visible=daylight>.21 && ['village','corn','rice'].includes(kind);
    if (!flock.visible) { previousTime=null; return; }
    const flight=now*.001;
    if (previousTime===null || station<distance-44 || station>distance+165) station=distance+115;
    else station-=8*Math.min(.12,Math.max(0,flight-previousTime));
    previousTime=flight;
    const z=distance-station;
    for (let i=0;i<count;i++) {
      const spread=(i%2 ? 1 : -1)*Math.ceil(i/2);
      const x=-11+Math.sin(flight*.19)*15+spread*1.94;
      const y=9.8+Math.sin(flight*.67+i*.42)*1.35+Math.abs(spread)*.4;
      const ahead=z-Math.abs(spread)*2.3;
      const flap=Math.sin(flight*8.7-i*.47)*.55;
      const wing=1.03-.25*Math.abs(flap);
      const o=i*vertices*3;
      points[o]=x-.18;   points[o+1]=y;      points[o+2]=ahead+.20;
      points[o+3]=x-wing;points[o+4]=y+flap;points[o+5]=ahead-.16;
      points[o+6]=x-.27; points[o+7]=y+.09; points[o+8]=ahead-.32;
      points[o+9]=x+.18; points[o+10]=y;     points[o+11]=ahead+.20;
      points[o+12]=x+wing;points[o+13]=y+flap;points[o+14]=ahead-.16;
      points[o+15]=x+.27;points[o+16]=y+.09; points[o+17]=ahead-.32;
      points[o+18]=x;    points[o+19]=y+.16; points[o+20]=ahead+.52;
      points[o+21]=x-.20;points[o+22]=y-.015;points[o+23]=ahead-.17;
      points[o+24]=x+.20;points[o+25]=y-.015;points[o+26]=ahead-.17;
      points[o+27]=x-.20;points[o+28]=y-.015;points[o+29]=ahead-.14;
      points[o+30]=x+.20;points[o+31]=y-.015;points[o+32]=ahead-.14;
      points[o+33]=x;    points[o+34]=y-.017;points[o+35]=ahead-.61;
    }
    geometry.attributes.position.needsUpdate=true;
  };
}
