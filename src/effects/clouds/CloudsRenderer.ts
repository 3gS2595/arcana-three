import * as THREE from "three";
import { FullScreenQuad } from "./FullScreenQuad";
import { TextureA3D } from "./fbo/TextureA3D";
import { TextureB3D } from "./fbo/TextureB3D";
import { TextureC2D } from "./fbo/TextureC2D";
import { TextureEnvelope } from "./fbo/TextureEnvelope";
import { TextureScene } from "./fbo/TextureScene";
import { TextureCloud } from "./fbo/TextureCloud";

import { TextureA3DMaterial } from "./fbo/TextureA3DMaterial";
import { TextureB3DMaterial } from "./fbo/TextureB3DMaterial";
import { TextureC2DMaterial } from "./fbo/TextureC2DMaterial";
import { TextureEnvelopeMaterial } from "./fbo/TextureEnvelopeMaterial";

import { CloudMaterial } from "./materials/CloudMaterial";
import { RenderMaterial } from "./materials/RenderMaterial";

export type CloudsStage = 0 | 1 | 2 | 3 | 6;

export class CloudsRenderer {
  private gl: THREE.WebGLRenderer;

  textureA3DMaterial: TextureA3DMaterial;
  textureA3D: TextureA3D;

  textureB3DMaterial: TextureB3DMaterial;
  textureB3D: TextureB3D;

  textureC2DMaterial: TextureC2DMaterial;
  textureC2D: TextureC2D;

  textureEnvelopeMaterial: TextureEnvelopeMaterial;
  textureEnvelope: TextureEnvelope;

  textureScene: TextureScene;
  textureCloud: TextureCloud;

  renderMaterial: RenderMaterial;
  cloudMaterial: CloudMaterial;
  fsq: FullScreenQuad;

  private _box: THREE.Box3 = new THREE.Box3();
  private _stage: CloudsStage = 1;

  // simple shaders for staged bring-up
  private _testMaterial: THREE.ShaderMaterial;
  private _copyMaterial: THREE.ShaderMaterial; // copies any texture

  constructor(gl: THREE.WebGLRenderer, width: number, height: number) {
    this.gl = gl;
    const isGL2 = (gl.capabilities as any).isWebGL2 as boolean;
    if (!isGL2) console.warn("[CloudsRenderer] WebGL2 not available; stage 6 requires it.");

    const down = 0.5;
    const w = Math.max(2, Math.floor(width * down));
    const h = Math.max(2, Math.floor(height * down));

    // FBOs
    this.textureA3D = new TextureA3D(128, 128, 128);
    this.textureB3D = new TextureB3D(32, 32, 32);
    this.textureC2D = new TextureC2D(128, 128);
    this.textureEnvelope = new TextureEnvelope(256, 256);
    this.textureScene = new TextureScene(w, h);
    this.textureCloud = new TextureCloud(w, h);

    // Materials
    this.textureA3DMaterial = new TextureA3DMaterial();
    this.textureB3DMaterial = new TextureB3DMaterial();
    this.textureC2DMaterial = new TextureC2DMaterial();
    this.textureEnvelopeMaterial = new TextureEnvelopeMaterial();

    this.cloudMaterial = new CloudMaterial();
    this.cloudMaterial.uniforms.uSceneTexture.value = this.textureScene.texture;
    this.cloudMaterial.uniforms.uSceneDepthTexture.value = this.textureScene.depthTexture;
    this.cloudMaterial.uniforms.uTextureA.value = this.textureA3D.texture;
    this.cloudMaterial.uniforms.uTextureB.value = this.textureB3D.texture;
    this.cloudMaterial.uniforms.uTextureC.value = this.textureC2D.texture;
    this.cloudMaterial.uniforms.uTextureEnvelope.value = this.textureEnvelope.texture;

    this.renderMaterial = new RenderMaterial();
    this.renderMaterial.uniforms.uSceneTexture.value = this.textureScene.texture;
    this.renderMaterial.uniforms.uCloudTexture.value = this.textureCloud.texture;

    // Stage test shaders — IMPORTANT: do NOT redeclare position/uv in GLSL3
    this._testMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        precision highp float;
        out vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        in vec2 vUv;
        out vec4 out_FragColor;
        uniform float uTime;
        void main(){
          float a = 0.5 + 0.5 * sin(6.2831853 * (vUv.x + uTime * 0.1));
          out_FragColor = vec4(vUv, a, 1.0);
        }
      `,
      uniforms: { uTime: { value: 0 } }
    });
    this._testMaterial.glslVersion = THREE.GLSL3;

    this._copyMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        precision highp float;
        out vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        in vec2 vUv;
        out vec4 out_FragColor;
        uniform sampler2D uTex;
        void main(){ out_FragColor = texture(uTex, vUv); }
      `,
      uniforms: { uTex: { value: null } }
    });
    this._copyMaterial.glslVersion = THREE.GLSL3;

    this.fsq = new FullScreenQuad();

    // bake noise/envelopes up-front
    this.generate3DTextures(this.textureA3DMaterial, this.textureA3D);
    this.generate3DTextures(this.textureB3DMaterial, this.textureB3D);
    this.generate2DTextures(this.textureC2DMaterial, this.textureC2D);
    this.generate2DTextures(this.textureEnvelopeMaterial, this.textureEnvelope);

    console.log("[CloudsRenderer] init ok", { isGL2, w, h });
  }

  setStage(stage: CloudsStage) { this._stage = stage; console.log("[CloudsRenderer] stage =>", stage); }
  getStage(): CloudsStage { return this._stage; }

  dispose() {
    this.fsq.dispose();
    this._testMaterial.dispose();
    this._copyMaterial.dispose();
  }

  resize(width: number, height: number) {
    const down = 0.5;
    const w = Math.max(2, Math.floor(width * down));
    const h = Math.max(2, Math.floor(height * down));
    this.textureScene.setSize(w, h);
    this.textureCloud.setSize(w, h);
    console.log("[CloudsRenderer] resize", { w, h });
  }

  private generate2DTextures(material: THREE.Material, fbo: THREE.WebGLRenderTarget) {
    this.fsq.material = material;
    this.gl.setRenderTarget(fbo);
    this.gl.clear();
    this.fsq.render(this.gl);
    this.gl.setRenderTarget(null);
  }

  private generate3DTextures(material: THREE.Material, fbo: THREE.WebGL3DRenderTarget) {
    const d = fbo.depth;
    this.fsq.material = material;
    for (let i = 0; i < d; i++) {
      // @ts-ignore
      (material as any).zCoord = i / d;
      this.gl.setRenderTarget(fbo, i);
      this.gl.clear();
      this.fsq.render(this.gl);
    }
    this.gl.setRenderTarget(null);
  }

  /** Render the mask object (edges) into the scene FBO (color+depth). */
  renderMask(maskRoot: THREE.Object3D, camera: THREE.Camera) {
    this.gl.setRenderTarget(this.textureScene);
    this.gl.clear();
    this.gl.render(maskRoot, camera);
    this.gl.setRenderTarget(null);
  }

  /** Stage-driven compose to screen. */
  compose(dt: number, camera: THREE.PerspectiveCamera, volumeRoot: THREE.Object3D) {
    this._testMaterial.uniforms.uTime.value += dt;

    switch (this._stage) {
      case 1: {
        // gradient direct to screen
        this.fsq.material = this._testMaterial;
        const prev = this.gl.autoClear; this.gl.autoClear = true;
        this.fsq.render(this.gl);
        this.gl.autoClear = prev;
        return;
      }

      case 2: {
        // gradient -> cloud RT, then copy RT to screen (no scene alpha dependence)
        this.fsq.material = this._testMaterial;
        this.gl.setRenderTarget(this.textureCloud);
        this.gl.clear();
        this.fsq.render(this.gl);
        this.gl.setRenderTarget(null);

        this._copyMaterial.uniforms.uTex.value = this.textureCloud.texture;
        this.fsq.material = this._copyMaterial;
        const prev = this.gl.autoClear; this.gl.autoClear = true;
        this.fsq.render(this.gl);
        this.gl.autoClear = prev;
        return;
      }

      case 3: {
        // display the mask color buffer
        this._copyMaterial.uniforms.uTex.value = this.textureScene.texture;
        this.fsq.material = this._copyMaterial;
        const prev = this.gl.autoClear; this.gl.autoClear = true;
        this.fsq.render(this.gl);
        this.gl.autoClear = prev;
        return;
      }

      case 6: {
        // FULL clouds
        this._box.setFromObject(volumeRoot);
        this.cloudMaterial.updateUniforms(dt, camera, this._box);

        // march to cloud RT
        this.fsq.material = this.cloudMaterial;
        this.gl.setRenderTarget(this.textureCloud);
        this.gl.clear();
        this.fsq.render(this.gl);
        this.gl.setRenderTarget(null);

        // composite (uses scene alpha)
        const prev = this.gl.autoClear; this.gl.autoClear = false;
        this.fsq.material = this.renderMaterial;
        this.fsq.render(this.gl);
        this.gl.autoClear = prev;
        return;
      }

      default: return;
    }
  }
}
