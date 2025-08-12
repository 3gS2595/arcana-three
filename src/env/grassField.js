import { THREE } from '../core/three.js';
import { makeGrassTexture } from './grassTexture.js';

export function buildGrassField({radius=200, repeat=60} = {}) {
  const geom = new THREE.CircleGeometry(radius, 128);
  geom.rotateX(-Math.PI/2);

  const grass = makeGrassTexture({});
  grass.repeat.set(repeat, repeat);

  const mat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1.0, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = false;
  return mesh;
}
