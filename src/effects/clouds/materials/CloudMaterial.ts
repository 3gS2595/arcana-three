import * as THREE from "three";
import defines from "../shaders/defines";
import getWorldSpacePos from "../shaders/getWorldSpacePos";
import intersectAABB from "../shaders/intersectAABB";
import ray from "../shaders/ray";
import rayMarch from "../shaders/rayMarch";

export class CloudMaterial extends THREE.ShaderMaterial {
  declare uniforms: {
    uSceneTexture: { value: THREE.Texture | null };
    uSceneDepthTexture: { value: THREE.Texture | null };
    uTextureA: { value: THREE.Texture | null };
    uTextureB: { value: THREE.Texture | null };
    uTextureC: { value: THREE.Texture | null };
    uTextureEnvelope: { value: THREE.Texture | null };

    uCameraNearFar: { value: THREE.Vector2 };
    uCameraPosition: { value: THREE.Vector3 };
    uProjectionInverse: { value: THREE.Matrix4 };
    uCameraMatrixWorld: { value: THREE.Matrix4 };

    uBoxMin: { value: THREE.Vector3 };
    uBoxMax: { value: THREE.Vector3 };

    uTime: { value: number };
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
        precision highp sampler3D;

        ${defines}
        ${ray}
        ${intersectAABB}
        ${getWorldSpacePos}
        ${rayMarch}

        in vec2 vUv;
        out vec4 out_FragColor;

        uniform sampler2D uSceneTexture;
        uniform sampler2D uSceneDepthTexture;
        uniform sampler3D uTextureA;
        uniform sampler3D uTextureB;
        uniform sampler2D uTextureC;
        uniform sampler2D uTextureEnvelope;

        uniform vec2 uCameraNearFar;
        uniform vec3 uCameraPosition;
        uniform mat4 uProjectionInverse;
        uniform mat4 uCameraMatrixWorld;

        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;

        uniform float uTime;

        float saturate(float v){ return clamp(v,0.0,1.0); }
        float remap(float v,float a,float b,float c,float d){ return c + (clamp((v-a)/(b-a),0.0,1.0)*(d-c)); }

        float getDimensionalProfile(vec3 p, out float hBlend){
          vec4 env = texture(uTextureEnvelope, p.xz);
          float minH=env.r, maxH=env.g;

          float h = p.y * step(minH, p.y) * step(p.y, maxH);
          h = remap(h, minH, maxH, 0.0, 1.0);
          h = 1.0 - abs(h - 0.5) * 2.0;

          float edge = pow(1.0 - saturate(length(p.xz-0.5) * 2.0), 1.0);
          hBlend = h;
          return h * edge;
        }

        float getCloudDensity(vec3 p){
          float scale=2.0;
          vec3 coord = mod(p*scale + vec3(uTime*0.1,0.0,0.0), 1.0);

          vec4 A = texture(uTextureA, coord);
          float perlinWorley = A.r;

          float hBlend=0.0;
          float dim = getDimensionalProfile(p, hBlend);

          float density = saturate(perlinWorley - (1.0 - dim));
          return density;
        }

        void main(){
          vec2 uv = vUv;

          vec4 sceneColor = texture(uSceneTexture, uv);
          if(sceneColor.a <= 0.0){ discard; return; }

          vec3 worldPos = computeWorldPosition(uv, uSceneDepthTexture, uProjectionInverse, uCameraMatrixWorld);

          Ray r; r.origin = uCameraPosition; r.dir = normalize(worldPos - uCameraPosition);
          vec2 nf = intersectAABB(r, uBoxMin, uBoxMax);

          vec4 col = rayMarch(r.origin, r.dir, nf.x, nf.y, uBoxMin, uBoxMax);
          out_FragColor = col;
        }
      `,
      uniforms: {
        uSceneTexture: { value: null },
        uSceneDepthTexture: { value: null },
        uTextureA: { value: null },
        uTextureB: { value: null },
        uTextureC: { value: null },
        uTextureEnvelope: { value: null },

        uCameraNearFar: { value: new THREE.Vector2() },
        uCameraPosition: { value: new THREE.Vector3() },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uCameraMatrixWorld: { value: new THREE.Matrix4() },

        uBoxMin: { value: new THREE.Vector3() },
        uBoxMax: { value: new THREE.Vector3() },

        uTime: { value: 0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    // Enable GLSL 3 (WebGL2) for 3D textures
    this.glslVersion = THREE.GLSL3;

    // Enable alphaHash if available (r150+)
    // @ts-ignore
    if (typeof (this as any).alphaHash === "boolean") {
      // @ts-ignore
      (this as any).alphaHash = true;
    }
  }

  updateUniforms(dt: number, camera: THREE.PerspectiveCamera, box: THREE.Box3) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCameraNearFar.value.set(camera.near, camera.far);
    this.uniforms.uCameraPosition.value.copy(camera.position);
    this.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
    this.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
    this.uniforms.uBoxMin.value.copy(box.min);
    this.uniforms.uBoxMax.value.copy(box.max);
  }
}
