import * as THREE from "three";
import common from "../shaders/common";
import perlin from "../shaders/perlin";
import worley from "../shaders/worley";

export class TextureA3DMaterial extends THREE.ShaderMaterial {
  declare uniforms: { uZCoord: { value: number }; uSeed: { value: number } };

  constructor() {
    super({
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

        uniform float uZCoord;
        uniform float uSeed;

        ${common}
        ${perlin}
        ${worley}

        void main(){
          vec3 pos = vec3(vUv, uZCoord) + hash33(vec3(uSeed)) * 100.0;
          float baseFreq = 4.0;

          float worleyFbmA = worleyFbm(pos, baseFreq);
          float worleyFbmB = worleyFbm(pos, baseFreq * 2.0);
          float worleyFbmC = worleyFbm(pos, baseFreq * 4.0);
          float perlinFbmV = perlinFbm(pos, baseFreq, 7);
          float worleyPerlin = remap(perlinFbmV, 0.0, 1.0, worleyFbmA, 1.0);

          out_FragColor = vec4(worleyPerlin, worleyFbmA, worleyFbmB, worleyFbmC);
        }
      `,
      uniforms: { uZCoord: { value: 0 }, uSeed: { value: 1 } }
    });

    this.glslVersion = THREE.GLSL3;
  }

  set zCoord(v: number) { this.uniforms.uZCoord.value = v; }
}
