// src/interaction/focus/sizing.js
import { THREE } from '../../core/three.js';
import { CARD_H } from '../../cards/mesh.js';

/** Aspect helper based on built width captured in system.state */
export function cardAspect(card) {
  return Math.max(0.05, (card.cardWidth || (CARD_H * 1.0)) / CARD_H);
}

/** View size at a distance along camera forward (projective geometry) */
export function viewSizeAt(camera, distance) {
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const viewH = 2 * Math.tan(vFOV / 2) * distance;
  const viewW = viewH * camera.aspect;
  return { viewW, viewH };
}

/**
 * Compute the focus scale so the full image is visible:
 * - 'height' fits to view height
 * - 'contain' fits to the smaller of (view width, view height) respecting aspect
 * The extra 'margin' shrinks a bit to leave some breathing room.
 */
export function computeFocusScale(camera, card, { distance, fitMode, margin }) {
  const { viewW, viewH } = viewSizeAt(camera, distance);
  const a = cardAspect(card);
  const heightFit = (viewH * margin) / CARD_H;
  const widthFit  = (viewW * margin) / (CARD_H * a);
  return (fitMode === 'height') ? heightFit : Math.min(heightFit, widthFit);
}

/** World‐space target position and quaternion in front of camera at 'distance'. */
export function computeFocusTargetWorld(camera, distance) {
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  const pos = camPos.clone().add(camDir.multiplyScalar(distance));
  // Capture camera's world quaternion NOW to avoid last-frame snaps later.
  const quat = camera.getWorldQuaternion(new THREE.Quaternion());
  return { pos, quat };
}
