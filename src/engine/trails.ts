// src/sim/trails.js
import { THREE } from '../core/three.js';
import { CARD_T } from '../cards/mesh.js';

/**
 * Creates a trail line (single polyline with a fixed-length buffer).
 */
export function makeTrail(color = 0x00ff00, maxPoints = 40) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(maxPoints * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,
    fog: true
  });

  const line = new THREE.Line(geom, mat);
  line.userData = {
    positions,
    max: maxPoints,
    count: 0,
    decayPtsPerSec: 24, // points removed per second when idle
    minMoveSq: 0.0006,  // kept for compatibility (unused here directly)
  };

  return line;
}

/**
 * Compute a trail head position on the *front face* of the card so the
 * line visually vanishes INTO the image, not at the card's center.
 * Exported so the simulation can detect "reorientation movement" too.
 */
export function computeTrailHead(obj, camera) {
  const frontOffset = CARD_T * 0.9; // nudge to front face
  const dir = new THREE.Vector3().subVectors(camera.position, obj.group.position).normalize();
  return new THREE.Vector3().copy(obj.group.position).addScaledVector(dir, frontOffset);
}

/**
 * Update a trail with either movement insertion or idle decay.
 * - If `moving === true`: shift buffer and insert the current head (card front).
 * - Else: shrink drawRange toward 0 at `decayPtsPerSec`.
 */
export function updateTrail(obj, dt, moving, camera) {
  const line = obj.trail;
  const data = line.userData;
  const { positions, max } = data;

  // Keep head at the card face position for visual continuity
  const head = computeTrailHead(obj, camera);

  if (moving) {
    // Grow up to max points
    const nextCount = Math.min(data.count + 1, max);

    // Shift existing points back by one
    for (let i = nextCount - 1; i > 0; i--) {
      positions[i * 3 + 0] = positions[(i - 1) * 3 + 0];
      positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
      positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
    }

    // New head
    positions[0] = head.x;
    positions[1] = head.y;
    positions[2] = head.z;

    data.count = nextCount;
    line.geometry.setDrawRange(0, nextCount);
    line.geometry.attributes.position.needsUpdate = true;
    return;
  }

  // Not moving → decay the trail length toward 0
  if (data.count > 0) {
    // Keep head exactly on the card face so the tip visually touches the image
    positions[0] = head.x;
    positions[1] = head.y;
    positions[2] = head.z;

    const drop = Math.max(1, Math.floor(data.decayPtsPerSec * dt));
    const newCount = Math.max(0, data.count - drop);

    data.count = newCount;
    line.geometry.setDrawRange(0, newCount);
    line.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * Immediately erase a trail (used when toggling paths off).
 */
export function clearTrail(obj) {
  const line = obj.trail;
  const data = line.userData;
  data.count = 0;
  line.geometry.setDrawRange(0, 0);
  line.geometry.attributes.position.needsUpdate = true;
}
