import { GRAVITY, DRAG } from './constants.js';

export function integrateFlying(obj, dt) {
  obj.age += dt;

  const ax = -DRAG * obj.velocity.x;
  const ay = GRAVITY.y - DRAG * obj.velocity.y;
  const az = -DRAG * obj.velocity.z;

  obj.velocity.x += ax * dt;
  obj.velocity.y += ay * dt;
  obj.velocity.z += az * dt;

  obj.group.position.x += obj.velocity.x * dt;
  obj.group.position.y += obj.velocity.y * dt;
  obj.group.position.z += obj.velocity.z * dt;
}
