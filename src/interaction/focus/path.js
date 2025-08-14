// src/interaction/focus/path.js
import { THREE } from '../../core/three.js';
import { HEART_CENTER } from '../../sim/heart.js';

/**
 * Standard cubic Bezier: P(t) = Σ B_i(t) * P_i
 * Returns OUT (or a new Vector3) at parameter t ∈ [0,1].
 */
export function cubicBezier(p0, p1, p2, p3, t, out = new THREE.Vector3()) {
  const it = 1 - t;
  const b0 = it * it * it;
  const b1 = 3 * it * it * t;
  const b2 = 3 * it * t * t;
  const b3 = t * t * t;
  return out
    .set(0, 0, 0)
    .addScaledVector(p0, b0)
    .addScaledVector(p1, b1)
    .addScaledVector(p2, b2)
    .addScaledVector(p3, b3);
}

/**
 * Build a gentle, heartward curve from p0 → p3.
 * P1 leans toward the heart center near the start; P2 only slightly near the end.
 * This yields a nice inward "bow" that straightens near the camera.
 */
export function makeCurveTowardCenter(p0, p3) {
  const center = new THREE.Vector3().copy(HEART_CENTER);
  const d0 = p0.distanceTo(center);
  const d3 = p3.distanceTo(center);

  const v0c = new THREE.Vector3().subVectors(center, p0).normalize();
  const v3c = new THREE.Vector3().subVectors(center, p3).normalize();

  // Tuned pulls: stronger near the start, lighter near the end.
  const k1 = Math.min(1.0, 0.45 * d0);
  const k2 = Math.min(1.0, 0.15 * d3);

  const p1 = new THREE.Vector3().copy(p0).addScaledVector(v0c, k1);
  const p2 = new THREE.Vector3().copy(p3).addScaledVector(v3c, k2);

  // Subtle lift to avoid clipping the heart bottom on long shots
  const lift = 0.12 * (d0 + d3);
  p1.y += lift * 0.25;
  p2.y += lift * 0.10;

  return { p0: p0.clone(), p1, p2, p3: p3.clone() };
}
