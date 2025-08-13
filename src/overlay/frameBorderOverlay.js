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
  // vertical expanders (scale Y or Z depending on verticalAxis)
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
  'top-left-expander', 'top-right-expander', 'bottom-left-expander', 'bottom-right-expander'
];
const V_EXPANDERS = [
  'left-top-expander', 'left-bottom-expander', 'right-top-expander', 'right-bottom-expander'
];

const EPS = 1e-6;

export class FrameBorderOverlay {
  /**
   * Options:
   *  - dir: base directory for the 16 GLBs
   *  - distance: world units in front of camera
   *  - marginH, marginV: 0..1 fraction of viewport (outer frame inset)
   *  - renderOnTop: boolean (depthTest=false, depthWrite=false)
   *  - lighting: 'unlit' | 'keep' | 'normals'
   *  - mixStrength: (0..1) only for 'normals'
   *  - fillMode: 'expandersOnly' | 'mainsFill' (default 'expandersOnly')
   *  - fit: 'height' | 'width' | 'min'   (how to choose the group’s uniform scale)  [default 'height']
   *  - verticalAxis: 'y' | 'z'           (which axis is “frame height” in your GLBs) [default 'y']
   *  - allowShrinking: boolean           (allow expanders to be < 1× when needed)    [default true]
   */
  constructor({
    dir = '/assets/glb/',
    distance = 2.0,
    marginH = 0.01,
    marginV = 0.01,
    renderOnTop = true,
    lighting = 'normals',
    mixStrength = 0.6,
    fillMode = 'expandersOnly',
    fit = 'height',
    verticalAxis = 'y',
    allowShrinking = true
  } = {}) {
    this.dir = dir;
    this.distance = distance;
    this.marginH = THREE.MathUtils.clamp(marginH, 0, 0.49);
    this.marginV = THREE.MathUtils.clamp(marginV, 0, 0.49);
    this.renderOnTop = !!renderOnTop;
    this.lighting = lighting;
    this.mixStrength = THREE.MathUtils.clamp(mixStrength ?? 0.6, 0, 1);
    this.fillMode = (fillMode === 'mainsFill') ? 'mainsFill' : 'expandersOnly';

    // NEW
    this.fit = (fit === 'width' || fit === 'min') ? fit : 'height';
    this.verticalAxis = (verticalAxis === 'z') ? 'z' : 'y';
    this.allowShrinking = !!allowShrinking;

    // convenience indices for vertical scaling
    this._vIndex = (this.verticalAxis === 'z') ? 2 : 1; // 0=x, 1=y, 2=z

    this.group = new THREE.Group();
    this.group.name = 'FrameBorderOverlayGroup';

    this._loaded = false;
    this.parts = new Map();   // name -> { object, pivot, meshes[], originals[] }

    // Measured numbers (computed after load)
    this._baseOuterW = 2.0;   // assembled width with expanders at 1×
    this._baseOuterH = 1.0;   // assembled height with expanders at 1×
    this._widthNoHX  = 1.8;   // assembled width with H expanders at 0×
    this._heightNoV  = 0.8;   // assembled height with V expanders at 0× (Y or Z based on verticalAxis)
    this._unitX = 0.1;        // per-side H expander contribution at 1× (pre-scale)
    this._unitV = 0.1;        // per-side V expander contribution at 1× (pre-scale)

    // Debug toggles
    this._debug = { pivots: false, bounds: false, verbose: false };
    this._pivotMarkers = [];
    this._boxHelpers = [];

    // scratch
    this._tmpBox = new THREE.Box3();
    this._tmpV   = new THREE.Vector3();
  }

  // ---------- Public API ----------
  setDistance(d) { if (typeof d === 'number') this.distance = d; }
  setMargins(h, v) {
    if (typeof h === 'number') this.marginH = THREE.MathUtils.clamp(h, 0, 0.49);
    if (typeof v === 'number') this.marginV = THREE.MathUtils.clamp(v, 0, 0.49);
  }
  setFillMode(mode) { this.fillMode = (mode === 'mainsFill') ? 'mainsFill' : 'expandersOnly'; }

  setLighting(mode) {
    const m = (mode || '').toLowerCase();
    if (m === 'keep' || m === 'unlit' || m === 'normals') this.lighting = m;
    if (!this._loaded) return;
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

  debugDump() { this.dump(); }
  dump() {
    if (!this._loaded) { console.warn('[FrameOverlay] not loaded'); return; }
    const d = this._computeViewInfo(this._lastCamera);
    const calc = this._lastCalc || {};
    console.group('[FrameOverlay] Debug Dump');
    console.log('distance', this.distance, 'fit', this.fit, 'verticalAxis', this.verticalAxis);
    console.log('view (W,H)', d.viewW.toFixed(4), d.viewH.toFixed(4),
                'inner (W,H)', d.wTarget.toFixed(4), d.hTarget.toFixed(4));
    console.log('margins', { h:this.marginH, v:this.marginV }, 'fillMode', this.fillMode);
    console.log('baseDims 1×:', { W:this._baseOuterW, H:this._baseOuterH });
    console.log('noExpanders:', { W_noHX:this._widthNoHX, H_noV:this._heightNoV });
    console.log('units:', { unitX:this._unitX, unitV:this._unitV });
    console.log('calc:', calc);
    for (const [name, P] of this.parts) {
      P.object.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(P.object);
      const sz = b.getSize(new THREE.Vector3());
      console.log(name, {
        worldPos: P.object.getWorldPosition(new THREE.Vector3()).toArray(),
        scale: P.object.scale.toArray(),
        bbox: { w:+sz.x.toFixed(5), y:+sz.y.toFixed(5), z:+sz.z.toFixed(5) }
      });
    }
    console.groupEnd();
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { if (this.group.parent) this.group.parent.remove(this.group); }

  // ---------- Loading ----------
async load() {
  const loader = new GLTFLoader();

  const loadOne = async (name, url) => {
    const gltf = await loader.loadAsync(url);

    // Root for this part under our overlay group
    const root = new THREE.Group();
    root.name = `overlay-part:${name}`;

    // axisFix converts XZ-plane (Z up) assets into XY-plane (Y up)
    const axisFix = new THREE.Group();
    axisFix.name = `axisFix:${name}`;
    // IMPORTANT: your GLBs are XZ (Z-up) -> rotate -90° about X so Z becomes +Y


    axisFix.add(gltf.scene);
    root.add(axisFix);

    // Collect meshes from axisFix (not gltf.scene) so lighting & flags apply
    const meshes = [];
    const originals = [];
    axisFix.traverse((n) => {
      if (n.isMesh) {
        meshes.push(n);
        originals.push(n.material);
        n.frustumCulled = false;
        n.renderOrder = 9999;
      }
    });

    // Store with a pivot wrapper so origins stay at authoring pivots
    const P = { name, object: root, meshes, originals, pivot: new THREE.Object3D() };
    P.pivot.name = `pivot:${name}`;
    P.pivot.add(root);
    this.group.add(P.pivot);
    this.parts.set(name, P);

    // Apply initial lighting/depth settings
    this._applyLightingForObject(P);
    return P;
  };

  // Load all 16 parts
  await Promise.all(Object.entries(PART_FILES).map(([n, f]) => loadOne(n, this.dir + f)));

  // Debug helpers and base measurement now work on XY (Y-up) as intended
  this._syncPivotMarkers();
  this._syncBoxHelpers();
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

      } else { // 'keep'
        const idx = P.meshes.indexOf(mesh);
        if (idx >= 0 && P.originals[idx]) mesh.material = P.originals[idx].clone();
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
      // width = X; height = chosen vertical axis (Y or Z)
      const h = (this.verticalAxis === 'z') ? s.z : s.y;
      return { w: s.x, h, d: s.z };
    };

    // Ensure expanders = 1×
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) {
      const o = this.parts.get(k).object;
      if (this._vIndex === 1) o.scale.set(1,1,1);     // Y
      else                    o.scale.set(1,1,1);     // Z (we still store as 1×; axis matters when we switch off)
    }
    this.group.updateMatrixWorld(true);

    // Full size with expanders 1×
    const full = sizeOf(this.group);
    this._baseOuterW = full.w;
    this._baseOuterH = full.h;

    // Horizontal off → measure width without H contribution
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(0,1,1);
    this.group.updateMatrixWorld(true);
    const noH = sizeOf(this.group);
    this._widthNoHX = noH.w;

    // Restore H, turn off V → measure height without V contribution
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(1,1,1);
    for (const k of V_EXPANDERS) {
      const o = this.parts.get(k).object;
      if (this._vIndex === 1) o.scale.set(1,0,1);  // Y off
      else                    o.scale.set(1,1,0);  // Z off
    }
    this.group.updateMatrixWorld(true);
    const noV = sizeOf(this.group);
    this._heightNoV = noV.h;

    // Restore all to 1×
    for (const k of V_EXPANDERS) {
      const o = this.parts.get(k).object;
      if (this._vIndex === 1) o.scale.set(1,1,1);
      else                    o.scale.set(1,1,1);
    }
    this.group.updateMatrixWorld(true);

    // Per-side units (robust to tiny asset drift)
    const dW = Math.max(0, this._baseOuterW - this._widthNoHX);
    const dH = Math.max(0, this._baseOuterH - this._heightNoV);
    this._unitX = (dW > EPS) ? dW / 2 : 0.1;   // each side contribution
    this._unitV = (dH > EPS) ? dH / 2 : 0.1;

    if (this._debug.verbose) {
      console.info('[FrameOverlay] measured', {
        baseW: this._baseOuterW, baseH: this._baseOuterH,
        widthNoHX: this._widthNoHX, heightNoV: this._heightNoV,
        unitX: this._unitX, unitV: this._unitV, verticalAxis: this.verticalAxis
      });
    }
  }

  // ---------- Per-frame update ----------
  update(camera) {
    if (!this._loaded) return;
    this._lastCamera = camera;

    // 1) Stick to camera (HUD)
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(fwd, this.distance);
    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // 2) Viewport box at this distance (after margins)
    const { wTarget, hTarget } = this._computeViewInfo(camera);

    // 3) Uniform base scale s0:
    //    'height' → mains thickness stays visually constant; expanders absorb width.
    //    'width'  → symmetric inverse.
    //    'min'    → legacy min(width,height) fit.
    let s0;
    if (this.fit === 'width') {
      s0 = wTarget / Math.max(EPS, this._baseOuterW);
    } else if (this.fit === 'min') {
      const sW = wTarget / Math.max(EPS, this._baseOuterW);
      const sH = hTarget / Math.max(EPS, this._baseOuterH);
      s0 = Math.max(EPS, Math.min(sW, sH));
    } else { // 'height' (default)
      s0 = hTarget / Math.max(EPS, this._baseOuterH);
    }
    this.group.scale.set(s0, s0, s0);

    // 4) Solve expander scales on BOTH axes to match target exactly (pre-scale space).
    //    If allowShrinking=false, clamp to >=1. Otherwise permit <1 for narrower windows.
    const clampA = (a) => {
      if (!Number.isFinite(a)) return 1;
      return this.allowShrinking ? Math.max(EPS, a) : Math.max(1, a);
    };

    let aX = 1, aV = 1;
    if (this._unitX > EPS) {
      const preTargetW = wTarget / s0;
      aX = clampA((preTargetW - this._widthNoHX) / (2 * this._unitX));
    }
    if (this._unitV > EPS) {
      const preTargetH = hTarget / s0;
      aV = clampA((preTargetH - this._heightNoV) / (2 * this._unitV));
    }

    // 5) Apply to expanders; keep mains fixed unless explicitly allowed
    // Horizontal expanders scale along X
    for (const k of H_EXPANDERS) this.parts.get(k).object.scale.set(aX, 1, 1);

    // Vertical expanders scale along selected vertical axis (Y or Z)
    for (const k of V_EXPANDERS) {
      const o = this.parts.get(k).object;
      if (this._vIndex === 1) o.scale.set(1, aV, 1);
      else                    o.scale.set(1, 1, aV);
    }

    if (this.fillMode === 'mainsFill') {
      // Optional: stretch mains along their *length* axis if needed
      if (aX > 1) {
        this.parts.get('main-top')?.object.scale.set(aX, 1, 1);
        this.parts.get('main-bottom')?.object.scale.set(aX, 1, 1);
      } else {
        this.parts.get('main-top')?.object.scale.set(1, 1, 1);
        this.parts.get('main-bottom')?.object.scale.set(1, 1, 1);
      }
      if (aV > 1) {
        if (this._vIndex === 1) {
          this.parts.get('main-left')?.object.scale.set(1, aV, 1);
          this.parts.get('main-right')?.object.scale.set(1, aV, 1);
        } else {
          this.parts.get('main-left')?.object.scale.set(1, 1, aV);
          this.parts.get('main-right')?.object.scale.set(1, 1, aV);
        }
      } else {
        this.parts.get('main-left')?.object.scale.set(1, 1, 1);
        this.parts.get('main-right')?.object.scale.set(1, 1, 1);
      }
    } else {
      for (const k of MAINS) this.parts.get(k).object.scale.set(1, 1, 1);
    }

    // 6) Debug helpers refresh
    for (const h of this._boxHelpers) h.update();

    // 7) Keep a summary for dump()
    const expectedW = s0 * this._baseOuterW;
    const expectedH = s0 * this._baseOuterH;
    this._lastCalc = { s0, aX, aV, expectedW, expectedH, wTarget, hTarget };
  }

  _computeViewInfo(camera) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    const wTarget = viewW * (1 - 2 * this.marginH);
    const hTarget = viewH * (1 - 2 * this.marginV);
    return { viewW, viewH, wTarget, hTarget };
  }

  // ---------- Debug helpers ----------
  _syncPivotMarkers() {
    for (const m of this._pivotMarkers) m.parent?.remove(m);
    this._pivotMarkers.length = 0;
    if (!this._debug.pivots) return;

    const mk = () => {
      const g = new THREE.RingGeometry(0.012, 0.02, 24);
      const m = new THREE.MeshBasicMaterial({ color: 0xff66cc, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 10000;
      mesh.rotation.x = Math.PI / 2; // purely visual; ok for both Y/Z since we billboard
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
