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

  constructor(gl: THREE.WebGLRenderer, width: number, height: number) {
    this.gl = gl;

    const down = 0.5;
    const w = Math.max(2, Math.floor(width * down));
    const h = Math.max(2, Math.floor(height * down));

    this.textureA3D = new TextureA3D(128, 128, 128);
    this.textureB3D = new TextureB3D(32, 32, 32);
    this.textureC2D = new TextureC2D(128, 128);
    this.textureEnvelope = new TextureEnvelope(256, 256);
    this.textureScene = new TextureScene(w, h);
    this.textureCloud = new TextureCloud(w, h);

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

    this.fsq = new FullScreenQuad();

    this.generate3DTextures(this.textureA3DMaterial, this.textureA3D);
    this.generate3DTextures(this.textureB3DMaterial, this.textureB3D);
    this.generate2DTextures(this.textureC2DMaterial, this.textureC2D);
    this.generate2DTextures(this.textureEnvelopeMaterial, this.textureEnvelope);
  }

  dispose() {
    this.fsq.dispose();
    // dispose render targets / materials as needed if you add teardown later
  }

  resize(width: number, height: number) {
    const down = 0.5;
    const w = Math.max(2, Math.floor(width * down));
    const h = Math.max(2, Math.floor(height * down));
    this.textureScene.setSize(w, h);
    this.textureCloud.setSize(w, h);
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
      const z = i / d;
      // @ts-ignore
      (material as any).zCoord = z;
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

  /** Raymarch & composite clouds to screen. */
  compose(dt: number, camera: THREE.PerspectiveCamera, volumeRoot: THREE.Object3D) {
    // compute volume bounds from (possibly invisible) children
    this._box.setFromObject(volumeRoot);

    // update cloud uniforms
    this.cloudMaterial.updateUniforms(dt, camera, this._box);

    // raymarch to cloud RT
    this.fsq.material = this.cloudMaterial;
    this.gl.setRenderTarget(this.textureCloud);
    this.gl.clear();
    this.fsq.render(this.gl);
    this.gl.setRenderTarget(null);

    // composite to screen
    const prevAuto = this.gl.autoClear;
    this.gl.autoClear = false;
    this.fsq.material = this.renderMaterial;
    this.fsq.render(this.gl);
    this.gl.autoClear = prevAuto;
  }
}
