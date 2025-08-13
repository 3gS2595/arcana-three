// src/sim/trails.js
import { THREE } from '../core/three.js';

/**
 * Trail VFX tuned for visibility while orbiting a static heart:
 * - Smoke: depthTest=false so it won’t hide behind cards; bigger & darker; rises faster.
 * - Sparkles: bright & additive.
 * - Ribbon: wide & vivid.
 * - IMPORTANT: trail head is now a stable LOCAL-SURFACE ANCHOR on the card, so pure rotation
 *   still produces visible trail motion (no more “pinned dots”).
 *
 * Public API unchanged:
 *   makeTrail(color, maxPoints)
 *   updateTrail(obj, dt, movingForTrail, camera)
 *   clearTrail(obj)
 *   computeTrailHead(obj, camera)
 */

// -------------------- procedural sprite textures --------------------
function makeCircleSprite(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeStarSprite(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,size,size);
  ctx.translate(size/2, size/2);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = Math.max(1, size * 0.05);
  for (let i=0;i<4;i++) {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(size*0.5, 0); ctx.stroke();
    ctx.rotate(Math.PI/4);
  }
  ctx.setTransform(1,0,0,1,0,0);
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(size/2,size/2,size*0.22,0,Math.PI*2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const SMOKE_TEX = makeCircleSprite(128);
const STAR_TEX  = makeStarSprite(128);

// -------------------- point materials (per-particle alpha) --------------------
function makePointShaderMat({ map, additive = false, tint = new THREE.Color(1,1,1), alphaMult = 1.0, depthTest = true }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uMap: { value: map },
      uSizeAtten: { value: 320.0 },
      uTint: { value: tint },
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
        float lifeT = clamp(aAge / max(aLife, 1e-6), 0.0, 1.0);
        vAlpha = 1.0 - lifeT; // start visible, fade out
        mv.x += (sin(aSeed * 17.0 + aAge * 1.5)) * 0.014;
        mv.y += (cos(aSeed * 11.0 + aAge * 1.3)) * 0.014;
        gl_PointSize = aSize * uSizeAtten / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        vSeed = aSeed;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uTint;
      uniform float uAlphaMult;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec2 uv = gl_PointCoord;
        vec4 tex = texture2D(uMap, uv);
        float twinkle = 0.9 + 0.35 * sin(vSeed * 13.0);
        vec3 rgb = tex.rgb * uTint;
        float a = tex.a * vAlpha * uAlphaMult * twinkle;
        gl_FragColor = vec4(rgb, a);
        if (gl_FragColor.a < 0.03) discard;
      }
    `
  });
}

function makeSmokePoints(maxCount) {
  const geo = new THREE.BufferGeometry();
  const pos  = new Float32Array(maxCount * 3);
  const aSize= new Float32Array(maxCount);
  const aAge = new Float32Array(maxCount);
  const aLife= new Float32Array(maxCount);
  const aSeed= new Float32Array(maxCount);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAge',     new THREE.BufferAttribute(aAge, 1));
  geo.setAttribute('aLife',    new THREE.BufferAttribute(aLife, 1));
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(aSeed, 1));
  const tint = new THREE.Color(0.14, 0.14, 0.18);
  const mat = makePointShaderMat({ map: SMOKE_TEX, additive: false, tint, alphaMult: 1.6, depthTest: false }); // << no depth test
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { obj: pts, pos, aSize, aAge, aLife, aSeed, count: 0, cap: maxCount };
}

function makeSparkPoints(maxCount) {
  const geo = new THREE.BufferGeometry();
  const pos  = new Float32Array(maxCount * 3);
  const aSize= new Float32Array(maxCount);
  const aAge = new Float32Array(maxCount);
  const aLife= new Float32Array(maxCount);
  const aSeed= new Float32Array(maxCount);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAge',     new THREE.BufferAttribute(aAge, 1));
  geo.setAttribute('aLife',    new THREE.BufferAttribute(aLife, 1));
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(aSeed, 1));
  const tint = new THREE.Color(1.0, 0.95, 0.88);
  const mat = makePointShaderMat({ map: STAR_TEX, additive: true, tint, alphaMult: 1.6, depthTest: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { obj: pts, pos, aSize, aAge, aLife, aSeed, count: 0, cap: maxCount };
}

// -------------------- rainbow ribbon --------------------
function makeRibbonMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float lineU;
      attribute float side;
      uniform float halfWidth;
      varying float vU;
      void main() {
        vU = lineU;
        vec3 right = normalize(vec3(modelViewMatrix[0].x, modelViewMatrix[1].x, modelViewMatrix[2].x));
        vec3 pos = position + right * side * halfWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying float vU;
      vec3 hsv2rgb(vec3 c){
        vec3 p = abs(fract(c.xxx + vec3(0., 2./6., 4./6.)) * 6. - 3.);
        return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y);
      }
      void main() {
        float alpha = 0.95 * smoothstep(0.0, 0.15, vU) * smoothstep(1.0, 0.85, vU);
        vec3 rgb = hsv2rgb(vec3(vU, 1.0, 1.0));
        gl_FragColor = vec4(rgb, alpha);
        if (gl_FragColor.a < 0.04) discard;
      }
    `,
    uniforms: { halfWidth: { value: 0.055 } }
  });
}

// -------------------- helpers --------------------
function makeBuffer(n, stride) { return new Float32Array(n * stride); }

// -------------------- API --------------------
export function makeTrail(color = 0xff0000, maxPoints = 40) {
  const root = new THREE.Group();
  root.name = 'VFXTrail';

  // Capacities
  const smoke = makeSmokePoints(maxPoints * 7);
  const spark = makeSparkPoints(Math.max(32, Math.floor(maxPoints * 3)));

  root.add(smoke.obj);
  root.add(spark.obj);

  // Ribbon
  const RIB_SEG = Math.max(16, Math.min(96, Math.floor(maxPoints * 1.2)));
  const ribPos  = makeBuffer(RIB_SEG * 2, 3);
  const ribU    = new Float32Array(RIB_SEG * 2);
  const ribSide = new Float32Array(RIB_SEG * 2);
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
  ribbonGeo.setAttribute('lineU', new THREE.BufferAttribute(ribU, 1));
  ribbonGeo.setAttribute('side',  new THREE.BufferAttribute(ribSide, 1));
  ribbonGeo.setDrawRange(0, 0);
  const ribbon = new THREE.Mesh(ribbonGeo, makeRibbonMaterial());
  ribbon.frustumCulled = false;
  root.add(ribbon);
  const path = new Array(RIB_SEG).fill(null).map(() => new THREE.Vector3());

  function spawnSmoke(p) {
    const i = smoke.count < smoke.cap ? smoke.count++ : 0;
    smoke.pos[i*3+0] = p.x;
    smoke.pos[i*3+1] = p.y;
    smoke.pos[i*3+2] = p.z;
    smoke.aAge[i]  = 0;
    smoke.aLife[i] = 1.4 + Math.random() * 1.0;
    smoke.aSize[i] = 0.30 + Math.random() * 0.20;
    smoke.aSeed[i] = Math.random() * 1000.0;
    smoke.obj.geometry.attributes.position.needsUpdate = true;
    smoke.obj.geometry.attributes.aAge.needsUpdate = true;
    smoke.obj.geometry.attributes.aLife.needsUpdate = true;
    smoke.obj.geometry.attributes.aSize.needsUpdate = true;
    smoke.obj.geometry.attributes.aSeed.needsUpdate = true;
  }

  function spawnSpark(p) {
    const i = spark.count < spark.cap ? spark.count++ : 0;
    const jx = (Math.random()-0.5)*0.03;
    const jy = (Math.random()-0.5)*0.03;
    const jz = (Math.random()-0.5)*0.03;
    spark.pos[i*3+0] = p.x + jx;
    spark.pos[i*3+1] = p.y + jy;
    spark.pos[i*3+2] = p.z + jz;
    spark.aAge[i]  = 0;
    spark.aLife[i] = 0.60 + Math.random() * 0.60;
    spark.aSize[i] = 0.16 + Math.random() * 0.16;
    spark.aSeed[i] = Math.random() * 1000.0;
    spark.obj.geometry.attributes.position.needsUpdate = true;
    spark.obj.geometry.attributes.aAge.needsUpdate = true;
    spark.obj.geometry.attributes.aLife.needsUpdate = true;
    spark.obj.geometry.attributes.aSize.needsUpdate = true;
    spark.obj.geometry.attributes.aSeed.needsUpdate = true;
  }

  function updateParticles(dt) {
    // smoke: rise faster so it's obvious while orbiting a static heart
    for (let i=0;i<smoke.count;i++){
      smoke.aAge[i] += dt;
      smoke.pos[i*3+1] += dt * 0.08;
    }
    for (let i=0;i<spark.count;i++){
      spark.aAge[i] += dt;
    }
    smoke.obj.geometry.attributes.position.needsUpdate = true;
    smoke.obj.geometry.attributes.aAge.needsUpdate = true;
    spark.obj.geometry.attributes.position.needsUpdate = true;
    spark.obj.geometry.attributes.aAge.needsUpdate  = true;
  }

  function pushRibbonPoint(p) {
    for (let i = path.length - 1; i > 0; i--) path[i] = path[i - 1] ? path[i - 1].clone() : null;
    path[0] = p.clone();

    let valid = path.length;
    while (valid > 0 && !path[valid - 1]) valid--;
    if (valid < 2) { ribbonGeo.setDrawRange(0, 0); return; }

    let v = 0;
    for (let i=0;i<valid;i++){
      const u = i / (valid - 1);
      const pt = path[i];
      ribPos[v*3+0] = pt.x; ribPos[v*3+1] = pt.y; ribPos[v*3+2] = pt.z;
      ribU[v] = u; ribSide[v] = -1; v++;
      ribPos[v*3+0] = pt.x; ribPos[v*3+1] = pt.y; ribPos[v*3+2] = pt.z;
      ribU[v] = u; ribSide[v] = +1; v++;
    }
    ribbonGeo.setDrawRange(0, v);
    ribbonGeo.attributes.position.needsUpdate = true;
    ribbonGeo.attributes.lineU.needsUpdate = true;
    ribbonGeo.attributes.side.needsUpdate = true;
  }

  const handle = new THREE.Group();
  handle.add(root);
  handle.userData = {
    path,
    pushRibbonPoint,
    updateParticles,
    spawnSmoke,
    spawnSpark
  };
  handle.geometry = { setDrawRange: () => {} }; // legacy no-op

  return handle;
}

// --- KEY CHANGE: head is a local-surface anchor so rotation produces motion ---
// We lazily compute a stable per-card anchor in LOCAL space (near a corner).
// Then transform it to world each frame and offset slightly toward the camera.
export function computeTrailHead(obj, camera) {
  // cache per-object bounds & anchor
  if (!obj._cardHalfW || !obj._cardHalfH) {
    const box = new THREE.Box3().setFromObject(obj.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    obj._cardHalfW = Math.max(1e-6, size.x * 0.5);
    obj._cardHalfH = Math.max(1e-6, size.y * 0.5);

    // pick a deterministic corner-ish anchor based on object identity (pseudo hash)
    const signX = (obj.group.id % 2 === 0) ? 1 : -1;
    const signY = (obj.group.id % 3 === 0) ? 1 : -1;

    // sit slightly inside the corner so it definitely lies on the “image”
    obj._trailAnchorLocal = new THREE.Vector3(
      signX * obj._cardHalfW * 0.7,
      signY * obj._cardHalfH * 0.7,
      0.0
    );
  }

  // transform local anchor to world
  const head = obj._trailAnchorLocal.clone();
  obj.group.updateMatrixWorld(true);
  obj.group.localToWorld(head);

  // offset a bit toward camera so particles sit in front of the card
  const toCam = new THREE.Vector3().subVectors(camera.position, head).normalize();
  head.addScaledVector(toCam, 0.06);

  return head;
}

export function clearTrail(obj) {
  if (!obj?.trail?.userData) return;
  const ud = obj.trail.userData;
  for (let i = 0; i < ud.path.length; i++) ud.path[i] = null;
  obj.trail.visible = false;
}

export function updateTrail(obj, dt, movingForTrail, camera) {
  if (!obj?.trail?.userData) return;
  obj.trail.visible = true;

  const ud = obj.trail.userData;
  const head = computeTrailHead(obj, camera);

  // always update ribbon for reorientation cue
  ud.pushRibbonPoint(head);

  // spawn effects while moving/reorienting
  if (movingForTrail) {
    ud.spawnSmoke(head);
    ud.spawnSmoke(head);
    if (Math.random() < 0.8) ud.spawnSmoke(head);

    ud.spawnSpark(head);
    if (Math.random() < 0.7) ud.spawnSpark(head);
  }

  ud.updateParticles(dt);
}
