import * as THREE from "three";
import common from "../shaders/common";
import worley from "../shaders/worley";

export class TextureB3DMaterial extends THREE.ShaderMaterial {
  declare uniforms: { uZCoord: { value: number }; uSeed: { value: number } };

  constructor() {
    super({
      vertexShader: /* glsl */`
        precision highp float;
        in vec3 position;
        in vec2 uv;
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

        uniform float uZCoord;
        uniform float uSeed;

        ${common}
        ${worley}

        void main(){
          vec3 pos = vec3(vUv, uZCoord) + hash33(vec3(uSeed)) * 100.0;
          float baseFreq = 2.0;

          float a = worleyFbm(pos, baseFreq);
          float b = worleyFbm(pos, baseFreq * 2.0);
          float c = worleyFbm(pos, baseFreq * 4.0);

          out_FragColor = vec4(a, b, c, 1.0);
        }
      `,
      uniforms: { uZCoord: { value: 0 }, uSeed: { value: 1 } }
    });

    this.glslVersion = THREE.GLSL3;
  }

  set zCoord(v: number) { this.uniforms.uZCoord.value = v; }
}
