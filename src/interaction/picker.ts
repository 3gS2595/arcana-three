// src/interaction/picker.js
import { THREE } from '../core/three.js';

/**
 * createPicker
 * Raycasts against the card groups only (not the whole scene) for robust performance.
 * Returns { pick(clientX, clientY) } -> card or null.
 */
export function createPicker(camera, renderer, system) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function worldPick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    const roots = system.cards.map(c => c.group);
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      // Walk up parents until a root card group is found
      let o = h.object;
      while (o) {
        const card = system.cards.find(c => c.group === o);
        if (card) return card;
        o = o.parent;
      }
    }
    return null;
  }

  return { pick: worldPick };
}
