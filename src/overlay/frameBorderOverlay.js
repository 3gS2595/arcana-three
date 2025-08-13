import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Camera-space, pivot-based frame overlay (no margins).
 * - Parent ONLY to the camera; never to the scene.
 * - Lays out parts in camera space to hug the viewport edges.
 * - Distance is clamped against near plane so it never “vanishes”.
 * - fillMode: 'mainsFill' (default) scales main-top/bottom/left/right to match view;
 *             'expandersFill' keeps mains at native size and stretches expanders.
 * - debugDump(camera) logs camera + per-part transforms.
 */
export class FrameBorderOverlay {
  /**
   * @param {Object} opts
   * @param {number}  [opts.distance=0.7]
   * @param {boolean} [opts.renderOnTop=true]
   * @param {'unlit'|'keep'|'normals'} [opts.lighting='unlit']
   * @param {number}  [opts.mixStrength=0.5]
   * @param {string}  [opts.partsDir='/assets/glb']
   * @param {Record<string,string>} [opts.files]
   * @param {boolean} [opts.debugPivots=false]
   * @param {number}  [opts.pivotRadius=0.035]
   * @param {string|number} [opts.pivotColor=0xff00aa]
   * @param {'mainsFill'|'expandersFill'} [opts.fillMode='mainsFill']
   */
  constructor({
    distance = 0.7,
    renderOnTop = true,
    lighting = 'unlit',
    mixStrength = 0.5,
    partsDir = '/assets/glb',
    files,
    debugPivots = false,
    pivotRadius = 0.035,
    pivotColor = 0xff00aa,
    fillMode = 'mainsFill'
  } = {}) {
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.lighting = lighting;
    this.mixStrength = THREE.MathUtils.clamp(mixStrength, 0, 1);
    this.fillMode = fillMode;

    this.partsDir = partsDir.replace(/\/+$/, '');
    this.files = files ?? {
      // corners
      'corner-top-left':     'corner-top-left.glb',
      'corner-top-right':    'corner-top-right.glb',
      'corner-bottom-left':  'corner-bottom-left.glb',
      'corner-bottom-right': 'corner-bottom-right.glb',
      // mains
      'main-top':    'main-top.glb',
      'main-bottom': 'main-bottom.glb',
      'main-left':   'main-left.glb',
      'main-right':  'main-right.glb',
      // expanders (horizontal)
      'top-left-expander':     'top-left-expander.glb',
      'top-right-expander':    'top-right-expander.glb',
      'bottom-left-expander':  'bottom-left-expander.glb',
      'bottom-right-expander': 'bottom-right-expander.glb',
      // expanders (vertical)
      'left-top-expander':   'left-top-expander.glb',
      'left-bottom-expander':'left-bottom-expander.glb',
      'right-top-expander':  'right-top-expander.glb',
      'right-bottom-expander':'right-bottom-expander.glb'
    };

    // convenience buckets
    this.cornerKeys = ['corner-top-left','corner-top-right','corner-bottom-left','corner-bottom-right'];
    this.mainKeys   = ['main-top','main-bottom','main-left','main-right'];
    this.hExpKeys   = ['top-left-expander','top-right-expander','bottom-left-expander','bottom-right-expander'];
    this.vExpKeys   = ['left-top-expander','left-bottom-expander','right-top-expander','right-bottom-expander'];

    // camera-space root (parented to camera on first update)
    this.frameRoot = new THREE.Group();
    this.frameRoot.name = 'FrameBorderOverlayRoot';
    this.frameRoot.position.set(0, 0, -this.distance);

    this.layout = new THREE.Group();
    this.frameRoot.add(this.layout);

    this.parts = {}; // name -> THREE.Object3D
    this.sizes = {}; // name -> { w, h }
    this._camera = null;
    this._loaded = false;
    this._lastAspect = null;
    this._lastFov = null;

    // debug pivots
    this.debugPivots = debugPivots;
    this.pivotRadius = pivotRadius;
    this.pivotColor = pivotColor;
    this._pivotMat = null;
  }

  addTo(_scene) { /* no-op (must live under camera) */ }
  removeFrom(scene) {
    if (this._camera && this.frameRoot.parent === this._camera) {
      this._camera.remove(this.frameRoot);
    }
  }

  async load() {
    const loader = new GLTFLoader();

    const loadPart = async (key, file) => {
      const url = `${this.partsDir}/${file}`;
      const gltf = await loader.loadAsync(url);
      const container = new THREE.Group();

      gltf.scene.traverse(node => {
        if (node.isMesh) {
          node.frustumCulled = false;
          this._applyLightingToMesh(node);
        }
      });

      container.add(gltf.scene);
      container.position.set(0, 0, 0);
      container.rotation.set(0, 0, 0);
      container.scale.set(1, 1, 1);

      this.layout.add(container);

      // measure base size at load
      const box = new THREE.Box3().setFromObject(container);
      const size = new THREE.Vector3(); box.getSize(size);
      this.parts[key] = container;
      this.sizes[key] = { w: Math.max(1e-6, size.x), h: Math.max(1e-6, size.y) };

      if (this.debugPivots) {
        container.add(this._makePivotCircle(this.pivotRadius, this.pivotColor));
      }
    };

    await Promise.all(Object.entries(this.files).map(([k, f]) => loadPart(k, f)));
    this._loaded = true;
  }

  _applyLightingToMesh(mesh) {
    if (!mesh.material) return;

    // Render on top
    mesh.renderOrder = 9999;
    if (this.renderOnTop) {
      mesh.material = mesh.material.clone();
      mesh.material.depthTest = false;
      mesh.material.depthWrite = false;
      mesh.material.fog = false;
      if ('toneMapped' in mesh.material) mesh.material.toneMapped = false;
    }

    if (this.lighting === 'unlit') {
      const src = mesh.material;
      const mat = new THREE.MeshBasicMaterial({
        color: (src?.color) ? src.color.clone() : new THREE.Color(0xffffff),
        map: src?.map ?? null,
        transparent: !!src?.transparent || !!src?.alphaMap,
        opacity: (typeof src?.opacity === 'number') ? src.opacity : 1,
        side: src?.side ?? THREE.FrontSide,
        alphaTest: src?.alphaTest ?? 0,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        vertexColors: !!src?.vertexColors
      });
      if (mat.map && 'colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mesh.material = mat;

    } else if (this.lighting === 'normals') {
      const src = mesh.material;
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
        void main(){
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `;
      const frag = `
        uniform sampler2D map;
        uniform bool useMap;
        uniform float mixStrength;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main(){
          vec3 n = normalize(vNormal) * 0.5 + 0.5;
          vec3 tex = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
          vec3 col = mix(tex, n, mixStrength);
          gl_FragColor = vec4(col, 1.0);
        }
      `;
      const mat = new THREE.ShaderMaterial({
        uniforms, vertexShader: vert, fragmentShader: frag,
        transparent: !!src?.transparent || !!src?.alphaMap,
        depthTest: false,
        depthWrite: false,
        fog: false
      });
      mesh.material = mat;

    } else {
      // 'keep' — already configured for on-top rendering
    }
  }

  _makePivotCircle(radius, color) {
    const segments = 48;
    const geom = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push(Math.cos(t) * radius, Math.sin(t) * radius, 0);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geom.setDrawRange(0, segments);
    const mat = this._getPivotMaterial();
    const loop = new THREE.LineLoop(geom, mat);
    loop.renderOrder = 10000;
    loop.frustumCulled = false;
    return loop;
  }

  _getPivotMaterial() {
    if (this._pivotMat) return this._pivotMat;
    this._pivotMat = new THREE.LineBasicMaterial({
      color: this.pivotColor,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    return this._pivotMat;
  }

  // ---- Layout (camera-space) ----
  _layoutToViewport(camera) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    const hw = viewW * 0.5;
    const hh = viewH * 0.5;

    const P = this.parts, S = this.sizes;

    // corners to exact inner corners
    if (P['corner-top-left'])     P['corner-top-left'].position.set(-hw, +hh, 0);
    if (P['corner-top-right'])    P['corner-top-right'].position.set(+hw, +hh, 0);
    if (P['corner-bottom-left'])  P['corner-bottom-left'].position.set(-hw, -hh, 0);
    if (P['corner-bottom-right']) P['corner-bottom-right'].position.set(+hw, -hh, 0);

    // mains centered on each side
    if (P['main-top'])    P['main-top'   ].position.set(0,  +hh, 0);
    if (P['main-bottom']) P['main-bottom'].position.set(0,  -hh, 0);
    if (P['main-left'])   P['main-left'  ].position.set(-hw, 0,   0);
    if (P['main-right'])  P['main-right' ].position.set(+hw, 0,   0);

    if (this.fillMode === 'mainsFill') {
      // scale mains to match the viewport span exactly
      if (P['main-top'] && S['main-top']) {
        const s = P['main-top'].scale.clone();
        s.x = viewW / S['main-top'].w;   // stretch along X
        P['main-top'].scale.copy(s);
      }
      if (P['main-bottom'] && S['main-bottom']) {
        const s = P['main-bottom'].scale.clone();
        s.x = viewW / S['main-bottom'].w;
        P['main-bottom'].scale.copy(s);
      }
      if (P['main-left'] && S['main-left']) {
        const s = P['main-left'].scale.clone();
        s.y = viewH / S['main-left'].h;  // stretch along Y
        P['main-left'].scale.copy(s);
      }
      if (P['main-right'] && S['main-right']) {
        const s = P['main-right'].scale.clone();
        s.y = viewH / S['main-right'].h;
        P['main-right'].scale.copy(s);
      }

      // expanders become zero-length (not used in this mode)
      for (const k of [...this.hExpKeys, ...this.vExpKeys]) {
        if (!P[k]) continue;
        P[k].scale.set(0, 0, 1);
        // also put them at corners to avoid floating in the middle
        if (k.includes('top'))       P[k].position.y = +hh;
        if (k.includes('bottom'))    P[k].position.y = -hh;
        if (k.includes('left'))      P[k].position.x = -hw;
        if (k.includes('right'))     P[k].position.x = +hw;
      }
    } else {
      // expandersFill (previous behavior): mains stay native; expanders fill remaining span

      const mainTopW    = S['main-top']    ? S['main-top'].w    : 0;
      const mainBottomW = S['main-bottom'] ? S['main-bottom'].w : 0;
      const mainLeftH   = S['main-left']   ? S['main-left'].h   : 0;
      const mainRightH  = S['main-right']  ? S['main-right'].h  : 0;

      const halfTopTarget    = Math.max(0, (viewW - mainTopW)    * 0.5);
      const halfBottomTarget = Math.max(0, (viewW - mainBottomW) * 0.5);

      if (P['top-left-expander']) {
        const exp = P['top-left-expander'];
        exp.position.set(-hw, +hh, 0);
        const baseW = S['top-left-expander'] ? S['top-left-expander'].w : 1;
        exp.scale.x = baseW > 0 ? halfTopTarget / baseW : 1;
      }
      if (P['top-right-expander']) {
        const exp = P['top-right-expander'];
        exp.position.set(+hw, +hh, 0);
        const baseW = S['top-right-expander'] ? S['top-right-expander'].w : 1;
        exp.scale.x = baseW > 0 ? halfTopTarget / baseW : 1;
      }
      if (P['bottom-left-expander']) {
        const exp = P['bottom-left-expander'];
        exp.position.set(-hw, -hh, 0);
        const baseW = S['bottom-left-expander'] ? S['bottom-left-expander'].w : 1;
        exp.scale.x = baseW > 0 ? halfBottomTarget / baseW : 1;
      }
      if (P['bottom-right-expander']) {
        const exp = P['bottom-right-expander'];
        exp.position.set(+hw, -hh, 0);
        const baseW = S['bottom-right-expander'] ? S['bottom-right-expander'].w : 1;
        exp.scale.x = baseW > 0 ? halfBottomTarget / baseW : 1;
      }

      const halfLeftTarget  = Math.max(0, (viewH - mainLeftH)  * 0.5);
      const halfRightTarget = Math.max(0, (viewH - mainRightH) * 0.5);

      if (P['left-top-expander']) {
        const exp = P['left-top-expander'];
        exp.position.set(-hw, +hh, 0);
        const baseH = S['left-top-expander'] ? S['left-top-expander'].h : 1;
        exp.scale.y = baseH > 0 ? halfLeftTarget / baseH : 1;
      }
      if (P['left-bottom-expander']) {
        const exp = P['left-bottom-expander'];
        exp.position.set(-hw, -hh, 0);
        const baseH = S['left-bottom-expander'] ? S['left-bottom-expander'].h : 1;
        exp.scale.y = baseH > 0 ? halfLeftTarget / baseH : 1;
      }
      if (P['right-top-expander']) {
        const exp = P['right-top-expander'];
        exp.position.set(+hw, +hh, 0);
        const baseH = S['right-top-expander'] ? S['right-top-expander'].h : 1;
        exp.scale.y = baseH > 0 ? halfRightTarget / baseH : 1;
      }
      if (P['right-bottom-expander']) {
        const exp = P['right-bottom-expander'];
        exp.position.set(+hw, -hh, 0);
        const baseH = S['right-bottom-expander'] ? S['right-bottom-expander'].h : 1;
        exp.scale.y = baseH > 0 ? halfRightTarget / baseH : 1;
      }
    }

    // always render last
    this.layout.traverse(n => { if (n.isMesh) n.renderOrder = 9999; });
  }

  // Clamp & set distance safely (needs camera to know near plane)
  setDistance(d, camera) {
    if (!camera) { this.distance = Math.max(0.001, d); return; }
    const near = (camera.near ?? 0.1);
    const eps = near * 1.2;
    this.distance = Math.max(d, eps);
    if (this.frameRoot) this.frameRoot.position.set(0, 0, -this.distance);
    this._layoutToViewport(camera);
  }

  debugDump(camera) {
    if (!this._loaded) { console.warn('[FrameOverlay] not loaded'); return; }
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    const hw = viewW * 0.5, hh = viewH * 0.5;

    console.group('[FrameOverlay] Debug Dump');
    console.log('camera.pos', camera.position.toArray());
    console.log('camera.quat', camera.quaternion.toArray());
    console.log('camera.fov/aspect/near/far', camera.fov, camera.aspect, camera.near, camera.far);
    console.log('hud distance', this.distance);
    console.log('view rect @ distance', { width: viewW, height: viewH, halfW: hw, halfH: hh });

    Object.keys(this.parts).forEach(k => {
      const obj = this.parts[k];
      obj.updateMatrixWorld(true);

      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);

      const camSpacePos = worldPos.clone()
        .applyMatrix4(new THREE.Matrix4().copy(this.frameRoot.matrixWorld).invert());

      console.log(k, {
        camSpacePos: camSpacePos.toArray(),
        worldPos: worldPos.toArray(),
        scale: obj.scale.toArray(),
        baseSize: this.sizes[k]
      });
    });
    console.groupEnd();
  }

  setMixStrength(v) {
    this.mixStrength = THREE.MathUtils.clamp(v, 0, 1);
    if (!this._loaded || this.lighting !== 'normals') return;
    this.layout.traverse(o => {
      if (o.isMesh && o.material && o.material.uniforms && 'mixStrength' in o.material.uniforms) {
        o.material.uniforms.mixStrength.value = this.mixStrength;
      }
    });
  }

  update(camera) {
    if (!this._loaded) return;

    // first call: parent to camera and clamp distance
    if (!this._camera) {
      this._camera = camera;
      camera.add(this.frameRoot);
      this.setDistance(this.distance, camera);
      this._lastAspect = camera.aspect;
      this._lastFov = camera.fov;
      return;
    }

    // keep aligned; layout on fov/aspect change
    this.frameRoot.quaternion.copy(camera.quaternion);
    if (camera.aspect !== this._lastAspect || camera.fov !== this._lastFov) {
      this._layoutToViewport(camera);
      this._lastAspect = camera.aspect;
      this._lastFov = camera.fov;
    }
  }
}
