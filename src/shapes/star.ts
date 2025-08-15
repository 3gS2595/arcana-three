// src/shapes/star.ts
import { THREE } from "@/core/three";

/** Build a regular 5-pointed star outline as a closed polyline (last == first). */
function buildStarPolyline(outerR = 1, innerR = outerR * (Math.sin(18 * Math.PI / 180) / Math.sin(54 * Math.PI / 180))) {
  const pts: THREE.Vector2[] = [];
  // Start at top (angle -90°) and go around alternating outer/inner:
  const start = -Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const isOuter = (i % 2) === 0;
    const a = start + (i * Math.PI / 5); // 36° step
    const r = isOuter ? outerR : innerR;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  pts.push(pts[0].clone()); // close
  return pts;
}

function segmentLengths(ring: THREE.Vector2[]) {
  const segLen: number[] = new Array(ring.length - 1);
  let L = 0;
  for (let i = 0; i < ring.length - 1; i++) { const d = ring[i + 1].distanceTo(ring[i]); segLen[i] = d; L += d; }
  return { segLen, L };
}

function sampleAtArcLen(ring: THREE.Vector2[], segLen: number[], L: number, sWorld: number, scale: number) {
  const SAMPLES = ring.length - 1;
  const totalWorld = L * scale;
  let s = sWorld % totalWorld; if (s < 0) s += totalWorld;

  let acc = 0, idx = 0;
  while (idx < SAMPLES && acc + segLen[idx] * scale < s) { acc += segLen[idx] * scale; idx++; }
  if (idx >= SAMPLES) idx = SAMPLES - 1;

  const segWorld = Math.max(1e-9, segLen[idx] * scale);
  const u = (s - acc) / segWorld;

  const p0 = ring[idx], p1 = ring[(idx + 1) % SAMPLES];
  const x = THREE.MathUtils.lerp(p0.x, p1.x, u) * scale;
  const y = THREE.MathUtils.lerp(p0.y, p1.y, u) * scale;
  return new THREE.Vector3(x, y, 0);
}

function topOffsetUnscaled(ring: THREE.Vector2[], segLen: number[]) {
  const SAMPLES = ring.length - 1;
  let k = 0, maxY = -Infinity;
  for (let i = 0; i < SAMPLES; i++) if (ring[i].y > maxY) { maxY = ring[i].y; k = i; }
  let acc = 0; for (let i = 0; i < k; i++) acc += segLen[i];
  return acc;
}

/** Variable spacing for a 5-pointed star outline (tight fit). */
export function generateStarPointsVariable(spacings: number[]) {
  const n = spacings?.length | 0; if (!n) return [];
  const ring = buildStarPolyline(1, 0.38196601125 /* golden inner radius */);
  const { segLen, L } = segmentLengths(ring);

  const safe = new Array<number>(n);
  let total = 0;
  for (let i = 0; i < n; i++) { const s = Math.max(1e-4, spacings[i] || 0); safe[i] = s; total += s; }

  const SAFETY = 1.0;
  const scale = (total / L) * SAFETY;

  const pts: THREE.Vector3[] = [];
  const startWorld = topOffsetUnscaled(ring, segLen) * scale;

  let sWorld = startWorld;
  for (let i = 0; i < n; i++) {
    const span = safe[i], mid = sWorld + span * 0.5;
    pts.push(sampleAtArcLen(ring, segLen, L, mid, scale));
    sWorld += span;
  }
  return pts;
}
