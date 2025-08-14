import { HOMING_POS_SPEED } from './constants.js';

export function homeTowards(obj, targetWorld, dt) {
  const posFactor = 1 - Math.exp(-dt * HOMING_POS_SPEED);
  obj.group.position.lerp(targetWorld, posFactor);
  obj.velocity.multiplyScalar(0.85);
  obj.angular.multiplyScalar(0.85);
}
