import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class FrameBorderOverlay {
  /**
   * @param {Object} opts
   * @param {string}  opts.url
   * @param {number}  opts.margin       legacy single margin (used if marginH/V not provided)
   * @param {number}  opts.marginH      horizontal inset fraction (left/right)
   * @param {number}  opts.marginV      vertical inset fraction (top/bottom)
   * @param {number}  opts.distance     world units in front of the camera
   * @param {boolean} opts.renderOnTop  draw above scene (no depth)
   * @param {'stretch'|'uniform'} opts.scalingMode  'stretch' matches window ratio; 'uniform' keeps asset aspect
   */
  constructor({
    url,
    margin = 0.06,
    marginH,
    marginV,
    distance = 2.0,
    renderOnTop = true,
    scalingMode = 'stretch',
  } = {}) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5 /* 50% smaller horizontally, per your request */;
    this.marginV = (marginV ?? margin);
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.scalingMode = scalingMode;

    this.group = new THREE.Group();
    this.group.name = 'FrameBorderOverlay';
    this.model = null;
    this.pivot = null;

    this._baseWidth = 1;
    this._baseHeight = 1;

    this._loaded = false;
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(this.url);

    this.model = gltf.scene || gltf.scenes?.[0];
    this.model.traverse(obj => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        if (this.renderOnTop && obj.material) {
          obj.material = obj.material.clone();
          obj.material.depthTest = false;
          obj.material.depthWrite = false;
          obj.renderOrder = 9999;
        }
      }
    });

    // Center in X/Y around origin so scaling is symmetric
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    this.pivot = new THREE.Object3D();
    this.pivot.add(this.model);
    this.model.position.sub(new THREE.Vector3(center.x, center.y, 0));

    // Cache native (unscaled) size ONCE
    this.pivot.updateMatrixWorld(true);
    const nativeBox = new THREE.Box3().setFromObject(this.pivot);
    const nativeSize = new THREE.Vector3();
    nativeBox.getSize(nativeSize);
    this._baseWidth = Math.max(nativeSize.x, 1e-6);
    this._baseHeight = Math.max(nativeSize.y, 1e-6);

    this.group.add(this.pivot);
    this._loaded = true;
  }

  /** Call every frame after controls.update() */
  update(camera /*, renderer */) {
    if (!this._loaded) return;

    // Position in front of the camera, facing it
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(dir, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // Visible viewport at this depth
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewportHeight = 2 * Math.tan(vFov / 2) * this.distance;
    const viewportWidth  = viewportHeight * camera.aspect;

    // Target box with margins (side margins are 50% of the old value)
    const wTarget = viewportWidth  * (1 - 2 * this.marginH);
    const hTarget = viewportHeight * (1 - 2 * this.marginV);

    // Per-axis scaling: 'stretch' matches window ratio; 'uniform' preserves frame aspect
    if (this.scalingMode === 'stretch') {
      const scaleX = wTarget / this._baseWidth;
      const scaleY = hTarget / this._baseHeight;
      // Keep thickness reasonable: use the smaller for Z
      const scaleZ = Math.min(scaleX, scaleY);
      this.group.scale.set(scaleX, scaleY, scaleZ);
    } else {
      // uniform fit (old behavior)
      const s = Math.min(wTarget / this._baseWidth, hTarget / this._baseHeight);
      this.group.scale.set(s, s, s);
    }
  }

  // Optional: tweak margins at runtime
  setMargins({ marginH, marginV }) {
    if (typeof marginH === 'number') this.marginH = marginH;
    if (typeof marginV === 'number') this.marginV = marginV;
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { scene.remove(this.group); }
}
