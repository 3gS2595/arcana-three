import * as THREE from "three";
import common from "../shaders/common";
import perlin from "../shaders/perlin";

export class TextureEnvelopeMaterial extends THREE.ShaderMaterial {
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

        uniform float uSeed;

        ${common}
        ${perlin}

        float saturate(float v){ return clamp(v, 0.0, 1.0); }

        void main(){
          vec2 uv = vUv;

          // Min height
          float minHeight = 0.25;

          // Max height via Perlin
          float scaleA = 2.0;
          float perlinA = perlinNoise(vec3((uv + 1000.0) * scaleA, 0.0), scaleA);
          perlinA = remap(perlinA, -1.0, 1.0, 0.0, 1.0);
          float maxHeight = perlinA;

          // Cloud "type" bands
          float stratus = saturate(1.0 - abs(uv.y - 0.95) * 2.0);
          stratus = smoothstep(0.9, 1.0, stratus);

          float cumulus = saturate(1.0 - abs(uv.y - 0.7) * 2.0);
          cumulus = smoothstep(0.3, 0.7, cumulus);

          float cumulonimbus = saturate(1.0 - abs(uv.y - 0.55) * 2.0);
          cumulonimbus = smoothstep(0.0, 0.3, cumulonimbus);

          float type = mix(stratus, cumulus, smoothstep(0.0, 0.5, uv.x));
          type = mix(type, cumulonimbus, smoothstep(0.5, 1.0, uv.x));

          out_FragColor = vec4(minHeight, maxHeight, type, 0.0);
        }
      `,
      uniforms: { uSeed: { value: 1 } }
    });

    this.glslVersion = THREE.GLSL3;
  }
}
