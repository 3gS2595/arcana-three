// src/sim/heart/curve.js
import { THREE } from '../../core/three.js';

/**
 * Classic parametric heart in local XY.
 */
export function baseHeartXY(t) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return new THREE.Vector2(x, y);
}

/**
 * Build a high-resolution closed polyline approximation of the heart.
 * samples: number of segments; we return (samples + 1) points with the last = first.
 */
export function buildHeartPolyline(samples = 4096) {
  const ring = new Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    ring[i] = baseHeartXY(t);
  }
  return ring;
}

/**
 * Precompute segment lengths and total arc length for the unscaled polyline.
 */
export function segmentLengths(ring /* Vector2[] */) {
  const segLen = new Array(ring.length - 1);
  let L = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = ring[i + 1].distanceTo(ring[i]);
    segLen[i] = d;
    L += d;
  }
  return { segLen, L };
}
