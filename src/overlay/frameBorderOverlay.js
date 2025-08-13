// src/overlay/frameBorderOverlay.js
import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PART_FILES = {
  // corners
  'corner-top-left':        'corner-top-left.glb',
  'corner-top-right':       'corner-top-right.glb',
  'corner-bottom-left':     'corner-bottom-left.glb',
  'corner-bottom-right':    'corner-bottom-right.glb',
  // mains (fixed interior rim segments)
  'main-top':               'main-top.glb',
  'main-bottom':            'main-bottom.glb',
  'main-left':              'main-left.glb',
  'main-right':             'main-right.glb',
  // horizontal expanders (scale X)
  'top-left-expander':      'top-left-expander.glb',
  'top-right-expander':     'top-right-expander.glb',
  'bottom-left-expander':   'bottom-left-expander.glb',
  'bottom-right-expander':  'bottom-right-expander.glb',
  // vertical expanders (scale Y)
  'left-top-expander':      'left-top-expander.glb',
  'left-bottom-expander':   'left-bottom-expander.glb',
  'right-top-expander':     'right-top-expander.glb',
  'right-bottom-expander':  'right-bottom-expander.glb'
};

const CORNERS = [
  'corner-top-left', 'corner-top-right', 'corner-bottom-left', 'corner-bottom-right'
];
const MAINS = [
  'main-top', 'main-bottom', 'main-left', 'main-right'
];
const H_EXPANDERS = [
  'top-left-expander', 'bottom-left-expander', 'top-right-expander', 'bottom-right-expander'
];
const V_EXPANDERS = [
  'left-top-expander', 'left-bottom-expander', 'right-top-expander', 'right-bottom-expander'
];

export class FrameBorderOverlay {
  /**
   * Options:
   *  - dir: base directory for 16-part GLBs (e.g. "/assets/glb/")
   *  - distance: world units in front of camera
   *  - marginH, marginV: 0..1 fraction of viewport (outer frame inset)
   *  - renderOnTop: boolean (depthTest=false, depthWrite=false)
   *  - lighting: 'unlit' | 'keep' | 'normals'
   *  - mixStrength: (0..1) only for 'normals'
   *  - fillMode: 'expandersOnly' | 'mainsFill'   (default 'expandersOnly')
   */
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
    this.dir = dir;
    this.distance = distance;
    this.marginH = marginH;
    this.marginV = marginV;
    this.renderOnTop = !!renderOnTop;
    this.lighting = lighting;
    this.mixStrength = THREE.MathUtils.clamp(mixStrength ?? 0.6, 0, 1);
    this.fillMode = fillMode;

    this.group = new THREE.Group();
    this.group.name = 'FrameBorderOverlayGroup';

    this._loaded = false;

    // Parts map: name -> { object, pivot, meshes[], originalMats[] }
    this.parts = new Map();

    // For robust math (auto-measured from the models)
    this._baseOuterW = 2.0;         // assembled width (expanders at 1×)
    this._baseOuterH = 1.0;         // assembled height (expanders at 1×)
    this._widthNoHX = 1.8;          // width with horizontal expanders "off"
    this._heightNoVY = 0.8;         // height with vertical expanders "off"
    this._expanderUnitX = 0.1;      // per-side horizontal contribution at 1×
    this._expanderUnitY = 0.1;      // per-side vertical contribution at 1×

    // Debug helpers
    this._debug = {
      pivots: false,
      bounds: false,
      verbose: true
    };
    this._pivotMarkers = [];
    this._boxHelpers = [];

    // cache
    this._tmpBox = new THREE.Box3();
    this._tmpV = new THREE.Vector3();
  }

  // ---------- Public API used by your UI ----------
  setDistance(d) { this.distance = (typeof d === 'number') ? d : this.distance; }
  setMargins(h, v) {
    if (typeof h === 'number') this.marginH = THREE.MathUtils.clamp(h, 0, 0.49);
    if (typeof v === 'number') this.marginV = THREE.MathUtils.clamp(v, 0, 0.49);
  }
  setFillMode(mode) {
    this.fillMode = (mode === 'mainsFill') ? 'mainsFill' : 'expandersOnly';
  }
  setLighting(mode) {
    const m = (mode || '').toLowerCase();
    this.lighting = (m === 'keep' || m === 'unlit' || m === 'normals') ? m : this.lighting;
    if (!this._loaded) return;
    // reapply to all meshes
    for (const [, P] of this.parts) this._applyLightingForObject(P);
  }
  setMixStrength(v) {
    this.mixStrength = THREE.MathUtils.clamp(v ?? this.mixStrength, 0, 1);
    if (!this._loaded || this.lighting !== 'normals') return;
    for (const [, P] of this.parts) {
      for (const mesh of P.meshes) {
        const mat = mesh.material;
        if (mat && mat.uniforms && mat.uniforms.mixStrength) {
          mat.uniforms.mixStrength.value = this.mixStrength;
        }
      }
    }
  }
  setDebugPivots(on) { this._debug.pivots = !!on; this._syncPivotMarkers(); }
  setDebugBounds(on) { this._debug.bounds = !!on; this._syncBoxHelpers(); }
  dump() {
    if (!this._loaded) { console.warn('[FrameOverlay] not loaded'); return; }
    const d = this._computeViewInfo(this._lastCamera);
    const calc = this._lastCalc || {};
    console.group('[FrameOverlay] Debug Dump');
    console.log('distance', this.distance);
    console.log('view (W,H)', d.viewW.toFixed(4), d.viewH.toFixed(4), 'inner (W,H)', d.wTarget.toFixed(4), d.hTarget.toFixed(4));
    console.log('fillMode', this.fillMode, 'margins', {h:this.marginH, v:this.marginV});
    console.log('baseDims with expanders=1:', { W:this._baseOuterW, H:this._baseOuterH });
    console.log('baseDims without expanders:', { W_noHX:this._widthNoHX, H_noVY:this._heightNoVY });
    console.log('per-side units:', { unitX:this._expanderUnitX, unitY:this._expanderUnitY });
    console.log('calc:', calc);
    for (const [name, P] of this.parts) {
      P.object.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(P.object);
      const sz = b.getSize(new THREE.Vector3());
      console.log(name, {
        worldPos: P.object.getWorldPosition(new THREE.Vector3()).toArray(),
        scale: P.object.scale.toArray(),
        bbox: { w: +sz.x.toFixed(5), h: +sz.y.toFixed(5), d: +sz.z.toFixed(5) }
      });
    }
    console.groupEnd();
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { if (this.group.parent) this.group.parent.remove(this.group); }

  // ---------- Loading & setup ----------
  async load() {
    const loader = new GLTFLoader();
    const loadOne = async (name, url) => {
      const gltf = await loader.loadAsync(url);
      const root = new THREE.Group();
      root.name = `overlay-part:${name}`;
      root.add(gltf.scene);

      // Gather all meshes and remember original materials for "keep" mode
      const meshes = [];
      const originals = [];
      gltf.scene.traverse(n => {
        if (n.isMesh) {
          meshes.push(n);
          originals.push(n.material);
          n.frustumCulled = false;
          n.renderOrder = 9999;
        }
      });

      const P = { name, object: root, meshes, originals, pivot: new THREE.Object3D() };
      P.pivot.name = `pivot:${name}`;
      P.pivot.add(root);
      // do not reposition — your GLBs already contain absolute placement/origins
      this.group.add(P.pivot);
      this.parts.set(name, P);

      // apply initial lighting
      this._applyLightingForObject(P);

      return P;
    };

    // Load all 16
    await Promise.all(Object.entries(PART_FILES).map(([name, file]) => {
      return loadOne(name, this.dir + file);
    }));

    // Initial helpers off
    this._syncPivotMarkers();
    this._syncBoxHelpers();

    // Auto-measure base dimensions & per-side expander units to be model-agnostic
    this._measureBaseNumbers();

    this._loaded = true;
  }

  _applyLightingForObject(P) {
    for (const mesh of P.meshes) {
      const src = mesh.material;
      const mode = this.lighting;

      if (mode === 'unlit') {
        const mat = new THREE.MeshBasicMaterial({
          color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
          map: src?.map ?? null,
          transparent: !!src?.transparent || !!src?.alphaMap,
          opacity: (typeof src?.opacity === 'number') ? src.opacity : 1,
          side: src?.side ?? THREE.FrontSide,
          alphaTest: src?.alphaTest ?? 0,
          depthTest: this.renderOnTop ? false : true,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true),
          fog: false,
          toneMapped: false,
          vertexColors: !!src?.vertexColors
        });
        if (mat.map && 'colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        mesh.material = mat;

      } else if (mode === 'normals') {
        const map = src?.map ?? null;
        if (map && 'colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;
        const uniforms = {
          map: { value: map },
          useMap: { value: !!map },
          mixStrength: { value: this.mixStrength }
        };
        const vert = `
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;
        const frag = `
          uniform sampler2D map;
          uniform bool useMap;
          uniform float mixStrength;
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vec3 n = normalize(vNormal) * 0.5 + 0.5;
            vec3 tex = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
            vec3 col = mix(tex, n, mixStrength);
            gl_FragColor = vec4(col, 1.0);
          }
        `;
        mesh.material = new THREE.ShaderMaterial({
          uniforms, vertexShader: vert, fragmentShader: frag,
          transparent: !!src?.transparent || !!src?.alphaMap,
          depthTest: this.renderOnTop ? false : true,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true)
        });

      } else {
        // 'keep' — try to restore originals if we have them
        const idx = P.meshes.indexOf(mesh);
        if (idx >= 0 && P.originals[idx]) {
          mesh.material = P.originals[idx].clone();
        }
        if (this.renderOnTop && mesh.material) {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.fog = false;
          if ('toneMapped' in mesh.material) mesh.material.toneMapped = false;
        }
      }
    }
  }

  _measureBaseNumbers() {
    const sizeOf = (obj) => {
      this._tmpBox.setFromObject(obj);
      const s = this._tmpBox.getSize(this._tmpV);
      return { w: s.x, h: s.y, d: s.z };
    };

    // Ensure all expanders at base 1×
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    this.group.updateMatrixWorld(true);

    // Full base dims with expanders = 1
    const baseSize = sizeOf(this.group);
    this._baseOuterW = baseSize.w;
    this._baseOuterH = baseSize.h;

    // Horizontal off (scaleX=0 on H expanders)
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(0,1,1);
    this.group.updateMatrixWorld(true);
    const noHSize = sizeOf(this.group);
    this._widthNoHX = noHSize.w;

    // Restore H, turn off V (scaleY=0)
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,0,1);
    this.group.updateMatrixWorld(true);
    const noVSize = sizeOf(this.group);
    this._heightNoVY = noVSize.h;

    // Restore all to 1
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    this.group.updateMatrixWorld(true);

    // Per-side units derived from measured deltas (robust to tiny asset differences)
    const deltaW = Math.max(0, this._baseOuterW - this._widthNoHX);
    const deltaH = Math.max(0, this._baseOuterH - this._heightNoVY);
    this._expanderUnitX = (deltaW > 1e-6) ? deltaW / 2 : 0.1;
    this._expanderUnitY = (deltaH > 1e-6) ? deltaH / 2 : 0.1;

    if (this._debug.verbose) {
      console.info('[FrameOverlay] base measured:',
        { baseW: this._baseOuterW, baseH: this._baseOuterH,
          widthNoHX: this._widthNoHX, heightNoVY: this._heightNoVY,
          unitX: this._expanderUnitX, unitY: this._expanderUnitY });
    }
  }

  // ---------- Debug helpers ----------
  _syncPivotMarkers() {
    // remove old
    for (const m of this._pivotMarkers) { m.parent?.remove(m); }
    this._pivotMarkers.length = 0;

    if (!this._debug.pivots) return;
    const mk = () => {
      const g = new THREE.RingGeometry(0.012, 0.02, 24);
      const m = new THREE.MeshBasicMaterial({ color: 0xff66cc, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 10000;
      mesh.rotation.x = Math.PI / 2; // face camera-ish
      return mesh;
    };
    for (const [, P] of this.parts) {
      const marker = mk();
      P.pivot.add(marker); // at the pivot/origin of each part
      this._pivotMarkers.push(marker);
    }
  }

  _syncBoxHelpers() {
    for (const h of this._boxHelpers) { this.group.remove(h); }
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

  // ---------- Per-frame update ----------
  update(camera) {
    if (!this._loaded) return;
    this._lastCamera = camera;

    // 1) Stick to camera (billboard)
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(fwd, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // 2) Compute available viewport box at this distance (after margins)
    const info = this._computeViewInfo(camera);
    const { wTarget, hTarget } = info;

    // 3) Choose uniform scale s0 that fits base frame (expanders=1) into the limiting axis
    const sW = wTarget / Math.max(1e-9, this._baseOuterW);
    const sH = hTarget / Math.max(1e-9, this._baseOuterH);
    const s0 = Math.max(1e-6, Math.min(sW, sH)); // never 0
    this.group.scale.set(s0, s0, s0);

    // 4) Decide which axis has slack and compute expander scale for that axis only
    //    Formulas (model-agnostic, measured):
    //    OutW(s0, aX) = s0 * (widthNoHX + 2 * unitX * aX)
    //    OutH(s0, aY) = s0 * (heightNoVY + 2 * unitY * aY)
    let aX = 1, aY = 1;
    const expectedW = s0 * this._baseOuterW;
    const expectedH = s0 * this._baseOuterH;
    const slackW = wTarget - expectedW;
    const slackH = hTarget - expectedH;

    // Slight epsilon to avoid flapping
    const EPS = 1e-6;

    if (slackW > slackH + EPS) {
      // widen horizontally using horizontal expanders
      if (this._expanderUnitX > EPS) {
        const targetInnerW = wTarget / s0;
        aX = (targetInnerW - this._widthNoHX) / (2 * this._expanderUnitX);
        if (!Number.isFinite(aX) || aX < 1) aX = 1;
      }
    } else if (slackH > slackW + EPS) {
      // grow vertically using vertical expanders
      if (this._expanderUnitY > EPS) {
        const targetInnerH = hTarget / s0;
        aY = (targetInnerH - this._heightNoVY) / (2 * this._expanderUnitY);
        if (!Number.isFinite(aY) || aY < 1) aY = 1;
      }
    } else {
      // very close — do nothing extra
    }

    // 5) Apply local expander scales (origins are at inner seams → no translations required)
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(aX, 1, 1);
    for (const k of V_EXPANDERS) this.parts.get(k).object.scale.set(1, aY, 1);

    // Optionally allow mains to stretch in the non-limiting axis (rarely desired)
    if (this.fillMode === 'mainsFill') {
      if (aX > 1) { // widen: scale X on top/bottom mains only
        this.parts.get('main-top').object.scale.set(aX, 1, 1);
        this.parts.get('main-bottom').object.scale.set(aX, 1, 1);
      } else if (aY > 1) { // grow tall: scale Y on left/right mains only
        this.parts.get('main-left').object.scale.set(1, aY, 1);
        this.parts.get('main-right').object.scale.set(1, aY, 1);
      } else {
        // reset mains
        for (const k of MAINS) this.parts.get(k).object.scale.set(1,1,1);
      }
    } else {
      // strict expanders-only: keep mains exactly at base local scale
      for (const k of MAINS) this.parts.get(k).object.scale.set(1,1,1);
    }

    // 6) Debug helpers live-update
    for (const h of this._boxHelpers) h.update();

    // 7) keep a summary for dump()
    this._lastCalc = { s0, aX, aY, expectedW, expectedH, slackW, slackH, wTarget, hTarget };
  }

  _computeViewInfo(camera) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    const wTarget = viewW * (1 - 2 * this.marginH);
    const hTarget = viewH * (1 - 2 * this.marginV);
    return { viewW, viewH, wTarget, hTarget };
  }
}
