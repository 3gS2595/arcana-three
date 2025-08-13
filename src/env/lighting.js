// src/env/lighting.js
import { THREE } from '../core/three.js';

/**
 * Make the scene look like "flat file preview":
 * - No directional/hemisphere shading
 * - No fog
 * - No tone mapping
 * - Uniform AmbientLight so textures are shown as-is
 *
 * This ONLY changes scene lighting / renderer settings.
 */
export function setupFlatLighting(scene, renderer) {
  // 1) Remove any existing lights in the scene
  const toRemove = [];
  scene.traverse(obj => {
    if (obj.isLight) toRemove.push(obj);
  });
  for (const l of toRemove) {
    if (l.parent) l.parent.remove(l);
  }

  // 2) Disable fog (keeps colors/crispness intact)
  scene.fog = null;

  // 3) Make renderer show textures without tone mapping shifts
  if (renderer) {
    renderer.toneMapping = THREE.NoToneMapping;
    // keep sRGB output so UI/texture colors look correct
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
  }

  // 4) Add a single ambient light for uniform illumination
  const ambient = new THREE.AmbientLight(0xffffff, 2.0);
  scene.add(ambient);
}
