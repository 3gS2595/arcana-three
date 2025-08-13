// src/sim/trails.js
import { THREE } from '../core/three.js';

/**
 * Particle-only trails with drifting smoke and sparkles:
 * - ALWAYS-ON base emission + boosts for movement/rotation/orbit.
 * - Per-particle velocities for real motion while fading.
 * - Smoke: normal blend, depthTest=false so it’s visible over cards; upward drift + lateral wobble; size shrinks slightly over life.
 * - Sparkles: additive; quick darts with damping.
 *
 * Public API unchanged:
 *   makeTrail(color, maxPoints)
 *   updateTrail(obj, dt, movingForTrail, camera)
 *   clearTrail(obj)
 *   computeTrailHead(obj, camera)
 */

// -------------------- sprite helpers --------------------
function makeSmokeSprite(size = 20008) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStarSprite(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size/2, size/2);
  ctx.strokeStyle = 'rgba(196, 226, 0, 1)';
  ctx.lineWidth = Math.max(1, size * 0.05);
  for (let i=0;i<4;i++) { ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(size*0.5, 0); ctx.stroke(); ctx.rotate(Math.PI/4); }
  ctx.setTransform(1,0,0,1,0,0);
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(size/2,size/2,size*0.22,0,Math.PI*2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SMOKE_TEX = makeSmokeSprite(2560);
const STAR_TEX  = makeStarSprite(2560);

// -------------------- point shader material --------------------
function makePointShaderMat({ map, additive = false, tint = new THREE.Color(1,1,1), alphaMult = 1.0, depthTest = true }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uMap:       { value: map },
      uSizeAtten: { value: 3200.0 },
      uTint:      { value: tint },
      uAlphaMult: { value: alphaMult }
    },
    vertexShader: `
      uniform float uSizeAtten;
      attribute float aSize;
      attribute float aAge;
      attribute float aLife;
      attribute float aSeed;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float t = clamp(aAge / max(aLife, 1e-6), 0.0, 1.0);
        vAlpha = 1.0 - t; // fade out over life
        // tiny screen-space shimmer
        mv.x += (sin(aSeed * 17.0 + aAge * 1.5)) * 0.010;
        mv.y += (cos(aSeed * 11.0 + aAge * 1.3)) * 0.010;
        gl_PointSize = aSize * uSizeAtten / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        vSeed = aSeed;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3  uTint;
      uniform float uAlphaMult;
      varying float vAlpha;
      varying float vSeed;
      void main(){
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float twinkle = 0.9 + 0.35 * sin(vSeed * 13.0);
        vec3  rgb = tex.rgb * uTint;
        float a   = tex.a * vAlpha * uAlphaMult * twinkle;
        gl_FragColor = vec4(rgb, a);
        if (gl_FragColor.a < 0.03) discard;
      }
    `
  });
}

// Each system keeps CPU-side velocity arrays to evolve positions
function makePointSystem({ texture, additive, tint, alphaMult, depthTest, capacity }) {
  const geo = new THREE.BufferGeometry();
  const pos   = new Float32Array(capacity * 3);
  const aSize = new Float32Array(capacity);
  const aAge  = new Float32Array(capacity);
  const aLife = new Float32Array(capacity);
  const aSeed = new Float32Array(capacity);
  const vel   = new Float32Array(capacity * 3); // vx,vy,vz

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAge',     new THREE.BufferAttribute(aAge, 1));
  geo.setAttribute('aLife',    new THREE.BufferAttribute(aLife, 1));
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(aSeed, 1));

  const mat = makePointShaderMat({ map: texture, additive, tint, alphaMult, depthTest });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  return { obj: pts, pos, aSize, aAge, aLife, aSeed, vel, count: 0, cap: capacity };
}

// -------------------- API --------------------
export function makeTrail(_color = 0xff0000, maxPoints = 40) {
  const root = new THREE.Group();
  root.name = 'ParticleTrail';

  // capacities tuned for denser look
  const smoke = makePointSystem({
    texture: SMOKE_TEX,
    additive: false,
    tint: new THREE.Color().setRGB(222, 111, 120),
    alphaMult: 1.7,
    depthTest: false, // smoke always drawn over cards
    capacity: maxPoints * 20
  });

  const spark = makePointSystem({
    texture: STAR_TEX,
    additive: true,
    tint: new THREE.Color(1.0, 0.95, 0.88),
    alphaMult: 1.7,
    depthTest: true,
    capacity: Math.max(72, Math.floor(maxPoints * 6))
  });

  root.add(smoke.obj);
  root.add(spark.obj);

  const handle = new THREE.Group();
  handle.add(root);
  handle.userData = { smoke, spark, count: 0 };
  handle.geometry = { setDrawRange: () => {} }; // legacy no-op

  return handle;
}

// Stable local-surface anchor so rotation produces motion
export function computeTrailHead(obj, camera) {
  if (!obj._cardHalfW || !obj._cardHalfH) {
    const box = new THREE.Box3().setFromObject(obj.group);
    const sz  = new THREE.Vector3(); box.getSize(sz);
    obj._cardHalfW = Math.max(1e-6, sz.x * 0.5);
    obj._cardHalfH = Math.max(1e-6, sz.y * 0.5);
    const signX = (obj.group.id % 2 === 0) ? 1 : -1;
    const signY = (obj.group.id % 3 === 0) ? 1 : -1;
    obj._trailAnchorLocal = new THREE.Vector3(
      signX * obj._cardHalfW * 0.72,
      signY * obj._cardHalfH * 0.72,
      0.0
    );
  }
  const head = obj._trailAnchorLocal.clone();
  obj.group.updateMatrixWorld(true);
  obj.group.localToWorld(head);
  const toCam = new THREE.Vector3().subVectors(camera.position, head).normalize();
  head.addScaledVector(toCam, 0.06); // in front of the card
  return head;
}

// Full reset: clear buffers (positions/velocities/ages/sizes)
export function clearTrail(obj) {
  if (!obj?.trail?.userData) return;
  const { smoke, spark } = obj.trail.userData;

  function zero(sys) {
    sys.count = 0;
    sys.pos.fill(0);
    sys.vel.fill(0);
    sys.aAge.fill(0);
    sys.aLife.fill(0);
    sys.aSize.fill(0);
    sys.aSeed.fill(0);
    const geo = sys.obj.geometry.attributes;
    geo.position.needsUpdate = true;
    geo.aAge.needsUpdate = true;
    geo.aLife.needsUpdate = true;
    geo.aSize.needsUpdate = true;
    geo.aSeed.needsUpdate = true;
  }
  zero(smoke); zero(spark);
  obj.trail.visible = false;
}

// Always-on emission + boosted when moving/rotating/orbiting.
// Particles drift with per-particle velocity (updated on CPU).
export function updateTrail(obj, dt, movingForTrail, camera) {
  if (!obj?.trail?.userData) return;
  obj.trail.visible = true;

  const { smoke, spark } = obj.trail.userData;
  const head = computeTrailHead(obj, camera);

  // detect object rotation
  if (!obj._lastQuat) obj._lastQuat = obj.group.quaternion.clone();
  const qdot = Math.abs(obj.group.quaternion.dot(obj._lastQuat));
  const objAngle = 2 * Math.acos(Math.min(1.0, qdot));
  const rotating = objAngle > THREE.MathUtils.degToRad(0.4);
  obj._lastQuat.copy(obj.group.quaternion);

  // detect camera orbit
  if (!obj._lastCamQuat) obj._lastCamQuat = camera.quaternion.clone();
  const cqdot = Math.abs(camera.quaternion.dot(obj._lastCamQuat));
  const camAngle = 2 * Math.acos(Math.min(1.0, cqdot));
  const cameraOrbiting = camAngle > THREE.MathUtils.degToRad(0.4);
  obj._lastCamQuat.copy(camera.quaternion);

  // ---- emission rates (per second) ----
  // Denser base, bigger boost
  const BASE_SMOKE = 50;
  const BASE_SPARK = 40;
  const BOOST_SMOKE = 26;
  const BOOST_SPARK = 10;

  const boostActive = (movingForTrail || rotating || cameraOrbiting) ? 1 : 0;

  if (obj._smokeEmitAcc == null) obj._smokeEmitAcc = 0;
  if (obj._sparkEmitAcc == null) obj._sparkEmitAcc = 0;
  obj._smokeEmitAcc += dt * (BASE_SMOKE + BOOST_SMOKE * boostActive);
  obj._sparkEmitAcc += dt * (BASE_SPARK + BOOST_SPARK * boostActive);

  // spawners (ring buffers) with randomized size & velocity
  function spawnSmoke(p) {
    const i = smoke.count < smoke.cap ? smoke.count++ : 0;

    const jx = (Math.random() - 0.5) * 0.025;
    const jy = (Math.random() - 0.2) * 0.020; // slight up-bias
    const jz = (Math.random() - 0.5) * 0.025;

    smoke.pos[i*3+0] = p.x; smoke.pos[i*3+1] = p.y; smoke.pos[i*3+2] = p.z;
    smoke.vel[i*3+0] = jx;  smoke.vel[i*3+1] = 0.06 + jy; smoke.vel[i*3+2] = jz;

    smoke.aAge[i]  = 0;
    smoke.aLife[i] = 1.4 + Math.random() * 1.2;               // longer life
    smoke.aSize[i] = 0.28 + Math.random() * 0.35;              // randomized size
    smoke.aSeed[i] = Math.random() * 1000.0;

    const geo = smoke.obj.geometry.attributes;
    geo.position.needsUpdate = true; geo.aAge.needsUpdate = true;
    geo.aLife.needsUpdate = true;    geo.aSize.needsUpdate = true; geo.aSeed.needsUpdate = true;
  }

  function spawnSpark(p) {
    const i = spark.count < spark.cap ? spark.count++ : 0;

    // small outward burst
    const theta = Math.random() * Math.PI * 2;
    const phi   = (Math.random() * 0.5 + 0.2) * Math.PI; // mostly around the plane
    const speed = 0.25 + Math.random() * 0.35;
    const vx = Math.cos(theta) * Math.sin(phi) * speed * 0.06;
    const vy = Math.cos(phi) * speed * 0.06;
    const vz = Math.sin(theta) * Math.sin(phi) * speed * 0.06;

    spark.pos[i*3+0] = p.x;  spark.pos[i*3+1] = p.y;  spark.pos[i*3+2] = p.z;
    spark.vel[i*3+0] = vx;   spark.vel[i*3+1] = vy;   spark.vel[i*3+2] = vz;

    spark.aAge[i]  = 0;
    spark.aLife[i] = 0.60 + Math.random() * 0.70;
    spark.aSize[i] = 0.14 + Math.random() * 0.22;
    spark.aSeed[i] = Math.random() * 1000.0;

    const geo = spark.obj.geometry.attributes;
    geo.position.needsUpdate = true; geo.aAge.needsUpdate = true;
    geo.aLife.needsUpdate = true;    geo.aSize.needsUpdate = true; geo.aSeed.needsUpdate = true;
  }

  // emit based on accumulators
  while (obj._smokeEmitAcc >= 1) { spawnSmoke(head); obj._smokeEmitAcc -= 1; }
  while (obj._sparkEmitAcc >= 1) { spawnSpark(head); obj._sparkEmitAcc -= 1; }

  // ------- evolve particles (CPU) -------
  // Smoke: velocity drift + upward bias + damping; size shrink a bit over life.
  for (let i=0;i<smoke.count;i++){
    // age
    smoke.aAge[i] += dt;

    // add gentle random wander
    const seed = smoke.aSeed[i] || 0;
    smoke.vel[i*3+0] += (Math.sin(seed * 5.3 + smoke.aAge[i] * 1.2)) * 0.002 * dt;
    smoke.vel[i*3+2] += (Math.cos(seed * 7.1 + smoke.aAge[i] * 1.1)) * 0.002 * dt;
    smoke.vel[i*3+1] += 0.020 * dt; // buoyancy

    // damping
    smoke.vel[i*3+0] *= (1.0 - 0.6 * dt);
    smoke.vel[i*3+1] *= (1.0 - 0.35 * dt);
    smoke.vel[i*3+2] *= (1.0 - 0.6 * dt);

    // integrate
    smoke.pos[i*3+0] += smoke.vel[i*3+0];
    smoke.pos[i*3+1] += smoke.vel[i*3+1];
    smoke.pos[i*3+2] += smoke.vel[i*3+2];

    // slight size shrink across life
    const t = Math.min(1, smoke.aAge[i] / Math.max(1e-4, smoke.aLife[i]));
    const shrink = 1.0 - 0.25 * t; // up to -25%
    smoke.aSize[i] = Math.max(0.01, smoke.aSize[i] * (0.999 - 0.15 * dt) * shrink);
  }

  // Sparkles: quick dart + damping (twinkle handled in shader)
  for (let i=0;i<spark.count;i++){
    spark.aAge[i] += dt;

    // damping
    spark.vel[i*3+0] *= (1.0 - 1.8 * dt);
    spark.vel[i*3+1] *= (1.0 - 1.8 * dt);
    spark.vel[i*3+2] *= (1.0 - 1.8 * dt);

    spark.pos[i*3+0] += spark.vel[i*3+0];
    spark.pos[i*3+1] += spark.vel[i*3+1];
    spark.pos[i*3+2] += spark.vel[i*3+2];
  }

  // mark updated
  smoke.obj.geometry.attributes.position.needsUpdate = true;
  smoke.obj.geometry.attributes.aAge.needsUpdate     = true;
  smoke.obj.geometry.attributes.aSize.needsUpdate    = true;

  spark.obj.geometry.attributes.position.needsUpdate = true;
  spark.obj.geometry.attributes.aAge.needsUpdate     = true;
}
