import * as THREE from "three";

export class RenderMaterial extends THREE.ShaderMaterial {
  declare uniforms: {
    uSceneTexture: { value: THREE.Texture | null };
    uCloudTexture: { value: THREE.Texture | null };
  };

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

        uniform sampler2D uSceneTexture;
        uniform sampler2D uCloudTexture;

        void main(){
          vec4 sceneColor = texture(uSceneTexture, vUv);
          if(sceneColor.a <= 0.0){ discard; return; }
          out_FragColor = texture(uCloudTexture, vUv);
        }
      `,
      uniforms: { uSceneTexture: { value: null }, uCloudTexture: { value: null } },
      transparent: true
    });

    this.glslVersion = THREE.GLSL3;
  }
}
