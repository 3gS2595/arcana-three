// src/sim/heart/frame.js
import { THREE } from '../../core/three.js';

// Final destination / anchor of the heart in world space.
// Set to the SCENE ORIGIN so cards home to the center of the scene.
export const HEART_CENTER = new THREE.Vector3(0, 0, 0);

// A virtual frame that always faces the camera.
// Local heart points (XY plane) convert to world via this frame.
export const heartFrame = new THREE.Object3D();

/**
 * Align the heart plane to face the current camera.
 * Call this once per frame, before using heartLocalToWorld().
 */
export function updateHeartFrame(camera) {
  heartFrame.position.copy(HEART_CENTER);
  heartFrame.lookAt(camera.position);
}

/**
 * Convert a local heart-space point (XY in the heart frame) into world space.
 */
export function heartLocalToWorld(v) {
  return v.clone().applyQuaternion(heartFrame.quaternion).add(heartFrame.position);
}
