// src/interaction/focus/attachment.js
import { THREE } from '../../core/three.js';

/**
 * Manages a camera-anchored focus point so focused cards become static relative to the camera.
 * We use Object3D#attach to preserve world transforms during reparenting.
 */
export function createFocusAttachment(camera, distance) {
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0, -distance); // negative Z in camera space = in front of camera
  camera.add(anchor);

  function attachCardGroup(group, targetScale) {
    anchor.updateWorldMatrix(true, false);
    anchor.attach(group);           // preserve world transform
    group.position.set(0, 0, 0);    // lock to anchor origin
    group.quaternion.identity();    // match camera orientation via identity in local space
    group.scale.setScalar(targetScale);
  }

  function detachPreserveWorld(group, scene) {
    const worldPos = group.getWorldPosition(new THREE.Vector3());
    const worldQuat = group.getWorldQuaternion(new THREE.Quaternion());
    const worldScale = group.scale.x;

    if (group.parent !== scene) scene.add(group);
    group.position.copy(worldPos);
    group.quaternion.copy(worldQuat);
    group.scale.setScalar(worldScale);
  }

  function dispose() {
    if (anchor.parent) anchor.parent.remove(anchor);
  }

  return { anchor, attachCardGroup, detachPreserveWorld, dispose };
}
