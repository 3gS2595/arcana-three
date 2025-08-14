import { THREE } from "@/core/three";

/**
 * CloudShellsOverlay
 * Multi-shell volumetric-looking ring of clouds around the camera-facing frame.
 * - 3–11 layered planes at slightly different depths (front + back)
 * - Each shell uses tendril FBM, ring mask, and additive blending
 * - Parallax across shells gives a convincing "wrapped around frame" feel
 *
 * DevTools (after setup): window.CLOUD_SHELLS.{layers,thickness,speed,density,strength,log()}
 */
export type CloudShellsOpts = {
  distance?: number;     // base distance in front of camera (match your frame) default 2.0
  layers?: number;       // number of shells (odd number recommended), default 7
  thicknessZ?: number;   // total Z span across shells (world units), default 0.6
  innerMarginH?: number; // 0..0.45
  innerMarginV?: number; // 0..0.45
  ringWidthH?: number;   // 0..0.49
  ringWidthV?: number;   // 0..0.49
  speed?: number;        // evolution speed, default 0.06
  density?: number;      // alpha multiplier across all shells, default 0.9
  strength?: number;     // per-shell noise strength, default 1.0
  renderOrderBase?: number; // base render order, default 9900
  debug?: boolean;       // print initial info
};

export class CloudShellsOverlay {
  public group = new THREE.Group();
  private shells: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>> = [];
  private distance: number;
  private layers: number;
  private thicknessZ: number;
  private params: Required<Omit<CloudShellsOpts, "renderOrderBase" | "debug" | "distance" | "layers" | "thicknessZ">>;
  private renderOrderBase: number;
  private _time = 0;

  constructor(opts: CloudShellsOpts = {}) {
    this.distance = opts.distance ?? 2.0;
    this.layers = Math.max(3, Math.floor(opts.layers ?? 7) | 0);
    if (this.layers % 2 === 0) this.layers += 1; // prefer odd for symmetric front/back
    this.thicknessZ = Math.max(0.05, opts.thicknessZ ?? 0.6);
    this.params = {
      innerMarginH: THREE.MathUtils.clamp(opts.innerMarginH ?? 0.02, 0, 0.45),
      innerMarginV: THREE.MathUtils.clamp(opts.innerMarginV ?? 0.02, 0, 0.45),
      ringWidthH:   THREE.MathUtils.clamp(opts.ringWidthH   ?? 0.18, 0.001, 0.49),
      ringWidthV:   THREE.MathUtils.clamp(opts.ringWidthV   ?? 0.18, 0.001, 0.49),
      speed:        Math.max(0, opts.speed ?? 0.06),
      density:      Math.max(0, opts.density ?? 0.9),
      strength:     Math.max(0, opts.strength ?? 1.0),
    };
    this.renderOrderBase = (opts.renderOrderBase ?? 9900) | 0;

    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);

    // Shared shader (each shell gets its own uniforms)
    const makeMat = (seed: number) => new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0.0 },
        uWH:       { value: new THREE.Vector2(1, 1) }, // plane world size at that shell distance
        uInner:    { value: new THREE.Vector2(this.params.innerMarginH, this.params.innerMarginV) },
        uOuter:    { value: new THREE.Vector2(this.params.innerMarginH + this.params.ringWidthH, this.params.innerMarginV + this.params.ringWidthV) },
        uSpeed:    { value: this.params.speed },
        uDensity:  { value: this.params.density },
        uStrength: { value: this.params.strength },
        uSeed:     { value: seed },
        uLayer:    { value: 0.0 },    // -1 back ... 0 center ... +1 front
        uTintA:    { value: new THREE.Color(0x0e231b) },
        uTintB:    { value: new THREE.Color(0x2b6a4a) },
        uTintC:    { value: new THREE.Color(0x1b3344) },
        uOpacity:  { value: 1.0 }
      },
      vertexShader: `
        precision highp float;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;

        uniform float uTime;
        uniform vec2  uWH;
        uniform vec2  uInner;
        uniform vec2  uOuter;
        uniform float uSpeed;
        uniform float uDensity;
        uniform float uStrength;
        uniform float uSeed;
        uniform float uLayer;
        uniform vec3  uTintA, uTintB, uTintC;
        uniform float uOpacity;

        float hash31(vec3 p){ return fract(sin(dot(p, vec3(27.62,57.23,13.87))) * 43758.5453); }
        float vnoise(vec3 p){
          vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float n000=hash31(i+vec3(0,0,0)), n100=hash31(i+vec3(1,0,0));
          float n010=hash31(i+vec3(0,1,0)), n110=hash31(i+vec3(1,1,0));
          float n001=hash31(i+vec3(0,0,1)), n101=hash31(i+vec3(1,0,1));
          float n011=hash31(i+vec3(0,1,1)), n111=hash31(i+vec3(1,1,1));
          float nx00=mix(n000,n100,f.x), nx10=mix(n010,n110,f.x);
          float nx01=mix(n001,n101,f.x), nx11=mix(n011,n111,f.x);
          float nxy0=mix(nx00,nx10,f.y), nxy1=mix(nx01,nx11,f.y);
          return mix(nxy0,nxy1,f.z);
        }
        float fbm(vec3 p){
          float a=0.5, f=0.0;
          for(int i=0;i<5;i++){ f += a * vnoise(p); p *= 2.02; a *= 0.5; }
          return f;
        }

        // soft rectangular mask
        float rectMask(vec2 uv, vec2 margin, float soft){
          vec2 in1 = smoothstep(margin, margin + soft, uv);
          vec2 in2 = smoothstep(margin, margin + soft, 1.0 - uv);
          return in1.x * in1.y * in2.x * in2.y;
        }

        void main(){
          // ring mask first (avoid shading the whole plane)
          float px = max(fwidth(vUv.x), 1e-4);
          float py = max(fwidth(vUv.y), 1e-4);
          float soft = max(px, py) * 2.5 + 0.002;
          float innerM = rectMask(vUv, uInner, soft);
          float outerM = rectMask(vUv, uOuter, soft);
          float ring   = clamp(innerM - outerM, 0.0, 1.0);
          if(ring < 1e-4){ discard; }

          // FBM tendrils, slight domain warp; modulate by layer so shells differ
          vec2 p = (vUv - 0.5) * uWH * 0.33;
          float t = uTime * uSpeed;
          vec3 P = vec3(p * (1.0 + 0.12 * uLayer), t + uSeed * 0.17);

          vec3 warp = vec3(
            fbm(P + vec3(1.3, -2.1, 0.0)),
            fbm(P + vec3(-2.7, 3.1, 0.0)),
            fbm(P + vec3(0.7, 1.5, 0.0))
          );
          P.xy += (warp.xy - 0.5) * (0.9 + 0.3 * uLayer) * uStrength;

          float fine  = fbm(P * 2.4);
          float broad = fbm(P * 0.9);
          float d = mix(broad, fine, 0.68);
          d = smoothstep(0.50, 0.90, d);

          // Layer-based fading: back layers a touch softer
          float layerFade = mix(0.75, 1.0, clamp(uLayer*0.5+0.5, 0.0, 1.0));
          float alpha = d * ring * uDensity * layerFade * uOpacity;

          // Color grade
          vec3 c = mix(uTintA, uTintB, d);
          c = mix(c, uTintC, smoothstep(0.0, 1.0, d*0.6));

          // tiny grain for life
          float g = hash31(vec3(vUv*uWH*8.0, t)) * 0.02;
          c += g * 0.10 * (1.0 - d);

          gl_FragColor = vec4(c, alpha);
        }
      `,
      transparent: true,
      depthTest: true,          // back shells can be occluded if the frame writes depth
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Build shells distributed along Z across [-thicknessZ/2, +thicknessZ/2]
    for (let i = 0; i < this.layers; i++) {
      const mat = makeMat(Math.random() * 1000);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = this.renderOrderBase + i;
      this.shells.push(mesh);
      this.group.add(mesh);
    }

    this.group.name = "CloudShellsOverlay";
    if (opts.debug) {
      console.info("[CloudShells] init", {
        distance: this.distance, layers: this.layers, thicknessZ: this.thicknessZ, params: this.params
      });
    }
  }

  addTo(scene: THREE.Scene) { scene.add(this.group); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group); }

  setLayers(n: number) { /* runtime change would need rebuilding; omit for now */ }
  setSpeed(v: number)  { for (const s of this.shells) s.material.uniforms.uSpeed.value = Math.max(0, v); }
  setDensity(v: number){ for (const s of this.shells) s.material.uniforms.uDensity.value = Math.max(0, v); }
  setStrength(v:number){ for (const s of this.shells) s.material.uniforms.uStrength.value = Math.max(0, v); }
  logSummary() {
    const any = this.shells[0]?.material.uniforms as any;
    console.log("[CloudShells] layers", this.layers, "distance", this.distance,
      "WH", any?.uWH.value, "speed", any?.uSpeed.value,
      "density", any?.uDensity.value, "strength", any?.uStrength.value);
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    this._time += Math.max(0, dt);

    // Camera basis
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const camPos = camera.getWorldPosition(new THREE.Vector3());

    // Distribute shells along Z around the base distance
    const half = this.thicknessZ / 2;
    const L = this.layers - 1;

    for (let i = 0; i < this.layers; i++) {
      const u = (i / L) * 2 - 1;                 // -1..+1
      const zOff = u * half;                     // world units around the base
      const dist = this.distance + zOff;

      const shell = this.shells[i];
      const pos = camPos.clone().addScaledVector(dir, dist);
      shell.position.copy(pos);
      shell.quaternion.copy(camera.quaternion);

      // Size to viewport at this shell's distance
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const viewH = 2 * Math.tan(vFov / 2) * dist;
      const viewW = viewH * camera.aspect;
      shell.scale.set(viewW, viewH, Math.min(viewW, viewH));

      // Update uniforms
      const U = shell.material.uniforms as any;
      U.uTime.value = this._time;
      U.uWH.value.set(viewW, viewH);
      U.uLayer.value = u; // used for subtle variation and fade

      // Depth behavior: back shells test depth; front shells can skip depth for glow
      if (u < 0) {
        shell.material.depthTest = true;   // behind frame -> can be occluded if frame writes depth
      } else {
        shell.material.depthTest = false;  // in front -> no occlusion, clean additive glow
      }
    }
  }
}

/** Helper creator with DevTools surface */
export function setupCloudShells(scene: THREE.Scene, opts: CloudShellsOpts = {}) {
  const shells = new CloudShellsOverlay({ debug: true, ...opts });
  shells.addTo(scene);

  (window as any).CLOUD_SHELLS = {
    speed:    (v: number) => shells.setSpeed(v),
    density:  (v: number) => shells.setDensity(v),
    strength: (v: number) => shells.setStrength(v),
    layers:   () => console.warn("Changing layer count at runtime isn't supported; recreate if needed."),
    thickness:(v: number) => console.warn("Changing thickness at runtime isn't supported; recreate if needed."),
    log:      () => shells.logSummary(),
    _instance: shells
  };

  console.info("%c[CloudShells] Devtools: window.CLOUD_SHELLS { speed, density, strength, log() }", "color:#9f6");
  return shells;
}
