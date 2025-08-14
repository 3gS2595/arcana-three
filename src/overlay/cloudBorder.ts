import { THREE } from "@/core/three";

/**
 * Procedural, camera-facing volumetric cloud ring that hugs the viewport borders.
 * Includes extensive debug helpers and visual modes.
 *
 * DevTools:
 *   window.CLOUDS.mode(1)     // 0: full, 1: ring mask, 2: slab, 3: noise, 4: solid test
 *   window.CLOUDS.opacity(1)
 *   window.CLOUDS.density(1.5)
 *   window.CLOUDS.speed(0.08)
 *   window.CLOUDS.log()
 *   window.CLOUDS.snapshot()
 */
type CloudOpts = {
  distance?: number;          // world units ahead of camera (default 2.0)
  innerMarginH?: number;      // 0..0.45 (left/right inset)
  innerMarginV?: number;      // 0..0.45 (top/bottom inset)
  ringWidthH?: number;        // 0..0.49 (horizontal thickness)
  ringWidthV?: number;        // 0..0.49 (vertical thickness)
  density?: number;           // 0..2
  speed?: number;             // 0..5 (evolution speed)
  opacity?: number;           // 0..1
  renderAboveFrame?: boolean; // draw clouds over frame (default true)
  debugMode?: number;         // 0 full, 1 ring mask, 2 slab depth, 3 noise only, 4 solid test block
  debugLog?: boolean;         // console diagnostics on create / first update
};

export class CloudBorderOverlay {
  public group = new THREE.Group();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private _time = 0;
  private _didFirstUpdate = false;

  private distance: number;

  constructor(opts: CloudOpts = {}) {
    this.distance = opts.distance ?? 2.0;

    const innerH = THREE.MathUtils.clamp(opts.innerMarginH ?? 0.02, 0, 0.45);
    const innerV = THREE.MathUtils.clamp(opts.innerMarginV ?? 0.02, 0, 0.45);
    const ringH  = THREE.MathUtils.clamp(opts.ringWidthH   ?? 0.18, 0.001, 0.49);
    const ringV  = THREE.MathUtils.clamp(opts.ringWidthV   ?? 0.18, 0.001, 0.49);

    const debugMode = (opts.debugMode ?? 0) | 0;

    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0.0 },
        uWH:       { value: new THREE.Vector2(1, 1) },    // world size at distance
        uInner:    { value: new THREE.Vector2(innerH, innerV) },
        uOuter:    { value: new THREE.Vector2(innerH + ringH, innerV + ringV) },
        uDensity:  { value: THREE.MathUtils.clamp(opts.density ?? 1.2, 0, 2) },
        uSpeed:    { value: THREE.MathUtils.clamp(opts.speed ?? 0.06, 0, 5) },
        uOpacity:  { value: THREE.MathUtils.clamp(opts.opacity ?? 0.95, 0, 1) },
        uSeed:     { value: Math.random() * 1000.0 },
        uColA:     { value: new THREE.Color(0x0b2018) },  // deep swamp black-green
        uColB:     { value: new THREE.Color(0x2b6a4a) },  // mossy green
        uColC:     { value: new THREE.Color(0x1c3040) },  // murky teal/blue
        uDebugMode:{ value: debugMode },                   // 0 full, 1 mask, 2 slab, 3 noise, 4 solid
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        #ifdef GL_ES
        precision highp float;
        #endif
        varying vec2 vUv;

        uniform float uTime;
        uniform vec2  uWH;        // plane world size (W,H) at camera distance
        uniform vec2  uInner;     // inner rect margins (H,V) in [0,0.5)
        uniform vec2  uOuter;     // outer rect margins (H,V) in [0,0.5)
        uniform float uDensity;
        uniform float uSpeed;
        uniform float uOpacity;
        uniform float uSeed;
        uniform vec3  uColA;
        uniform vec3  uColB;
        uniform vec3  uColC;
        uniform int   uDebugMode;

        // ----- compact hash/noise/fbm -----
        float hash31(vec3 p){
          return fract(sin(dot(p, vec3(27.62, 57.23, 13.87))) * 43758.5453);
        }
        float vnoise(vec3 p){
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i + vec3(0.0,0.0,0.0));
          float n100 = hash31(i + vec3(1.0,0.0,0.0));
          float n010 = hash31(i + vec3(0.0,1.0,0.0));
          float n110 = hash31(i + vec3(1.0,1.0,0.0));
          float n001 = hash31(i + vec3(0.0,0.0,1.0));
          float n101 = hash31(i + vec3(1.0,0.0,1.0));
          float n011 = hash31(i + vec3(0.0,1.0,1.0));
          float n111 = hash31(i + vec3(1.0,1.0,1.0));
          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);
          float nxy0 = mix(nx00, nx10, f.y);
          float nxy1 = mix(nx01, nx11, f.y);
          return mix(nxy0, nxy1, f.z);
        }
        float fbm(vec3 p){
          float a = 0.5;
          float f = 0.0;
          for(int i=0; i<5; i++){
            f += a * vnoise(p);
            p *= 2.02;
            a *= 0.5;
          }
          return f;
        }

        // soft rectangular mask (0..1) with margins and feather
        float rectMask(vec2 uv, vec2 margin, float soft){
          vec2 in1 = smoothstep(margin, margin + soft, uv);
          vec2 in2 = smoothstep(margin, margin + soft, 1.0 - uv);
          return in1.x * in1.y * in2.x * in2.y;
        }

        void main(){
          // Debug solid block to verify plane visibility & blending.
          if(uDebugMode == 4){
            gl_FragColor = vec4(1.0, 0.2, 0.2, 0.9); // bright red
            return;
          }

          // 1) ring mask between inner (larger rect) and outer (smaller rect)
          float px = max(fwidth(vUv.x), 1e-4);
          float py = max(fwidth(vUv.y), 1e-4);
          float soft = max(px, py) * 2.5 + 0.002;

          float innerM = rectMask(vUv, uInner, soft);
          float outerM = rectMask(vUv, uOuter, soft);

          // FIXED: the band is INNER minus OUTER, not OUTER minus INNER
          float ring  = clamp(innerM - outerM, 0.0, 1.0);

          // Visualize just the ring mask
          if(uDebugMode == 1){
            vec3 c = mix(vec3(0.0), vec3(0.0,1.0,1.0), ring); // cyan ring
            gl_FragColor = vec4(c, ring);
            return;
          }

          if(ring < 1e-4){
            discard;
          }

          // 2) short ray-march slab behind the plane
          vec2 xy = (vUv - 0.5) * uWH;
          float depth = 0.9;
          int   steps = 32;
          float stepL = depth / float(steps);
          float tt = uTime * uSpeed;

          vec3 base = vec3(xy * 0.35, 0.0) + vec3(0.0, 0.0, tt) + vec3(uSeed);

          float accum = 0.0;
          float atten = 1.0;
          for(int i=0; i<64; i++){
            if(i >= steps) break;
            float z = float(i) * stepL;
            vec3 p = base + vec3(0.0, 0.0, -z * 0.6);

            // domain warp for tendrils
            vec3 w = vec3(
              fbm(p * 0.75 + 1.3),
              fbm(p * 0.65 - 2.1),
              fbm(p * 0.55 + 3.7)
            );
            vec3 q = p + (w - 0.5) * 1.6;

            float fine   = fbm(q * 2.6);
            float broad  = fbm(q * 0.9);
            float d = mix(broad, fine, 0.72);

            // debug noise only (no threshold/accumulation)
            if(uDebugMode == 3){
              float v = mix(broad, fine, 0.72);
              gl_FragColor = vec4(vec3(v), ring);
              return;
            }

            d = smoothstep(0.50, 0.86, d);
            d *= 0.07 * uDensity;

            float fade = smoothstep(1.0, 0.2, z / depth);
            float add  = d * fade * atten;

            accum += add;
            atten *= (1.0 - d * 0.9);
            if(atten < 0.02) break;
          }

          // debug slab (no color grading)
          if(uDebugMode == 2){
            float a = clamp(accum * uOpacity, 0.0, 1.0) * ring;
            gl_FragColor = vec4(vec3(accum), a);
            return;
          }

          // 3) full render (color + alpha)
          float m = clamp(accum * 1.7, 0.0, 1.0);
          vec3 swamp = mix(uColA, uColB, m);
          swamp = mix(swamp, uColC, smoothstep(0.0, 1.0, m * 0.6));

          float alpha = clamp(accum * uOpacity, 0.0, 1.0) * ring;

          // subtle grain/dither
          float grain = hash31(vec3(vUv * uWH * 8.0, uTime)) * 0.02;
          swamp += grain * 0.15 * (1.0 - m);

          gl_FragColor = vec4(swamp, alpha);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: true }, // fwidth safety on WebGL1
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = (opts.renderAboveFrame ?? true) ? 10000 : 9998;
    this.mesh.frustumCulled = false;

    this.group.add(this.mesh);
    this.group.name = "CloudBorderOverlay";

    if (opts.debugLog) {
      console.groupCollapsed("%c[CloudBorder] created", "color:#6cf");
      console.log("distance:", this.distance);
      console.log("margins (inner H,V):", innerH, innerV);
      console.log("ring width (H,V):", ringH, ringV);
      console.log("density:", this.mesh.material.uniforms.uDensity.value);
      console.log("speed:", this.mesh.material.uniforms.uSpeed.value);
      console.log("opacity:", this.mesh.material.uniforms.uOpacity.value);
      console.log("debugMode:", debugMode, "(0 full, 1 ring, 2 slab, 3 noise, 4 solid)");
      console.groupEnd();
    }
  }

  addTo(scene: THREE.Scene) { scene.add(this.group); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group); }

  setOpacity(alpha: number) {
    this.mesh.material.uniforms.uOpacity.value = THREE.MathUtils.clamp(alpha, 0, 1);
  }
  setDensity(d: number) {
    this.mesh.material.uniforms.uDensity.value = THREE.MathUtils.clamp(d, 0, 2);
  }
  setSpeed(s: number) {
    this.mesh.material.uniforms.uSpeed.value = THREE.MathUtils.clamp(s, 0, 5);
  }
  setDebugMode(mode: number) {
    this.mesh.material.uniforms.uDebugMode.value = (mode | 0);
  }

  logSummary() {
    const u = this.mesh.material.uniforms as any;
    const p = this.group.position;
    const s = this.group.scale;
    console.log(
      "[CloudBorder] pos", p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2),
      "scale", s.x.toFixed(2), s.y.toFixed(2),
      "WH", u.uWH.value.x.toFixed(2), u.uWH.value.y.toFixed(2),
      "opacity", u.uOpacity.value.toFixed(2),
      "density", u.uDensity.value.toFixed(2),
      "mode", u.uDebugMode.value
    );
  }

  snapshot() {
    const u = this.mesh.material.uniforms as any;
    return {
      time: this._time,
      position: this.group.position.clone(),
      scale: this.group.scale.clone(),
      distance: this.distance,
      WH: u.uWH.value.clone(),
      inner: u.uInner.value.clone(),
      outer: u.uOuter.value.clone(),
      density: u.uDensity.value,
      speed: u.uSpeed.value,
      opacity: u.uOpacity.value,
      debugMode: u.uDebugMode.value,
      renderOrder: this.mesh.renderOrder,
    };
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    this._time += Math.max(0, dt);
    this.mesh.material.uniforms.uTime.value = this._time;

    // place at fixed distance in front of camera, matching orientation
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.addScaledVector(dir, this.distance);
    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // scale plane to frustum size at this distance
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;

    if (!isFinite(viewW) || !isFinite(viewH) || viewW <= 0 || viewH <= 0) {
      if (!this._didFirstUpdate) {
        console.warn("[CloudBorder] invalid frustum size", { viewW, viewH, fov: camera.fov, aspect: camera.aspect, distance: this.distance });
      }
      return;
    }

    this.group.scale.set(viewW, viewH, Math.min(viewW, viewH));
    (this.mesh.material.uniforms.uWH.value as THREE.Vector2).set(viewW, viewH);

    if (!this._didFirstUpdate) {
      this._didFirstUpdate = true;
      console.groupCollapsed("%c[CloudBorder] first update", "color:#6cf");
      console.log("position:", this.group.position);
      console.log("scale (target view W/H):", viewW, viewH);
      console.log("camera fov/aspect:", camera.fov, camera.aspect);
      console.log("uniform uWH:", (this.mesh.material.uniforms.uWH.value as THREE.Vector2));
      console.groupEnd();
    }
  }
}

/** Helper to create and add the clouds with sensible defaults and global debug handle */
export function setupCloudBorder(scene: THREE.Scene, opts: CloudOpts = {}) {
  const clouds = new CloudBorderOverlay({ debugLog: true, ...opts });
  clouds.addTo(scene);

  // Expose a minimal control surface for quick debugging in DevTools
  (window as any).CLOUDS = {
    mode: (m: number) => clouds.setDebugMode(m),
    opacity: (v: number) => clouds.setOpacity(v),
    density: (v: number) => clouds.setDensity(v),
    speed: (v: number) => clouds.setSpeed(v),
    log: () => clouds.logSummary(),
    snapshot: () => clouds.snapshot(),
    _instance: clouds
  };

  console.info(
    "%c[CloudBorder] Devtools helper: window.CLOUDS { mode, opacity, density, speed, log(), snapshot() }",
    "color:#9f6"
  );

  return clouds;
}
