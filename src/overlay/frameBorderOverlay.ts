import { THREE } from "@/core/three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type LightingMode = "unlit" | "normals" | "material";
type ScalingMode = "stretch" | "fit";

type FurOptions = {
  enabled?: boolean;
  density?: number;   // hairs per surface area unit
  length?: number;    // base hair length (auto if undefined)
  radius?: number;    // root radius (thickness)
  color?: number | string;
  tipColor?: number | string;
  randomness?: number; // small tilt/bend when planting (radians)
  onTop?: boolean;
  seed?: number;

  // NEW: gravity-ish bending
  sag?: number;        // tip offset as fraction of length (0..~0.8). Default ~0.45*length
  lateral?: number;    // 0..1 lateral component mixed into down bend (default 0.35)
};

export class FrameBorderOverlay {
  private url: string;
  private marginH: number;
  private marginV: number;
  private distance: number;
  private renderOnTop: boolean;
  private scalingMode: ScalingMode;
  private lighting: LightingMode;
  private _mixStrength: number;

  public group = new THREE.Group();
  public model: THREE.Object3D | null = null;
  public pivot: THREE.Object3D | null = null;
  private _baseWidth = 1;
  private _baseHeight = 1;
  private _loaded = false;

  // Fur
  private furOpts: FurOptions;
  private furMeshes: THREE.InstancedMesh[] = [];
  private hairGeo: THREE.CylinderGeometry | null = null;
  private hairMat: THREE.MeshStandardMaterial | null = null;
  private _rng!: () => number;

  constructor({
    url,
    margin = 0.06,
    marginH,
    marginV,
    distance = 2.0,
    renderOnTop = true,
    scalingMode = "stretch",
    lighting = "normals",
    mixStrength = 0.5,
    fur = {}
  }: {
    url: string;
    margin?: number;
    marginH?: number;
    marginV?: number;
    distance?: number;
    renderOnTop?: boolean;
    scalingMode?: ScalingMode;
    lighting?: LightingMode;
    mixStrength?: number;
    fur?: FurOptions;
  }) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5;
    this.marginV = marginV ?? margin;
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.scalingMode = scalingMode;
    this.lighting = lighting;
    this._mixStrength = THREE.MathUtils.clamp(mixStrength, 0, 1);

    // Defaults for LONG, THICK, PINK, with sag
    this.furOpts = {
      enabled: fur.enabled ?? false,
      density: fur.density ?? 140,
      length: fur.length,
      radius: fur.radius ?? 0.006,
      color: fur.color ?? 0xff4da6,
      tipColor: fur.tipColor,
      randomness: fur.randomness ?? 0.20,
      onTop: fur.onTop ?? true,
      seed: fur.seed ?? 1337,
      sag: fur.sag,                 // if undefined -> auto from length
      lateral: fur.lateral ?? 0.35, // add a bit of sideways curve
    };

    // RNG after furOpts exists
    {
      let s = (this.furOpts.seed ?? 1337) >>> 0;
      this._rng = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 0xffffffff; };
    }

    this.group.name = "FrameBorderOverlay";
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(this.url);
    this.model = gltf.scene || gltf.scenes?.[0] || null;
    if (!this.model) throw new Error("overlay glb had no scene");

    this.model.traverse((obj: any) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.renderOrder = 9999;

      if (this.lighting === "unlit") {
        const src = obj.material;
        const mat = new THREE.MeshBasicMaterial({
          color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
          map: src?.map ?? null,
          transparent: true,
          opacity: typeof src?.opacity === "number" ? src.opacity : 1,
          side: src?.side ?? THREE.FrontSide,
          alphaTest: src?.alphaTest ?? 0,
          depthTest: !this.renderOnTop,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true),
          fog: false,
          toneMapped: false,
          vertexColors: !!src?.vertexColors
        });
        if (mat.map && "colorSpace" in mat.map) (mat.map as any).colorSpace = THREE.SRGBColorSpace;
        obj.material = mat;
      } else if (this.lighting === "normals") {
        const src = obj.material;
        const map = src?.map ?? null;
        if (map && "colorSpace" in map) (map as any).colorSpace = THREE.SRGBColorSpace;

        obj.material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: map },
            useMap: { value: !!map },
            mixStrength: { value: this._mixStrength },
            opacity: { value: 1.0 }
          },
          vertexShader: `
            varying vec3 vNormal; varying vec2 vUv;
            void main(){
              vNormal = normalize(normalMatrix * normal);
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D map; uniform bool useMap; uniform float mixStrength; uniform float opacity;
            varying vec3 vNormal; varying vec2 vUv;
            void main(){
              vec3 n = normalize(vNormal) * 0.5 + 0.5;
              vec3 tex = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
              gl_FragColor = vec4(mix(tex, n, mixStrength), opacity);
            }
          `,
          transparent: true,
          depthTest: !this.renderOnTop,
          depthWrite: this.renderOnTop ? false : true
        });
      } else {
        if (this.renderOnTop && obj.material) {
          obj.material = obj.material.clone();
          obj.material.depthTest = false;
          obj.material.depthWrite = false;
          obj.material.fog = false;
          if ("toneMapped" in obj.material) obj.material.toneMapped = false;
          obj.material.transparent = true;
          obj.material.opacity = 1.0;
        }
      }
    });

    // center + measure
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = bbox.getCenter(new THREE.Vector3());
    this.pivot = new THREE.Object3D();
    this.pivot.add(this.model);
    this.model.position.sub(new THREE.Vector3(center.x, center.y, 0));

    this.pivot.updateMatrixWorld(true);
    const nativeBox = new THREE.Box3().setFromObject(this.pivot);
    const nativeSize = new THREE.Vector3();
    nativeBox.getSize(nativeSize);
    this._baseWidth  = Math.max(nativeSize.x, 1e-6);
    this._baseHeight = Math.max(nativeSize.y, 1e-6);

    this.group.add(this.pivot);
    this._loaded = true;

    if (this.furOpts.enabled) this._buildFur();
  }

  setOpacity(alpha: number) {
    this.group.traverse((o: any) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((mm) => ((mm.transparent = true), (mm.opacity = alpha)));
      else {
        m.transparent = true;
        m.opacity = alpha;
      }
      if (m.uniforms && "opacity" in m.uniforms) m.uniforms.opacity.value = alpha;
    });
    if (this.hairMat) { this.hairMat.transparent = true; this.hairMat.opacity = alpha; }
  }

  async fadeIn(ms = 350) {
    const steps = Math.max(1, Math.floor(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; this.setOpacity(t);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }

  setMixStrength(v: number) {
    this._mixStrength = THREE.MathUtils.clamp(v, 0, 1);
    if (!this._loaded || this.lighting !== "normals") return;
    this.group.traverse((o: any) => {
      const u = o.material?.uniforms;
      if (u && "mixStrength" in u) u.mixStrength.value = this._mixStrength;
    });
  }

  update(camera: THREE.PerspectiveCamera) {
    if (!this._loaded || !this.pivot || !this.model) return;

    const dir = camera.getWorldDirection(new THREE.Vector3());
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.addScaledVector(dir, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;

    const wTarget = viewW * (1 - 2 * this.marginH);
    const hTarget = viewH * (1 - 2 * this.marginV);

    if (this.scalingMode === "stretch") {
      const sx = wTarget / this._baseWidth;
      const sy = hTarget / this._baseHeight;
      const sz = Math.min(sx, sy);
      this.group.scale.set(sx, sy, sz);
    } else {
      const s = Math.min(wTarget / this._baseWidth, hTarget / this._baseHeight);
      this.group.scale.set(s, s, s);
    }
  }

  addTo(scene: THREE.Scene) { scene.add(this.group); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group); }

  // ---------- Fur helpers ----------
  private _autoLength(): number {
    const m = Math.min(this._baseWidth, this._baseHeight);
    return 0.12 * m;
  }

  private _ensureHairResources() {
    if (this.hairGeo && this.hairMat) return;

    // More segments so the bend looks smooth
    const g = new THREE.CylinderGeometry(0, 1, 1, 10, 8, false);
    g.translate(0, 0.5, 0); // base at y=0.. tip at y=1

    // vertex colors (pink → lighter tips)
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(this.furOpts.color as any ?? 0xff4da6);
    const tip  = new THREE.Color(
      this.furOpts.tipColor as any ?? new THREE.Color(base).lerp(new THREE.Color(0xffffff), 0.35)
    );
    for (let i = 0; i < pos.count; i++) {
      const y = THREE.MathUtils.clamp(pos.getY(i), 0, 1);
      const c = new THREE.Color().copy(base).lerp(tip, y);
      colors[i*3+0] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.hairGeo = g;

    // PBR material with a tiny vertex shader hook to bend
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.0,
      roughness: 0.6,
      transparent: this.renderOnTop || (this.furOpts.onTop ?? true),
      opacity: 1.0
    });
    mat.depthTest  = !(this.furOpts.onTop ?? true);
    mat.depthWrite = (this.furOpts.onTop ?? true) ? false : true;

    // Inject per-instance bend
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute vec3 iBendDir;
        attribute float iBendK;
      ` + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
          #include <begin_vertex>
          // y in [0..1] along strand
          float y01 = position.y;
          // quadratic sag; stronger near tip
          float curve = iBendK * (y01 * y01);
          transformed.xyz += iBendDir * curve;
        `
      );
    };

    this.hairMat = mat;
  }

  private _geometryArea(geom: THREE.BufferGeometry): number {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    const p = g.attributes.position.array as ArrayLike<number>;
    let area = 0;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i],     ay = p[i+1],  az = p[i+2];
      const bx = p[i+3],   by = p[i+4],  bz = p[i+5];
      const cx = p[i+6],   cy = p[i+7],  cz = p[i+8];
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const cxp = (aby * acz - abz * acy);
      const cyp = (abz * acx - abx * acz);
      const czp = (abx * acy - aby * acx);
      const triArea = 0.5 * Math.sqrt(cxp*cxp + cyp*cyp + czp*czp);
      area += triArea;
    }
    g.dispose();
    return area;
  }

  private _sampleOn(geom: THREE.BufferGeometry) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    const pos = g.attributes.position.array as Float32Array;
    const hasNormals = !!g.attributes.normal;
    const nor = hasNormals ? (g.attributes.normal.array as Float32Array) : null;

    const tris = Math.floor(pos.length / 9);
    const cum: number[] = new Array(tris);
    let total = 0;
    for (let t = 0; t < tris; t++) {
      const i = t * 9;
      const ax = pos[i],     ay = pos[i+1],  az = pos[i+2];
      const bx = pos[i+3],   by = pos[i+4],  bz = pos[i+5];
      const cx = pos[i+6],   cy = pos[i+7],  cz = pos[i+8];
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const cxp = (aby * acz - abz * acy);
      const cyp = (abz * acx - abx * acz);
      const czp = (abx * acy - aby * acx);
      const triArea = 0.5 * Math.sqrt(cxp*cxp + cyp*cyp + czp*czp);
      total += triArea;
      cum[t] = total;
    }

    const pickTri = (r: number) => {
      let lo = 0, hi = tris - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (r <= cum[mid]) hi = mid; else lo = mid + 1;
      }
      return lo;
    };

    const sample = (outP: THREE.Vector3, outN: THREE.Vector3) => {
      const r = this._rng() * total;
      const t = pickTri(r);
      const i = t * 9;

      const a = new THREE.Vector3(pos[i], pos[i+1], pos[i+2]);
      const b = new THREE.Vector3(pos[i+3], pos[i+4], pos[i+5]);
      const c = new THREE.Vector3(pos[i+6], pos[i+7], pos[i+8]);

      // uniform barycentric
      const r1 = Math.sqrt(this._rng());
      const r2 = this._rng();
      const u = 1.0 - r1;
      const v = r1 * (1.0 - r2);
      const w = r1 * r2;

      outP.set(
        a.x * u + b.x * v + c.x * w,
        a.y * u + b.y * v + c.y * w,
        a.z * u + b.z * v + c.z * w
      );

      if (hasNormals && nor) {
        const na = new THREE.Vector3(nor[i], nor[i+1], nor[i+2]);
        const nb = new THREE.Vector3(nor[i+3], nor[i+4], nor[i+5]);
        const nc = new THREE.Vector3(nor[i+6], nor[i+7], nor[i+8]);
        outN.set(
          na.x * u + nb.x * v + nc.x * w,
          na.y * u + nb.y * v + nc.y * w,
          na.z * u + nb.z * v + nc.z * w
        ).normalize();
      } else {
        outN.copy(new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          )
        ).normalize();
      }
    };

    return { sample, totalArea: total, dispose: () => g.dispose() };
  }

  private _buildFur() {
    this._ensureHairResources();
    if (!this.model || !this.hairGeo || !this.hairMat) return;

    const baseLen = (this.furOpts.length ?? this._autoLength());
    const radius  = this.furOpts.radius ?? 0.006;
    const density = Math.max(0, this.furOpts.density ?? 140);
    const sagFrac = THREE.MathUtils.clamp(this.furOpts.sag ?? 0.45, 0.0, 0.9);
    const lateral = THREE.MathUtils.clamp(this.furOpts.lateral ?? 0.35, 0.0, 1.0);

    const meshes: THREE.Mesh[] = [];
    this.model.traverse((o: any) => { if (o.isMesh && o.geometry) meshes.push(o); });

    const areas: number[] = [];
    for (const m of meshes) areas.push(this._geometryArea(m.geometry));

    const UP = new THREE.Vector3(0, 1, 0);
    const tmpP = new THREE.Vector3();
    const tmpN = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const qAlign = new THREE.Quaternion();
    const qTilt  = new THREE.Quaternion();
    const qRoll  = new THREE.Quaternion();
    const mat4   = new THREE.Matrix4();

    meshes.forEach((mesh, idx) => {
      const A = Math.max(areas[idx], 0);
      const count = Math.round(A * density);
      if (count <= 0) return;

      const sampler = this._sampleOn(mesh.geometry);

      // CLONE geometry per InstancedMesh to attach unique attributes
      const gInst = this.hairGeo!.clone();
      const inst = new THREE.InstancedMesh(gInst, this.hairMat!, count);
      inst.frustumCulled = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.renderOrder = 10001;

      // per-instance bend attributes
      const bendDir = new Float32Array(count * 3);
      const bendK   = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        sampler.sample(tmpP, tmpN);

        // slight lift off the surface
        const baseOffset = 0.0015;
        tmpP.addScaledVector(tmpN, baseOffset);

        // align + random roll + slight tilt
        qAlign.setFromUnitVectors(UP, tmpN);
        qRoll.setFromAxisAngle(tmpN, this._rng() * Math.PI * 2);

        axis.set(1, 0, 0).cross(tmpN);
        if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0).cross(tmpN);
        axis.normalize();
        const tiltAmt = (this.furOpts.randomness ?? 0.2) * (this._rng() * 2 - 1);
        qTilt.setFromAxisAngle(axis, tiltAmt);

        const q = new THREE.Quaternion().copy(qAlign).multiply(qRoll).multiply(qTilt);

        // size variation
        const len = baseLen * (0.85 + 0.30 * this._rng());
        const rad = radius * (0.90 + 0.25 * this._rng());

        const s = new THREE.Vector3(rad, len, rad);
        mat4.compose(tmpP, q, s);
        inst.setMatrixAt(i, mat4);

        // --- Bend direction (screen-down + a bit of lateral) in *object* space ---
        // Start with "down" in the overlay/local object space: (0,-1,0)
        // Convert to this instance's object space by inverse of its rotation q
        const downLocal = new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert());

        // add some lateral variation so it looks natural (spiral azimuth)
        const az = this._rng() * Math.PI * 2;
        const lateralVec = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(lateral);

        const dir = downLocal.add(lateralVec).normalize();
        bendDir[i*3+0] = dir.x; bendDir[i*3+1] = dir.y; bendDir[i*3+2] = dir.z;

        // tip offset ≈ sagFrac * length (scaled slightly variational)
        bendK[i] = sagFrac * len * (0.9 + 0.2 * this._rng());
      }

      (inst.geometry as THREE.BufferGeometry).setAttribute(
        "iBendDir", new THREE.InstancedBufferAttribute(bendDir, 3)
      );
      (inst.geometry as THREE.BufferGeometry).setAttribute(
        "iBendK",   new THREE.InstancedBufferAttribute(bendK, 1)
      );

      inst.instanceMatrix.needsUpdate = true;

      mesh.add(inst);
      this.furMeshes.push(inst);
      sampler.dispose();
    });
  }
}
