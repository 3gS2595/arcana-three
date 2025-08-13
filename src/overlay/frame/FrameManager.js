// src/overlay/frame/FrameManager.js
import { THREE } from '../../core/three.js';
import { PART_FILES, MAINS, H_EXPANDERS, V_EXPANDERS, EPS } from './constants.js';
import { FrameLoader } from './FrameLoader.js';

/**
 * Public class used by main.js (keeps the same API you already call).
 * Corners & mains stay at 1×; only expanders scale to fill to the viewport box (after margins).
 */
export class FrameBorderOverlay {
  constructor({
    dir = '/assets/glb/',
    distance = 2.0,
    marginH = 0.01,
    marginV = 0.01,
    renderOnTop = true,
    lighting = 'normals',
    mixStrength = 0.6,
    fillMode = 'expandersOnly'
  } = {}) {
    // options
    this.dir = dir;
    this.distance = distance;
    this.marginH = THREE.MathUtils.clamp(marginH, 0, 0.49);
    this.marginV = THREE.MathUtils.clamp(marginV, 0, 0.49);
    this.renderOnTop = !!renderOnTop;
    this.lighting = lighting;
    this.mixStrength = THREE.MathUtils.clamp(mixStrength ?? 0.6, 0, 1);
    this.fillMode = (fillMode === 'mainsFill') ? 'mainsFill' : 'expandersOnly';

    // objects
    this.loader = new FrameLoader({
      dir: this.dir,
      renderOnTop: this.renderOnTop,
      lighting: this.lighting,
      mixStrength: this.mixStrength
    });

    this.group = this.loader.group;
    this.parts = this.loader.parts;

    // measured numbers (computed after load)
    this._baseOuterW = 2.0;
    this._baseOuterH = 1.0;
    this._widthNoHX  = 1.8;
    this._heightNoVY = 0.8;
    this._unitX = 0.1;
    this._unitY = 0.1;

    // debug helpers
    this._debug = { pivots: false, bounds: false, verbose: false };
    this._pivotMarkers = [];
    this._boxHelpers = [];

    // scratch
    this._tmpBox = new THREE.Box3();
    this._tmpV = new THREE.Vector3();
  }

  // ---- Public API used by your UI ----
  async load() {
    await this.loader.loadFiles(PART_FILES);
    this._syncPivotMarkers();
    this._syncBoxHelpers();
    this._measureBaseNumbers();
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { if (this.group.parent) this.group.parent.remove(this.group); }

  setDistance(d) { if (typeof d === 'number') this.distance = d; }
  setMargins(h, v) {
    if (typeof h === 'number') this.marginH = THREE.MathUtils.clamp(h, 0, 0.49);
    if (typeof v === 'number') this.marginV = THREE.MathUtils.clamp(v, 0, 0.49);
  }
  setFillMode(mode) { this.fillMode = (mode === 'mainsFill') ? 'mainsFill' : 'expandersOnly'; }

  setLighting(mode) { this.loader.setLighting(mode); }
  setMixStrength(v) { this.loader.setMixStrength(v); }

  setDebugPivots(on) { this._debug.pivots = !!on; this._syncPivotMarkers(); }
  setDebugBounds(on) { this._debug.bounds = !!on; this._syncBoxHelpers(); }

  // alias to avoid breaking main.js
  debugDump() { this.dump(); }
  dump() {
    if (!this.parts.size) { console.warn('[FrameOverlay] not loaded'); return; }
    const d = this._computeViewInfo(this._lastCamera);
    const calc = this._lastCalc || {};
    console.group('[FrameOverlay] Debug Dump');
    console.log('distance', this.distance);
    console.log('view (W,H)', d.viewW.toFixed(4), d.viewH.toFixed(4),
                'inner (W,H)', d.wTarget.toFixed(4), d.hTarget.toFixed(4));
    console.log('margins', { h:this.marginH, v:this.marginV }, 'fillMode', this.fillMode);
    console.log('baseDims 1×:', { W:this._baseOuterW, H:this._baseOuterH });
    console.log('noExpanders:', { W_noHX:this._widthNoHX, H_noVY:this._heightNoVY });
    console.log('units:', { unitX:this._unitX, unitY:this._unitY });
    console.log('calc:', calc);
    for (const [name, P] of this.parts) {
      P.object.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(P.object);
      const sz = b.getSize(new THREE.Vector3());
      console.log(name, {
        worldPos: P.object.getWorldPosition(new THREE.Vector3()).toArray(),
        scale: P.object.scale.toArray(),
        bbox: { w:+sz.x.toFixed(5), h:+sz.y.toFixed(5), d:+sz.z.toFixed(5) }
      });
    }
    console.groupEnd();
  }

  // ---- per-frame ----
  update(camera) {
    if (!this.parts.size) return;
    this._lastCamera = camera;

    // 1) Stick to camera like a HUD (billboard)
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(fwd, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // 2) Compute viewport box (after margins) at this distance
    const { wTarget, hTarget } = this._computeViewInfo(camera);

    // 3) Uniform base scale s0 so the authored 1× frame fits within the limiting axis
    const sW = wTarget / Math.max(EPS, this._baseOuterW);
    const sH = hTarget / Math.max(EPS, this._baseOuterH);
    const s0 = Math.max(EPS, Math.min(sW, sH));
    this.group.scale.set(s0, s0, s0);

    // 4) Solve expander scales so OuterWidth/Height match exactly.
    // Work in pre-scale space; clamp >= 1 (never shrink expanders).
    let aX = 1, aY = 1;
    if (this._unitX > EPS) {
      const preTargetW = wTarget / s0;
      aX = (preTargetW - this._widthNoHX) / (2 * this._unitX);
      if (!Number.isFinite(aX) || aX < 1) aX = 1;
    }
    if (this._unitY > EPS) {
      const preTargetH = hTarget / s0;
      aY = (preTargetH - this._heightNoVY) / (2 * this._unitY);
      if (!Number.isFinite(aY) || aY < 1) aY = 1;
    }

    // 5) Apply: expanders stretch; mains stay 1× unless explicitly allowed
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(aX, 1, 1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1, aY, 1);

    if (this.fillMode === 'mainsFill') {
      if (aX > 1) {
        this.parts.get('main-top').object.scale.set(aX, 1, 1);
        this.parts.get('main-bottom').object.scale.set(aX, 1, 1);
      } else {
        this.parts.get('main-top').object.scale.set(1, 1, 1);
        this.parts.get('main-bottom').object.scale.set(1, 1, 1);
      }
      if (aY > 1) {
        this.parts.get('main-left').object.scale.set(1, aY, 1);
        this.parts.get('main-right').object.scale.set(1, aY, 1);
      } else {
        this.parts.get('main-left').object.scale.set(1, 1, 1);
        this.parts.get('main-right').object.scale.set(1, 1, 1);
      }
    } else {
      for (const k of MAINS) this.parts.get(k).object.scale.set(1, 1, 1);
    }

    // 6) Debug helpers refresh
    for (const h of this._boxHelpers) h.update();

    // 7) keep a summary
    const expectedW = s0 * this._baseOuterW;
    const expectedH = s0 * this._baseOuterH;
    this._lastCalc = { s0, aX, aY, expectedW, expectedH, wTarget, hTarget };
  }

  // ---- internals ----
  _computeViewInfo(camera) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    const wTarget = viewW * (1 - 2 * this.marginH);
    const hTarget = viewH * (1 - 2 * this.marginV);
    return { viewW, viewH, wTarget, hTarget };
  }

  _measureBaseNumbers() {
    const sizeOf = (obj) => {
      this._tmpBox.setFromObject(obj);
      const s = this._tmpBox.getSize(this._tmpV);
      // IMPORTANT: after axis-fix, parts lie in the XY plane -> width=X, height=Y
      return { w: s.x, h: s.y, d: s.z };
    };

    // Ensure expanders at 1×
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    this.group.updateMatrixWorld(true);

    // Full base outer dims
    const full = sizeOf(this.group);
    this._baseOuterW = full.w;
    this._baseOuterH = full.h;

    // Horizontal off -> width without H contribution
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(0,1,1);
    this.group.updateMatrixWorld(true);
    const noH = sizeOf(this.group);
    this._widthNoHX = noH.w;

    // Restore H, turn off V -> height without V contribution
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,0,1);
    this.group.updateMatrixWorld(true);
    const noV = sizeOf(this.group);
    this._heightNoVY = noV.h;

    // Restore all to 1×
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    this.group.updateMatrixWorld(true);

    // per-side units
    const dW = Math.max(0, this._baseOuterW - this._widthNoHX);
    const dH = Math.max(0, this._baseOuterH - this._heightNoVY);
    this._unitX = (dW > EPS) ? dW / 2 : 0.1;
    this._unitY = (dH > EPS) ? dH / 2 : 0.1;
  }

  _syncPivotMarkers() {
    for (const m of this._pivotMarkers) m.parent?.remove(m);
    this._pivotMarkers.length = 0;
    if (!this._debug.pivots) return;

    const mk = () => {
      const g = new THREE.RingGeometry(0.012, 0.02, 24);
      const m = new THREE.MeshBasicMaterial({ color: 0xff66cc, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 10000;
      return mesh;
    };
    for (const [, P] of this.parts) {
      const marker = mk();
      P.pivot.add(marker);
      this._pivotMarkers.push(marker);
    }
  }

  _syncBoxHelpers() {
    for (const h of this._boxHelpers) this.group.remove(h);
    this._boxHelpers.length = 0;
    if (!this._debug.bounds) return;

    for (const [, P] of this.parts) {
      const h = new THREE.BoxHelper(P.object, 0x66ccff);
      h.material.depthTest = false;
      h.material.depthWrite = false;
      h.renderOrder = 9998;
      this.group.add(h);
      this._boxHelpers.push(h);
    }
  }
}
