import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';

export function drivingEffects(renderer,scene,camera) {
  const isAndroidApp = navigator.userAgent.includes('AfterlaneAndroid');
  const samples = Math.min(isAndroidApp ? 2 : 4, renderer.capabilities.maxSamples || 0);
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples }));
  const sanitize = new ShaderPass({
    uniforms:{tDiffuse:{value:null}},
    vertexShader:'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse;
      varying vec2 p;
      float clean(float v){return (v>=0.0 && v<=32.0) ? v : 0.0;}
      void main(){
        vec4 c=texture2D(tDiffuse,p);
        gl_FragColor=vec4(clean(c.r),clean(c.g),clean(c.b),1.0);
      }`
  });
  const bloom = new UnrealBloomPass(new Vector2(1,1),.15,.26,1.05);
  composer.addPass(new RenderPass(scene,camera));
  composer.addPass(sanitize);
  composer.addPass(bloom);
  const finish = new ShaderPass({
    uniforms:{tDiffuse:{value:null},clock:{value:0},speed:{value:0},rich:{value:0}},
    vertexShader:'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse;
      varying vec2 p;
      uniform float clock,speed,rich;
      float hash(vec2 xy){return fract(sin(dot(xy,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 local=p-0.5;
        vec3 color=texture2D(tDiffuse,p).rgb;
        if(rich>.5){
          float stretch=speed*.000018;
          color.r=texture2D(tDiffuse,p+local*stretch).r;
          color.b=texture2D(tDiffuse,p-local*stretch).b;
          color=mix(color,texture2D(tDiffuse,p-local*stretch*2.5).rgb,min(speed*.0008,.045));
        }
        color*=1.-dot(local,local)*.28;
        color+=(hash(gl_FragCoord.xy+floor(clock*40.))-.5)*.004;
        gl_FragColor=vec4(color,1.);
      }`
  });
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  return {
    resize(width,height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width,height);
    },
    render(now,speed,quality,daylight=0) {
      bloom.enabled = quality === 'High' || quality === 'Ultra';
      sanitize.enabled = bloom.enabled;
      bloom.strength = .15 - daylight * .115;
      bloom.threshold = 1.05 + daylight * .85;
      finish.uniforms.clock.value = now/1000;
      finish.uniforms.speed.value = speed;
      finish.uniforms.rich.value = Number(bloom.enabled);
      composer.render();
    }
  };
}
