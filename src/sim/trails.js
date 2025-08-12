import { THREE } from '../core/three.js';

export function makeTrail(color = 0xff0000, maxPoints = 40) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(maxPoints * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setDrawRange(0, 0);

  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      fog: true
    })
  );
  line.userData = { max: maxPoints, count: 0, positions };
  return line;
}

export function updateTrail(obj) {
  const { positions, max } = obj.trail.userData;
  let count = obj.trail.userData.count;
  if (count < max) count++;
  for (let i = count-1; i > 0; i--) {
    positions[i*3+0] = positions[(i-1)*3+0];
    positions[i*3+1] = positions[(i-1)*3+1];
    positions[i*3+2] = positions[(i-1)*3+2];
  }
  positions[0] = obj.group.position.x;
  positions[1] = obj.group.position.y;
  positions[2] = obj.group.position.z;
  obj.trail.userData.count = count;
  obj.trail.geometry.setDrawRange(0, count);
  obj.trail.geometry.attributes.position.needsUpdate = true;
}
