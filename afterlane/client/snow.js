import * as T from 'three';

export function buildSnow(rig) {
  const count = 390;
  const data = new Float32Array(count*3);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(data,3).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`
      varying float opacity;
      void main() {
        vec4 mv = modelViewMatrix*vec4(position,1.);
        gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(39./max(.5,-mv.z),1.,7.);
        opacity = .45*(1.-smoothstep(20.,53.,-mv.z));
      }`,
    fragmentShader:`
      varying float opacity;
      void main() {
        float edge = 1.-smoothstep(.13,.5,length(gl_PointCoord-.5));
        gl_FragColor = vec4(.75,.83,.92,edge*opacity);
        #include <colorspace_fragment>
      }`
  });
  const snow = new T.Points(geometry,material);
  snow.frustumCulled = false;
  snow.visible = false;
  rig.add(snow);
  const flakes = Array.from({length:count},()=>new T.Vector3(
    35*(Math.random()-.5),12*Math.random(),9-60*Math.random()
  ));
  return (active,speed,dt,now,cabinHeight) => {
    snow.visible = active;
    if (!active) return;
    let n = 0;
    for (const [i,p] of flakes.entries()) {
      p.x += Math.sin(now*.00074+i*.52)*dt*.75;
      p.y -= dt*(1.1+i%6*.25);
      p.z += dt*(Math.abs(speed)*.83+.6);
      if (p.y<0) p.y+=12;
      if (p.x>17.5) p.x-=35;
      if (p.x< -17.5) p.x+=35;
      if (p.z>9) p.z-=60;
      if (Math.abs(p.x)<1.38 && p.z> -1.7 && p.z<1.8 && p.y<cabinHeight) continue;
      data[n++]=p.x;
      data[n++]=p.y;
      data[n++]=p.z;
    }
    geometry.setDrawRange(0,n/3);
    geometry.attributes.position.needsUpdate = true;
  };
}
