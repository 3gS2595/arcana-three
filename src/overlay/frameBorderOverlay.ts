import { THREE } from "@/core/three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import SimplexNoise from "simplex-noise";

type LightingMode = "unlit" | "normals" | "material";
type ScalingMode = "stretch" | "fit";

type FurLineOptions = {
  enabled?: boolean;
  /** hairs per unit surface area of the overlay mesh */
  density?: number;
  /** base hair length in overlay-model units (auto if undefined) */
  length?: number;
  /** line color */
  color?: number | string;
  /** tip sway intensity (absolute world units, defaults to ~0.5 * length) */
  intensity?: number;
  /** noise speed (bigger = faster movement) */
  speed?: number;
  /** deterministic noise seed */
  seed?: number | string;
  /** render on top of everything */
  onTop?: boolean;
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

  // --- Fur (line) data ---
  private fur: {
    enabled: boolean;
    density: number;
    length?: number;
    color: THREE.ColorRepresentation;
    intensity?: number;
    speed: number;
    seed: string | number;
    onTop: boolean;

    line?: THREE.LineSegments;
    positions?: Float32Array; // dynamic buffer: 2*N*3
    roots: THREE.Vector3[];   // base/root positions
    dirs: THREE.Vector3[];    // growth axis (sampled normals)
    u: THREE.Vector3[];       // ortho basis around dir
    v: THREE.Vector3[];
    len: number[];            // per-hair length
    simplex?: SimplexNoise;
  };

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
    // NEW: furLines replaces previous tube-fur
    furLines = {}
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
    furLines?: FurLineOptions;
  }) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5;
    this.marginV = marginV ?? margin;
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.scalingMode = scalingMode;
    this.lighting = lighting;
    this._mixStrength = THREE.MathUtils.clamp(mixStrength, 0, 1);

    // defaults align with your demo vibe
    this.fur = {
      enabled: furLines.enabled ?? false,
      density: Math.max(0, furLines.density ?? 140),
      length: furLines.length,                 // if undefined -> auto after load
      color: furLines.color ?? 0xff4da6,       // 💖
      intensity: furLines.intensity,           // if undefined -> 0.5 * length
      speed: Math.max(0, furLines.speed ?? 0.5),
      seed: furLines.seed ?? 1337,
      onTop: furLines.onTop ?? true,
      roots: [],
      dirs: [],
      u: [],
      v: [],
      len: []
    };

    this.group.name = "FrameBorderOverlay";
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(this.url);
    this.model = gltf.scene || gltf.scenes?.[0] || null;
    if (!this.model) throw new Error("overlay glb had no scene");

    // --- base materials for overlay (kept from your existing impl) ---
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

    // Build your fur (line segments) if enabled
    if (this.fur.enabled) await this._buildFurLines();
  }

  setOpacity(alpha: number) {
    this.group.traverse((o: any) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((mm) => ((mm.transparent = true), (mm.opacity = alpha)));
      else { m.transparent = true; m.opacity = alpha; }
      if (m.uniforms && "opacity" in m.uniforms) m.uniforms.opacity.value = alpha;
    });
    if (this.fur.line) {
      const lm = this.fur.line.material as THREE.LineBasicMaterial;
      lm.transparent = true; lm.opacity = alpha;
    }
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

    // position the overlay
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

    // animate fur tips (same idea as your demo)
    if (this.fur.enabled && this.fur.line && this.fur.positions && this.fur.simplex) {
      const time = performance.now() * 0.001 * (this.fur.speed ?? 0.5);

      const pos = this.fur.positions;
      const N = this.fur.roots.length;
      for (let i = 0; i < N; i++) {
        const root = this.fur.roots[i];
        const axis = this.fur.dirs[i];
        const u = this.fur.u[i];
        const v = this.fur.v[i];
        const L = this.fur.len[i];

        // angle from 4D simplex noise
        const angle = this.fur.simplex.noise4D(root.x, root.y, root.z, time);

        const amp = (this.fur.intensity ?? (0.5 * L));
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        const offX = u.x * cosA * amp + v.x * sinA * amp;
        const offY = u.y * cosA * amp + v.y * sinA * amp;
        const offZ = u.z * cosA * amp + v.z * sinA * amp;

        // tip = root + axis * L + offset
        const tipX = root.x + axis.x * L + offX;
        const tipY = root.y + axis.y * L + offY;
        const tipZ = root.z + axis.z * L + offZ;

        // write into second vertex of the segment
        const j = (i * 2 + 1) * 3;
        pos[j + 0] = tipX;
        pos[j + 1] = tipY;
        pos[j + 2] = tipZ;
      }

      const geom = (this.fur.line.geometry as THREE.BufferGeometry);
      (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  addTo(scene: THREE.Scene) { scene.add(this.group); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group); }

  // -------------- internal helpers --------------

  private _autoLength(): number {
    const m = Math.min(this._baseWidth, this._baseHeight);
    return 0.12 * m; // long by default
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

  private async _buildFurLines() {
    if (!this.model) return;

    // collect meshes
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((o: any) => { if (o.isMesh && o.geometry) meshes.push(o); });
    if (meshes.length === 0) return;

    // total hairs from areas * density
    const areas = meshes.map((m) => this._geometryArea(m.geometry));
    const totalHairs = areas.reduce((acc, A) => acc + Math.round(A * this.fur.density), 0);
    if (totalHairs <= 0) return;

    // allocate dynamic positions buffer: 2 points per hair
    const positions = new Float32Array(totalHairs * 2 * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, totalHairs * 2);

    // pink lines (lineWidth ignored on most platforms; visual thickness comes from count & color)
    const mat = new THREE.LineBasicMaterial({
      color: this.fur.color,
      transparent: this.fur.onTop,
      opacity: 1.0,
      depthTest: !this.fur.onTop,
      depthWrite: this.fur.onTop ? false : true
    });

    const lines = new THREE.LineSegments(geom, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 10001;
    this.group.add(lines);

    // init noise
    this.fur.simplex = new SimplexNoise(String(this.fur.seed ?? 1337));

    // prep arrays
    this.fur.positions = positions;
    this.fur.line = lines;

    const baseLen = this.fur.length ?? this._autoLength();
    const intensityDefault = 0.5 * baseLen;

    // sample hairs per mesh using MeshSurfaceSampler (weighted by area)
    let cursor = 0;
    const tmpP = new THREE.Vector3();
    const tmpN = new THREE.Vector3();

    for (let mi = 0; mi < meshes.length; mi++) {
      const mesh = meshes[mi];
      const count = Math.round(areas[mi] * this.fur.density);
      if (count <= 0) continue;

      const sampler = new MeshSurfaceSampler(mesh)
        .setWeightAttribute(null)
        .build();

      for (let i = 0; i < count; i++) {
        sampler.sample(tmpP, tmpN);

        // root
        const r = tmpP.clone();
        // growth axis = sampled normal (normalized)
        const axis = tmpN.clone().normalize();

        // build an orthonormal basis (u, v) around axis
        const rand = new THREE.Vector3(
          (Math.random() * 2 - 1) || 1,
          (Math.random() * 2 - 1) || 0,
          (Math.random() * 2 - 1) || 0
        ).normalize();
        const u = new THREE.Vector3().crossVectors(axis, rand);
        if (u.lengthSq() < 1e-6) u.set(1, 0, 0).cross(axis);
        u.normalize();
        const v = new THREE.Vector3().crossVectors(axis, u).normalize();

        const len = baseLen * (0.85 + 0.30 * Math.random());
        const amp = (this.fur.intensity ?? intensityDefault);

        // write root point
        const i0 = (cursor * 2 + 0) * 3;
        positions[i0 + 0] = r.x;
        positions[i0 + 1] = r.y;
        positions[i0 + 2] = r.z;

        // initial tip (no offset yet): root + axis*len
        const i1 = (cursor * 2 + 1) * 3;
        positions[i1 + 0] = r.x + axis.x * len;
        positions[i1 + 1] = r.y + axis.y * len;
        positions[i1 + 2] = r.z + axis.z * len;

        // store per-hair data for animation
        this.fur.roots.push(r);
        this.fur.dirs.push(axis);
        this.fur.u.push(u);
        this.fur.v.push(v);
        this.fur.len.push(len);

        cursor++;
      }
    }

    // fallback if nothing sampled (very tiny model etc.)
    if (cursor === 0) {
      this.group.remove(lines);
      this.fur.line = undefined;
      this.fur.positions = undefined;
    }
  }
}
