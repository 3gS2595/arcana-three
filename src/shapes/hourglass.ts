// src/shapes/hourglass.ts
import { THREE } from "@/core/three";

/**
 * Build an hourglass / bow-tie outline:
 * Top-left → top-right → bottom-left → bottom-right → back to top-left.
 * This self-intersects at the center, which is fine for perimeter sampling.
 */
function buildHourglassPolyline(width = 1, height = 1) {
  const x = width, y = height;
  const tl = new THREE.Vector2(-x,  y);
  const tr = new THREE.Vector2( x,  y);
  const bl = new THREE.Vector2(-x, -y);
  const br = new THREE.Vector2( x, -y);
  const ring = [tl, tr, bl, br, tl.clone()];
  return ring;
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

/** Variable spacing along the hourglass outline (tight fit). */
export function generateHourglassPointsVariable(spacings: number[]) {
  const n = spacings?.length | 0; if (!n) return [];
  const ring = buildHourglassPolyline(1, 1);
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
