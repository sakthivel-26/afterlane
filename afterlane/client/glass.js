import * as T from 'three';

export const bladeAngle = phase => .04+1.12*(1-Math.cos(phase));
const stopAngle = bladeAngle(Math.PI);
const wetness = (wet,speed) => wet*(.16+1.45*T.MathUtils.smoothstep(Math.abs(speed),4,43));

export function wetGlass(cabin) {
  const samples = 64;
  const lastWipe = new Float64Array(samples).fill(-Infinity);
  const ages = new Uint8Array(samples);
  const history = new T.DataTexture(ages,samples,1,T.RedFormat);
  history.minFilter = history.magFilter = T.LinearFilter;
  const uniforms = {flow:{value:0},water:{value:0},speed:{value:0},history:{value:history},wiped:{value:1}};
  const material = new T.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`
      varying vec2 glassUv;
      void main() {
        glassUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }`,
    fragmentShader:`
      uniform float flow, water, speed, wiped;
      uniform sampler2D history;
      varying vec2 glassUv;

      float scatter(vec2 p) {
        return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
      }

      vec2 beads(vec2 p, float seed, float load) {
        vec2 cell = floor(p);
        float chance = scatter(cell+seed);
        float fall = fract(chance+flow*(.65+chance*.9));
        vec2 offset = fract(p) - vec2(.15+.70*scatter(cell+2.+seed),1.-fall);
        offset.x *= 1.3;
        offset.y *= mix(.84,.47,speed);
        float radius = .078+.10*chance*fall+.083*min(load,1.);
        float enabled = step(.89-min(load,1.)*.87,chance);
        float edge = length(offset)/radius;
        float drop = (1.-smoothstep(.77,1.03,edge))*enabled;
        float highlight = (1.-smoothstep(.18,.48,length((offset-vec2(-.041,.041))/radius)))*drop;
        float trail = (1.-smoothstep(.013,.033,abs(offset.x)))
          * smoothstep(radius*.7,radius*1.2,offset.y)
          * (1.-smoothstep(.13,.36,offset.y))*enabled*(.16+speed*.31);
        return vec2(max(drop,trail),highlight);
      }

      float recent(vec2 p,vec2 pivot) {
        vec2 relative = vec2(mix(-.89,-.76,p.y)+p.x*mix(1.78,1.52,p.y),p.y*.75)-pivot;
        float angle = atan(relative.y,relative.x);
        float within = smoothstep(.02,.055,angle)*(1.-smoothstep(2.23,2.31,angle))*(1.-smoothstep(.606,.642,length(relative)));
        float age = texture2D(history,vec2(clamp((angle-.04)/2.24,0.,1.),.5)).r*4.;
        float staysClear = mix(1.15,.52,speed);
        return within*(1.-smoothstep(.05,staysClear,age));
      }

      void main() {
        vec2 p = glassUv;
        float cleared = max(recent(p,vec2(-.48,0.)),recent(p,vec2(.41,0.)))*wiped;
        float load = water*(1.-.985*cleared);
        vec2 drops = max(beads(p*vec2(22.,10.),0.,load),beads(p*vec2(39.,18.)+7.2,18.,load)*.86);
        float film = min(.76,load*load*.43)*(wiped>.5 ? 1. : .48);
        float opacity = min(.94,film+(.28*drops.x+.62*drops.y)*smoothstep(.009,.27,load));
        vec3 color = mix(vec3(.052,.073,.105),vec3(.65,.78,.94),drops.y*.94);
        gl_FragColor = vec4(color,opacity);
        #include <colorspace_fragment>
      }`
  });

  function addPane(vertices,paneMaterial) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
    geometry.setIndex([0,1,2,1,3,2]);
    const pane = new T.Mesh(geometry,paneMaterial);
    pane.renderOrder = 2;
    cabin.add(pane);
    return pane;
  }
  // The windshield meets the cowl where the blades are mounted.
  const panes = [addPane([-.89,1.06,-1.15, .89,1.06,-1.15, -.76,1.59,-.62, .76,1.59,-.62],material)];
  const sideMaterial = material.clone();
  sideMaterial.uniforms = {...uniforms,wiped:{value:0}};
  for (const side of [-1,1]) {
    panes.push(addPane([
      side*.89,1.06,-1.15, side*.88,1.06,.86,
      side*.76,1.59,-.62, side*.81,1.56,.86
    ],sideMaterial));
  }
  let previousPhase = 0, previousTime = null;
  return (now,wet,speed,phase) => {
    const time = now/1000;
    const dt = Math.min(.06,time-(previousTime ?? time));
    const motion = T.MathUtils.smoothstep(Math.abs(speed),4,49);
    previousTime = time;
    if (phase > previousPhase) {
      const firstAngle = bladeAngle(previousPhase), lastAngle = bladeAngle(phase);
      const turned = Math.floor(phase/Math.PI) !== Math.floor(previousPhase/Math.PI);
      const atTop = Math.floor(phase/Math.PI)%2 === 1;
      const low = turned && !atTop ? .04 : Math.min(firstAngle,lastAngle);
      const high = turned && atTop ? stopAngle : Math.max(firstAngle,lastAngle);
      for (let i=0;i<samples;i++) {
        const angle = .04+i/(samples-1)*(stopAngle-.04);
        if (angle >= low-.034 && angle <= high+.034) lastWipe[i] = time;
      }
    }
    previousPhase = phase;
    uniforms.water.value = T.MathUtils.damp(uniforms.water.value,wetness(wet,speed),wet ? 1.2+motion*2.3 : 2.0,dt);
    uniforms.flow.value += dt*(.029+motion*.36);
    uniforms.speed.value = motion;
    for (const pane of panes) pane.visible = wet > 0 || uniforms.water.value > .012;
    if (panes[0].visible) {
      for (let i=0;i<samples;i++) ages[i] = Math.min(255,Math.round((time-lastWipe[i])*63.75));
      history.needsUpdate = true;
    }
  };
}
