import { THREE } from "@/core/three";

/**
 * CloudSwarmOverlay
 * 3D-feel cloud swarm that wraps around the camera-facing frame.
 * - Points with additive blending (no dark dots)
 * - Pixel-sized sprites for stable visuals
 * - Fragment-space ring mask (inner/outer margins) so clouds hug the frame border
 *
 * DevTools: window.CLOUD_SWARM.{density,size,speed,log()}
 */

export type CloudSwarmOpts = {
  distance?: number;          // world units in front of camera (match frame distance), default 2.0
  count?: number;             // particle count (default 6000)
  innerMarginH?: number;      // 0..0.45
  innerMarginV?: number;      // 0..0.45
  ringWidthH?: number;        // 0..0.49
  ringWidthV?: number;        // 0..0.49
  thickness?: number;         // world Z thickness (default 0.35)
  speed?: number;             // noise evolution speed (default 0.08)
  size?: number;              // **pixels** (default 6.0)
  density?: number;           // alpha multiplier (default 0.8)
  tintA?: number;             // color hex
  tintB?: number;             // color hex
};

export class CloudSwarmOverlay {
  public group = new THREE.Group();
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private _time = 0;

  private distance: number;
  private thickness: number;

  private viewW = 1;
  private viewH = 1;

  constructor(opts: CloudSwarmOpts = {}) {
    this.distance = opts.distance ?? 2.0;
    const count = Math.max(100, Math.floor(opts.count ?? 6000));
    const innerH = THREE.MathUtils.clamp(opts.innerMarginH ?? 0.03, 0, 0.45);
    const innerV = THREE.MathUtils.clamp(opts.innerMarginV ?? 0.03, 0, 0.45);
    const ringH  = THREE.MathUtils.clamp(opts.ringWidthH   ?? 0.16, 0.001, 0.49);
    const ringV  = THREE.MathUtils.clamp(opts.ringWidthV   ?? 0.16, 0.001, 0.49);
    this.thickness = Math.max(0.02, opts.thickness ?? 0.35);

    const geom = new THREE.BufferGeometry();
    // Positions in normalized plane space: x,y in [-0.5..0.5], z in [-thickness/2..thickness/2]
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const span = new Float32Array(count * 2); // 0..1 across ring thickness, plus random

    // Sample on a rounded-rect "ring" by lerping inner->outer edges
    function sampleRoundedRectEdge(rng: () => number, halfX: number, halfY: number, radius: number) {
      const t = rng() * 4.0;
      const side = Math.floor(t);
      const u = rng();
      const r = Math.min(radius, Math.min(halfX, halfY) * 0.9);
      let x = 0, y = 0;
      if (side === 0) { x =  halfX; y = THREE.MathUtils.lerp(-halfY + r,  halfY - r, u); }
      else if (side === 1){ x = -halfX; y = THREE.MathUtils.lerp( halfY - r, -halfY + r, u); }
      else if (side === 2){ y =  halfY; x = THREE.MathUtils.lerp( halfX - r, -halfX + r, u); }
      else {                y = -halfY; x = THREE.MathUtils.lerp(-halfX + r,  halfX - r, u); }
      return { x, y };
    }

    const halfInnerX = 0.5 * (1 - 2 * innerH);
    const halfInnerY = 0.5 * (1 - 2 * innerV);
    const halfOuterX = 0.5 * (1 - 2 * (innerH + ringH));
    const halfOuterY = 0.5 * (1 - 2 * (innerV + ringV));
    const cornerR = 0.10;

    const rng = (s: number) => { let x = Math.sin(s) * 43758.5453; return () => (s = x = Math.sin(x) * 43758.5453, x - Math.floor(x)); };
    const R = rng(Math.random() * 1000);

    for (let i = 0; i < count; i++) {
      const a = sampleRoundedRectEdge(R, halfInnerX, halfInnerY, cornerR);
      const b = sampleRoundedRectEdge(R, halfOuterX, halfOuterY, cornerR);
      const t = Math.random();
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const y = THREE.MathUtils.lerp(a.y, b.y, t);
      const z = (Math.random() - 0.5) * this.thickness;

      pos[3 * i + 0] = x;
      pos[3 * i + 1] = y;
      pos[3 * i + 2] = z;

      seed[3 * i + 0] = Math.random() * 1000.0;
      seed[3 * i + 1] = Math.random() * 1000.0;
      seed[3 * i + 2] = Math.random() * 1000.0;

      span[2 * i + 0] = t;            // across thickness
      span[2 * i + 1] = Math.random();
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    geom.setAttribute("aSpan", new THREE.BufferAttribute(span, 2));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0.0 },
        uWH:       { value: new THREE.Vector2(1, 1) },         // world W/H at distance
        uInner:    { value: new THREE.Vector2(innerH, innerV) },
        uOuter:    { value: new THREE.Vector2(innerH + ringH, innerV + ringV) },
        uThickness:{ value: this.thickness },
        uSpeed:    { value: opts.speed   ?? 0.08 },
        uSizePx:   { value: opts.size    ?? 6.0  },             // sprite size in pixels
        uDensity:  { value: opts.density ?? 0.8  },
        uColA:     { value: new THREE.Color(opts.tintA ?? 0x6aa08f) }, // lighter swamp tones
        uColB:     { value: new THREE.Color(opts.tintB ?? 0x9ed0c7) },
      },
      vertexShader: `
        precision highp float;

        attribute vec3 aSeed;
        attribute vec2 aSpan;
        uniform float uTime;
        uniform vec2  uWH;
        uniform float uThickness;
        uniform float uSpeed;
        uniform float uSizePx;

        varying float vEdgeMix;
        varying vec3  vNoise;
        varying vec2  vUv; // 0..1 in plane space (for ring mask)

        float hash(vec3 p){ return fract(sin(dot(p, vec3(27.62,57.23,13.87))) * 43758.5453); }
        float vnoise(vec3 p){
          vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float n000=hash(i+vec3(0,0,0)), n100=hash(i+vec3(1,0,0));
          float n010=hash(i+vec3(0,1,0)), n110=hash(i+vec3(1,1,0));
          float n001=hash(i+vec3(0,0,1)), n101=hash(i+vec3(1,0,1));
          float n011=hash(i+vec3(0,1,1)), n111=hash(i+vec3(1,1,1));
          float nx00=mix(n000,n100,f.x), nx10=mix(n010,n110,f.x);
          float nx01=mix(n001,n101,f.x), nx11=mix(n011,n111,f.x);
          float nxy0=mix(nx00,nx10,f.y), nxy1=mix(nx01,nx11,f.y);
          return mix(nxy0,nxy1,f.z);
        }
        vec3 fbm3(vec3 p){
          float a=0.5; vec3 s=vec3(0.0);
          for(int i=0;i<4;i++){ s+=a*vec3(vnoise(p)); p*=2.02; a*=0.5; }
          return s;
        }

        void main(){
          // Map normalized [-0.5..0.5] local ring positions to world scale uWH
          vec3 base = position;
          base.x *= uWH.x;
          base.y *= uWH.y;

          // pass plane UV 0..1 for ring clipping in fragment
          vUv = base.xy / uWH * 0.5 + 0.5;

          float t = uTime * uSpeed;
          float edgeBias = smoothstep(0.0, 1.0, abs(aSpan.x - 0.5) * 2.0);
          float amp = mix(0.02, 0.11, edgeBias);

          // Swirl offset
          vec3 p = vec3(base.x * 0.45, base.y * 0.45, aSpan.y * 1.7) + aSeed;
          vec3 w = fbm3(p + vec3(0.0, 0.0, t)) - 0.5;
          vec3 off = normalize(vec3(w.y, -w.x, w.z) + vec3(1e-4)) * amp;

          vec3 pos = base + off;
          pos.z += (position.z) + (w.z - 0.5) * uThickness * 0.4;

          // Standard MVP
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;

          // Pixel-sized sprite (stable across distance)
          gl_PointSize = uSizePx;

          vEdgeMix = edgeBias;
          vNoise = w;
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform vec2  uInner;
        uniform vec2  uOuter;
        uniform float uDensity;
        uniform vec3  uColA;
        uniform vec3  uColB;

        varying float vEdgeMix;
        varying vec3  vNoise;
        varying vec2  vUv;

        // soft rectangular mask (0..1) with margins and feather
        float rectMask(vec2 uv, vec2 margin, float soft){
          vec2 in1 = smoothstep(margin, margin + soft, uv);
          vec2 in2 = smoothstep(margin, margin + soft, 1.0 - uv);
          return in1.x * in1.y * in2.x * in2.y;
        }

        void main(){
          // discard pixels outside the point circle (soft)
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = dot(p, p);
          float alpha = smoothstep(1.0, 0.0, r);
          alpha = pow(alpha, 1.5);

          // ring clipping in fragment space (ensures we don't fill the whole screen)
          float px = max(fwidth(vUv.x), 1e-4);
          float py = max(fwidth(vUv.y), 1e-4);
          float soft = max(px, py) * 2.5 + 0.002;
          float innerM = rectMask(vUv, uInner, soft);
          float outerM = rectMask(vUv, uOuter, soft);
          float ring   = clamp(innerM - outerM, 0.0, 1.0);
          if(ring < 1e-4) discard;

          // color + alpha
          float k = clamp(vEdgeMix * 0.9 + (vNoise.z*0.5+0.5)*0.1, 0.0, 1.0);
          vec3 col = mix(uColA, uColB, k);
          float a = alpha * ring * (0.25 + 0.75 * uDensity);

          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthTest: false,               // no occlusion artifacts / dark speckles
      depthWrite: false,
      blending: THREE.AdditiveBlending, // bright, fog-like accumulation
    });

    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.group.name = "CloudSwarmOverlay";

    // One-time log for sanity
    console.info("[CloudSwarm] init",
      { distance: this.distance, thickness: this.thickness, count,
        innerH, innerV, ringH, ringV, sizePx: (mat.uniforms.uSizePx.value as number) });
  }

  addTo(scene: THREE.Scene) { scene.add(this.group); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group); }

  setDensity(v: number) { this.points.material.uniforms.uDensity.value = THREE.MathUtils.clamp(v, 0, 3); }
  setSize(v: number)    { this.points.material.uniforms.uSizePx.value = Math.max(1.0, v); }
  setSpeed(v: number)   { this.points.material.uniforms.uSpeed.value = Math.max(0.0, v); }

  logSummary() {
    const u = this.points.material.uniforms as any;
    console.log("[CloudSwarm] WH", this.viewW.toFixed(3), this.viewH.toFixed(3),
      "sizePx", u.uSizePx.value.toFixed(1),
      "density", u.uDensity.value.toFixed(2),
      "speed", u.uSpeed.value.toFixed(2),
      "pos", this.group.position);
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    this._time += Math.max(0, dt);
    this.points.material.uniforms.uTime.value = this._time;

    // Place in front of camera like the frame overlay
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.addScaledVector(dir, this.distance);
    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // World frustum size at this distance
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;
    this.viewW = viewW; this.viewH = viewH;

    // Keep geometry in normalized plane; scale to world via uniform
    (this.points.material.uniforms.uWH.value as THREE.Vector2).set(viewW, viewH);
  }
}

/** Helper to create & expose DevTools control surface */
export function setupCloudSwarm(scene: THREE.Scene, opts: CloudSwarmOpts = {}) {
  const swarm = new CloudSwarmOverlay(opts);
  swarm.addTo(scene);

  (window as any).CLOUD_SWARM = {
    density: (v: number) => swarm.setDensity(v),
    size:    (v: number) => swarm.setSize(v),
    speed:   (v: number) => swarm.setSpeed(v),
    log:     () => swarm.logSummary(),
    _instance: swarm
  };

  console.info("%c[CloudSwarm] Devtools: window.CLOUD_SWARM { density, size, speed, log() }", "color:#9f6");
  return swarm;
}
