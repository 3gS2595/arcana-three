import * as THREE from "three";
import common from "../shaders/common";
import perlin from "../shaders/perlin";

export class TextureC2DMaterial extends THREE.ShaderMaterial {
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

        uniform float uSeed;

        ${common}
        ${perlin}

        void main(){
          vec3 pos = vec3(vUv, 0.0) + hash33(vec3(uSeed)) * 100.0;
          float baseFreq = 4.0;

          float curlA = curlNoise(pos, baseFreq);
          float curlB = curlNoise(pos, baseFreq * 2.0);
          float curlC = curlNoise(pos, baseFreq * 4.0);

          out_FragColor = vec4(curlA, curlB, curlC, 1.0);
        }
      `,
      uniforms: { uSeed: { value: 1 } }
    });

    this.glslVersion = THREE.GLSL3;
  }
}
