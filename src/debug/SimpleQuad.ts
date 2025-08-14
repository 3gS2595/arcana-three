import * as THREE from "three";

/**
 * A minimal full-screen quad renderer you can use to sanity-check:
 *  - ShaderMaterial compilation (GLSL1 + GLSL3 paths)
 *  - Scene/camera render call: renderer.render(this._scene, this._camera)
 *
 * It renders a simple animated gradient to the *current* render target.
 * No custom GL state, no post stack — just a tiny Scene + OrthoCamera.
 */
export class DebugQuadRenderer {
  private _scene: THREE.Scene;
  private _camera: THREE.OrthographicCamera;
  private _mesh: THREE.Mesh;
  private _material: THREE.ShaderMaterial | null = null;
  private _time = 0;
  private _initializedWithGL2 = false;

  constructor() {
    this._scene = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // A simple clip-space quad (−1..1)
    const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
    this._mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
  }

  /**
   * Build a *very* small ShaderMaterial. We choose GLSL 1.00 (WebGL1) or
   * GLSL 3.00 (WebGL2) depending on renderer capabilities, so both code paths
   * get exercised cleanly.
   */
  private ensureMaterial(renderer: THREE.WebGLRenderer) {
    const isGL2 = (renderer.capabilities as any).isWebGL2 as boolean;

    if (this._material && this._initializedWithGL2 === isGL2) return;

    const vs100 = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      void main() {
        vUv = uv;                         // attributes 'position' and 'uv' are injected by Three
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fs100 = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        // animated smooth gradient — easy to eyeball
        float a = 0.5 + 0.5 * sin(6.2831853 * (vUv.x + uTime * 0.1));
        gl_FragColor = vec4(vUv, a, 1.0);
      }
    `;

    const vs300 = /* glsl */`
      precision highp float;
      out vec2 vUv;                       // GLSL3 'out' varyings
      void main() {
        vUv = uv;                         // attributes injected by Three (do NOT redeclare!)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fs300 = /* glsl */`
      precision highp float;
      in vec2 vUv;                        // GLSL3 'in' varyings
      out vec4 out_FragColor;             // GLSL3 explicit output
      uniform float uTime;
      void main() {
        float a = 0.5 + 0.5 * sin(6.2831853 * (vUv.x + uTime * 0.1));
        out_FragColor = vec4(vUv, a, 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader: isGL2 ? vs300 : vs100,
      fragmentShader: isGL2 ? fs300 : fs100,
      uniforms: { uTime: { value: 0 } },
      depthTest: false,
      depthWrite: false,
      transparent: false
    });

    if (isGL2) mat.glslVersion = THREE.GLSL3;

    // Swap onto the mesh
    // (keep previous material for GC — Three will dispose when scene is torn down;
    // if you want eager cleanup, remember to call .dispose() on the old one.)
    this._mesh.material = mat;
    this._material = mat;
    this._initializedWithGL2 = isGL2;
  }

  /** Call each frame to update a tiny time uniform for animation. */
  update(dt: number) {
    this._time += dt;
    if (this._material) this._material.uniforms.uTime.value = this._time;
  }

  /** The exact render call you asked to validate. */
  render(renderer: THREE.WebGLRenderer) {
    this.ensureMaterial(renderer);
    renderer.render(this._scene, this._camera);
  }

  /** No-op for now (quad uses clip-space). Keep for API parity. */
  resize(_w: number, _h: number) {
    // Nothing to do. If you later add screen-space UV transforms, put them here.
  }

  dispose() {
    if (this._mesh.geometry) (this._mesh.geometry as THREE.BufferGeometry).dispose();
    if (this._material) this._material.dispose();
  }
}
