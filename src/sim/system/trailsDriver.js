import { computeTrailHead } from '../trails.js';
import { LOCK_DIST_SQ, SPEED_EPS_SQ, HEAD_MOVE_EPS_SQ } from './constants.js';

export function decideTrail(obj, camera, dt, moving) {
  let moved = moving;
  if (obj.state !== 'flying') {
    const headNow = computeTrailHead(obj, camera);
    if (!obj.prevHead) obj.prevHead = headNow.clone();
    const headMoveSq = obj.prevHead.distanceToSquared(headNow);
    if (headMoveSq > HEAD_MOVE_EPS_SQ) moved = true;
    obj.prevHead.copy(headNow);
  }
  // movement thresholds in homing
  if (obj.state !== 'flying') {
    const speedSq = obj.velocity.lengthSq();
    moved = moved || (speedSq > SPEED_EPS_SQ);
  }
  return moved;
}
