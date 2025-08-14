import { THREE } from '../core/three.js';

export function setupFlatLighting(scene, renderer) {
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x203024, 0.8);
  const dir = new THREE.DirectionalLight(0xffffff, 1.05);
  dir.position.set(25, 50, -20);
  dir.target.position.set(0, 2.5, 0);

  const amb = new THREE.AmbientLight(0xffffff, 3.1);

  scene.add(amb);
}
