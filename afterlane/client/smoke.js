import * as T from 'three';

export function buildSmoke(parent) {
  const size=32,pixels=new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const dx=(x+.5)/size*2-1,dy=(y+.5)/size*2-1;
    const density=Math.max(0,1-dx*dx-dy*dy)**2.4;
    const i=(y*size+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=255;
    pixels[i+3]=Math.round(density*(.56+.44*Math.sin(x*.71+y*.47)**2)*255);
  }
  const map=new T.DataTexture(pixels,size,size,T.RGBAFormat);
  map.needsUpdate=true;
  const puffs=Array.from({length:32},()=>{
    const sprite=new T.Sprite(new T.SpriteMaterial({map,color:0xced5dc,transparent:true,opacity:0,depthWrite:false}));
    sprite.visible=false;
    sprite.renderOrder=3;
    parent.add(sprite);
    return {sprite,life:0,velocity:new T.Vector3(),age:0,exhale:false};
  });
  let delay=0,next=0;
  return (source,breath,exhale,active,dt,side)=>{
    if (!active) {
      delay=0;
      for (const puff of puffs) {puff.life=0;puff.sprite.visible=false;}
      return;
    }
    delay+=dt;
    if (delay>(exhale?.035:.125)) {
      delay=0;
      const puff=puffs[next++%puffs.length];
      puff.exhale=exhale;
      puff.age=0;
      puff.life=exhale?1.24:1.5;
      puff.sprite.position.copy(exhale?breath:source);
      puff.sprite.visible=true;
      puff.velocity.set(side*(exhale?-.13:.018)+(Math.random()-.5)*.07,
        exhale?.017+Math.random()*.06:.055+Math.random()*.07,exhale?-.63:-.087);
      puff.sprite.material.rotation=Math.random()*Math.PI*2;
    }
    for (const puff of puffs) {
      if (!puff.life) continue;
      puff.age+=dt;
      const f=puff.age/puff.life;
      if (f>=1) {puff.life=0;puff.sprite.visible=false;continue;}
      puff.sprite.position.addScaledVector(puff.velocity,dt);
      puff.sprite.position.x+=Math.sin(puff.age*3+next*.09)*dt*.021;
      puff.sprite.scale.setScalar(puff.exhale?.058+f*.36:.031+f*.15);
      puff.sprite.material.opacity=(puff.exhale?.23:.17)*Math.min(1,f*8)*(1-f)**1.6;
    }
  };
}
