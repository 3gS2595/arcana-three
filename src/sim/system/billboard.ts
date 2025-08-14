import { BILLBOARD_MODE, BILLBOARD_MAX_DEG_PER_SEC } from './constants.js';

export function billboardTowardCamera(obj, camera, dt) {
  const target = new THREE.Object3D();
  target.position.copy(obj.group.position);
  target.up.set(0,1,0);
  target.lookAt(camera.position);
  const qTarget = target.quaternion;

  if (BILLBOARD_MODE === 'instant') {
    obj.group.quaternion.copy(qTarget);
    return;
  }
  const qCurrent = obj.group.quaternion;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(qCurrent.dot(qTarget))));
  if (angle < 1e-4) { obj.group.quaternion.copy(qTarget); return; }
  const maxRad = (BILLBOARD_MAX_DEG_PER_SEC * Math.PI / 180) * dt;
  const t = Math.min(1, maxRad / angle);
  obj.group.quaternion.slerp(qTarget, t);
}

// NOTE: import THREE locally to avoid circulars in build setups
import { THREE } from '../../core/three.js';
