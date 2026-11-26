import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';
import {
  AdditiveBlending, Color, ShaderMaterial, UniformsUtils,
  UnsignedByteType, Vector2, WebGLRenderTarget
} from 'three';
import { debugToggles } from './debug.js';

const BLUR_X = new Vector2(1, 0);
const BLUR_Y = new Vector2(0, 1);

function makeBlurMaterial(kernelRadius) {
  return new ShaderMaterial({
    defines: { KERNEL_RADIUS: kernelRadius, SIGMA: kernelRadius },
    uniforms: {
      colorTexture: { value: null },
      invSize: { value: new Vector2(0.5, 0.5) },
      direction: { value: new Vector2(0.5, 0.5) },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      #include <common>
      varying vec2 vUv;
      uniform sampler2D colorTexture;
      uniform vec2 invSize;
      uniform vec2 direction;
      float gaussianPdf(in float x, in float sigma) {
        return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
      }
      void main() {
        float fSigma = float(SIGMA);
        float weightSum = gaussianPdf(0.0, fSigma);
        vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;
        for (int i = 1; i < KERNEL_RADIUS; i++) {
          float x = float(i);
          float w = gaussianPdf(x, fSigma);
          vec2 uvOffset = direction * invSize * x;
          vec3 sample1 = texture2D(colorTexture, vUv + uvOffset).rgb;
          vec3 sample2 = texture2D(colorTexture, vUv - uvOffset).rgb;
          diffuseSum += (sample1 + sample2) * w;
          weightSum += 2.0 * w;
        }
        gl_FragColor = vec4(diffuseSum / weightSum, 1.0);
      }`,
  });
}

// 3-mip half-resolution UnsignedByteType bloom pass (avoids HalfFloatType 5-mip TBDR spills).
class HalfResBloomPass extends Pass {
  constructor(strength = 0.22, radius = 0.35, threshold = 0.78) {
    super();
    this.strength = strength;
    this.radius = radius;
    this.threshold = threshold;
    this.nMips = 3;
    this.needsSwap = false;
    this._oldClearColor = new Color();
    this.clearColor = new Color(0, 0, 0);

    const opts = { type: UnsignedByteType, depthBuffer: false, stencilBuffer: false };
    this.brightTarget = new WebGLRenderTarget(2, 2, opts);
    this.brightTarget.texture.generateMipmaps = false;
    this.horiz = [];
    this.vert = [];
    const kernels = [4, 7, 10];
    this.blurMats = [];
    for (let i = 0; i < this.nMips; i++) {
      const h = new WebGLRenderTarget(2, 2, opts);
      const v = new WebGLRenderTarget(2, 2, opts);
      h.texture.generateMipmaps = false;
      v.texture.generateMipmaps = false;
      this.horiz.push(h);
      this.vert.push(v);
      this.blurMats.push(makeBlurMaterial(kernels[i]));
    }

    this.highPassUniforms = UniformsUtils.clone(LuminosityHighPassShader.uniforms);
    this.highPassUniforms.luminosityThreshold.value = threshold;
    this.highPassUniforms.smoothWidth.value = 0.04;
    this.highPassMat = new ShaderMaterial({
      uniforms: this.highPassUniforms,
      vertexShader: LuminosityHighPassShader.vertexShader,
      fragmentShader: LuminosityHighPassShader.fragmentShader,
    });

    this.compositeMat = new ShaderMaterial({
      uniforms: {
        blur1: { value: this.vert[0].texture },
        blur2: { value: this.vert[1].texture },
        blur3: { value: this.vert[2].texture },
        bloomStrength: { value: strength },
        bloomRadius: { value: radius },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D blur1, blur2, blur3;
        uniform float bloomStrength, bloomRadius;
        float lerpBloom(const in float f) {
          float r = mix(f, 1.2 - f, bloomRadius);
          return r;
        }
        void main() {
          vec4 c = lerpBloom(1.0) * texture2D(blur1, vUv)
                 + lerpBloom(0.7) * texture2D(blur2, vUv)
                 + lerpBloom(0.45) * texture2D(blur3, vUv);
          gl_FragColor = bloomStrength * c;
        }`,
    });

    this.copyUniforms = UniformsUtils.clone(CopyShader.uniforms);
    this.blendMat = new ShaderMaterial({
      uniforms: this.copyUniforms,
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this._quad = new FullScreenQuad(null);
  }

  setSize(width, height) {
    let rw = Math.max(2, Math.floor(width / 2));
    let rh = Math.max(2, Math.floor(height / 2));
    this.brightTarget.setSize(rw, rh);
    for (let i = 0; i < this.nMips; i++) {
      this.horiz[i].setSize(rw, rh);
      this.vert[i].setSize(rw, rh);
      this.blurMats[i].uniforms.invSize.value.set(1 / rw, 1 / rh);
      rw = Math.max(2, Math.floor(rw / 2));
      rh = Math.max(2, Math.floor(rh / 2));
    }
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);

    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this._quad.material = this.highPassMat;
    renderer.setRenderTarget(this.brightTarget);
    renderer.clear();
    this._quad.render(renderer);

    let inputTex = this.brightTarget.texture;
    for (let i = 0; i < this.nMips; i++) {
      const bm = this.blurMats[i];
      this._quad.material = bm;
      bm.uniforms.colorTexture.value = inputTex;
      bm.uniforms.direction.value = BLUR_X;
      renderer.setRenderTarget(this.horiz[i]);
      renderer.clear();
      this._quad.render(renderer);

      bm.uniforms.colorTexture.value = this.horiz[i].texture;
      bm.uniforms.direction.value = BLUR_Y;
      renderer.setRenderTarget(this.vert[i]);
      renderer.clear();
      this._quad.render(renderer);

      inputTex = this.vert[i].texture;
    }

    this._quad.material = this.compositeMat;
    this.compositeMat.uniforms.bloomStrength.value = this.strength;
    this.compositeMat.uniforms.bloomRadius.value = this.radius;
    renderer.setRenderTarget(this.horiz[0]);
    renderer.clear();
    this._quad.render(renderer);

    this._quad.material = this.blendMat;
    this.copyUniforms.tDiffuse.value = this.horiz[0].texture;
    renderer.setRenderTarget(readBuffer);
    this._quad.render(renderer);

    renderer.setClearColor(this._oldClearColor, oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  dispose() {
    this.brightTarget.dispose();
    for (let i = 0; i < this.nMips; i++) {
      this.horiz[i].dispose();
      this.vert[i].dispose();
      this.blurMats[i].dispose();
    }
    this.highPassMat.dispose();
    this.compositeMat.dispose();
    this.blendMat.dispose();
    this._quad.dispose();
  }
}

export function drivingEffects(renderer, scene, camera) {
  let composer = null;
  let bloom = null;
  let finish = null;
  let out = null;
  let lastWidth = 1, lastHeight = 1;

  function ensurePipeline() {
    if (composer) return;
    const target = new WebGLRenderTarget(1, 1, { type: UnsignedByteType, samples: 0 });
    composer = new EffectComposer(renderer, target);
    bloom = new HalfResBloomPass(0.24, 0.34, 0.78);
    finish = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, clock: { value: 0 }, speed: { value: 0 }, rich: { value: 0 } },
      vertexShader: 'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform sampler2D tDiffuse;
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
    out = new OutputPass();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(finish);
    composer.addPass(out);
    syncSize();
  }

  function syncSize() {
    if (!composer) return;
    const dpr = renderer.getPixelRatio();
    composer.setPixelRatio(dpr);
    composer.setSize(lastWidth, lastHeight);
    const rw = Math.max(1, Math.round(lastWidth * dpr));
    const rh = Math.max(1, Math.round(lastHeight * dpr));
    bloom.setSize(rw, rh);
  }

  function dispose() {
    if (!composer) return;
    bloom.dispose();
    finish.dispose();
    out.dispose();
    composer.dispose();
    composer = null;
    bloom = null;
    finish = null;
    out = null;
  }

  return {
    resize(width, height) {
      lastWidth = Math.max(1, width);
      lastHeight = Math.max(1, height);
      syncSize();
    },
    dispose,
    render(now, speed, quality, daylight = 0) {
      if (quality !== 'Ultra') {
        dispose();
        renderer.render(scene, camera);
        return;
      }
      ensurePipeline();
      bloom.enabled = debugToggles.bloom;
      bloom.strength = 0.24 - daylight * 0.16;
      bloom.threshold = 0.78 + daylight * 0.14;
      finish.uniforms.clock.value = now / 1000;
      finish.uniforms.speed.value = speed;
      finish.uniforms.rich.value = Number(bloom.enabled);
      composer.render();
    },
  };
}
