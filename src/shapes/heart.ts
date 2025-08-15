// src/shapes/heart.ts
import { THREE } from "@/core/three";
import { CARD_W, CARD_MARGIN } from "@/cards/mesh";

/** Parametric heart in XY */
function baseHeartXY(t: number) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return new THREE.Vector2(x, y);
}

/** Closed polyline (last == first) */
function buildHeartPolyline(samples = 4096) {
  const ring = new Array<THREE.Vector2>(samples + 1);
  for (let i = 0; i <= samples; i++) ring[i] = baseHeartXY((i / samples) * Math.PI * 2);
  return ring;
}

function segmentLengths(ring: THREE.Vector2[]) {
  const segLen: number[] = new Array(ring.length - 1);
  let L = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = ring[i + 1].distanceTo(ring[i]);
    segLen[i] = d; L += d;
  }
  return { segLen, L };
}

function sampleAtArcLen(
  ring: THREE.Vector2[], segLen: number[], L: number, sWorld: number, scale: number
) {
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

/** Legacy fixed-spacing (kept for compatibility) */
export function generateHeartPoints(n: number) {
  if (!n || n <= 0) return [];
  const ring = buildHeartPolyline(4096);
  const { segLen, L } = segmentLengths(ring);
  const spacing = CARD_W + CARD_MARGIN;
  const SAFETY = 1.08;
  const scale = (n * spacing / L) * SAFETY;

  const pts: THREE.Vector3[] = [];
  const stepWorld = spacing;
  const startWorld = topOffsetUnscaled(ring, segLen) * scale;

  let sWorld = startWorld;
  for (let i = 0; i < n; i++) {
    const mid = sWorld + stepWorld * 0.5;
    pts.push(sampleAtArcLen(ring, segLen, L, mid, scale));
    sWorld += stepWorld;
  }
  return pts;
}

/** Tight variable spacing for heart */
export function generateHeartPointsVariable(spacings: number[]) {
  const n = spacings?.length | 0; if (!n) return [];
  const ring = buildHeartPolyline(4096);
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
