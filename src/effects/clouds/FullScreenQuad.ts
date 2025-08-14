import * as THREE from "three";

export class FullScreenQuad {
  private _scene: THREE.Scene;
  private _mesh: THREE.Mesh;
  private _camera: THREE.OrthographicCamera;

  constructor(material?: THREE.Material) {
    this._scene = new THREE.Scene();
    this._mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);
    this._scene.add(this._mesh);

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  dispose() {
    (this._mesh.geometry as THREE.BufferGeometry).dispose();
    // caller owns material lifecycle
  }

  /** Optional helper to force program link & inspect shader strings. */
  debugCompile(renderer: THREE.WebGLRenderer, label = "FSQ") {
    try {
      renderer.compile(this._scene, this._camera);
      const mat: any = this._mesh.material;
      const vsrc = (mat && mat.vertexShader) ? String(mat.vertexShader).slice(0, 120) : "(no VS)";
      const fsrc = (mat && mat.fragmentShader) ? String(mat.fragmentShader).slice(0, 120) : "(no FS)";
      console.log(`[${label}] compiled. Material: ${mat?.type ?? "?"}`, { vsrc, fsrc });
    } catch (e) {
      console.warn(`[${label}] compile threw:`, e);
    }
  }

  render(renderer: THREE.WebGLRenderer) {
    // Render our tiny scene with the quad and ortho camera into the current RT
    renderer.render(this._scene, this._camera);
  }

  get material() {
    return this._mesh.material;
  }

  set material(value) {
    this._mesh.material = value;
  }
}
