// src/sim/heart/sampling.js
import { THREE } from '../../core/three.js';
import { buildHeartPolyline, segmentLengths } from './curve.js';
import { CARD_W, CARD_MARGIN } from '../../cards/mesh.js';

/**
 * Sample a point along the *scaled* heart polyline at a given world-space arc length.
 * - ring: unscaled polyline points
 * - segLen, L: unscaled segment lengths and total length
 * - sWorld: desired arc length in world units
 * - scale: uniform scale to apply to the unscaled polyline
 * The function wraps sWorld around the full (scaled) perimeter.
 */
function sampleAtArcLen(ring, segLen, L, sWorld, scale) {
  const SAMPLES = ring.length - 1;
  const totalWorld = L * scale;

  // wrap into [0, totalWorld)
  let s = sWorld % totalWorld;
  if (s < 0) s += totalWorld;

  let acc = 0, idx = 0;
  while (idx < SAMPLES && acc + segLen[idx] * scale < s) {
    acc += segLen[idx] * scale;
    idx++;
  }
  if (idx >= SAMPLES) idx = SAMPLES - 1;

  const segWorld = Math.max(1e-9, segLen[idx] * scale);
  const u = (s - acc) / segWorld;

  const p0 = ring[idx];
  const p1 = ring[(idx + 1) % SAMPLES];

  const x = THREE.MathUtils.lerp(p0.x, p1.x, u) * scale;
  const y = THREE.MathUtils.lerp(p0.y, p1.y, u) * scale;
  return new THREE.Vector3(x, y, 0);
}

/**
 * Compute the unscaled arc-length offset of the TOP MIDPOINT of the heart outline.
 * We locate the vertex with maximum Y and return its cumulative length from ring[0].
 */
function topOffsetUnscaled(ring, segLen) {
  const SAMPLES = ring.length - 1;
  // find index with max Y
  let maxY = -Infinity;
  let k = 0;
  for (let i = 0; i < SAMPLES; i++) {
    if (ring[i].y > maxY) { maxY = ring[i].y; k = i; }
  }
  // cumulative length from 0 to k (unscaled)
  let acc = 0;
  for (let i = 0; i < k; i++) acc += segLen[i];
  return acc; // in unscaled units
}

/**
 * Legacy uniform spacing (kept for compatibility with older paths in your codebase):
 * Scales the curve so that perimeter ≈ n * (CARD_W + CARD_MARGIN) * SAFETY
 * and places n points uniformly along the loop (centers at mid-span).
 * Starts at the heart's TOP middle.
 */
export function generateHeartPoints(n) {
  if (!n || n <= 0) return [];

  const ring = buildHeartPolyline(4096);
  const { segLen, L } = segmentLengths(ring);

  const spacing = CARD_W + CARD_MARGIN;
  const SAFETY = 1.08; // slight extra air
  const scale = (n * spacing / L) * SAFETY;

  const points = [];
  const stepWorld = spacing;

  // START AT TOP (unscaled offset -> world units)
  const startWorld = topOffsetUnscaled(ring, segLen) * scale;

  let sWorld = startWorld;
  for (let i = 0; i < n; i++) {
    const mid = sWorld + stepWorld * 0.5;
    points.push(sampleAtArcLen(ring, segLen, L, mid, scale));
    sWorld += stepWorld;
  }
  return points;
}

/**
 * Variable spacing (NO OVERLAPS), proportional:
 * - spacings[i] is the desired world-space tangent span for card i (width + margins).
 * - Scales the heart so scaled perimeter ≈ sum(spacings) * SAFETY (here SAFETY=1.0, see note).
 * - Places each card centered in its own span and WRAPS the loop.
 * - Starts at the heart's TOP middle.
 *
 * NOTE: We set SAFETY=1.0 here (tight fit).
 *       If you ever see edge-kisses on very sharp curvature, raise SAFETY slightly (e.g., 1.03).
 */
export function generateHeartPointsVariable(spacings /* number[] */) {
  const n = spacings?.length | 0;
  if (!n) return [];

  const ring = buildHeartPolyline(4096);
  const { segLen, L } = segmentLengths(ring);

  // sanitize and accumulate
  const safe = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.max(1e-4, spacings[i] || 0);
    safe[i] = s;
    total += s;
  }

  // TIGHT fit per your request: no extra scale headroom here
  const SAFETY = 1.0;
  const scale = (total / L) * SAFETY;

  const points = [];
  // START AT TOP (unscaled offset -> world units)
  const startWorld = topOffsetUnscaled(ring, segLen) * scale;

  let sWorld = startWorld;
  for (let i = 0; i < n; i++) {
    const span = safe[i];
    const mid = sWorld + span * 0.5;
    points.push(sampleAtArcLen(ring, segLen, L, mid, scale));
    sWorld += span;
  }
  return points;
}
