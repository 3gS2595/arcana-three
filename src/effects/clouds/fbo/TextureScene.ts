import * as THREE from "three";

export class TextureScene extends THREE.WebGLRenderTarget {
  name: string;
  constructor(width: number, height: number) {
    const depthTexture = new THREE.DepthTexture(width, height);
    // Use an unsigned depth type for wide driver support
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    depthTexture.generateMipmaps = false;

    super(width, height, {
      stencilBuffer: false,
      depthBuffer: true,
      depthTexture
    });

    this.name = "TextureScene";
    this.texture.type = THREE.UnsignedByteType;
    this.texture.format = THREE.RGBAFormat;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
  }
}
