import { CARD_MARGIN_ABS, SIDE_BUFFER_ABS } from './constants.js';
import { generateHeartPointsVariable } from '../heart.js';
import { heartLocalToWorld as _hl2w } from '../heart.js';
import { CARD_H } from '../../cards/mesh.js';

export function generateTargets(state) {
  const n = state.cards.length;
  if (!n) { state._targets = []; return; }

  const spacings = new Array(n);
  for (let i = 0; i < n; i++) {
    const w = state.cards[i].cardWidth || (CARD_H * 1.0);
    spacings[i] = Math.max(1e-4, w + CARD_MARGIN_ABS + 2 * SIDE_BUFFER_ABS);
  }

  const pts = generateHeartPointsVariable(spacings);
  for (let i = 0; i < n; i++) {
    state.cards[i].targetLocal = pts[i % pts.length].clone();
  }

  // Public bounds helpers (avoid recompute per frame)
  state.publicAPI.getHeartBoundsWorld = function() {
    if (!pts.length) return null;
    const min = { x: +Infinity, y: +Infinity, z: +Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of pts) {
      const w = _hl2w(p);
      if (w.x < min.x) min.x = w.x; if (w.y < min.y) min.y = w.y; if (w.z < min.z) min.z = w.z;
      if (w.x > max.x) max.x = w.x; if (w.y > max.y) max.y = w.y; if (w.z > max.z) max.z = w.z;
    }
    const center = new THREE.Vector3((min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2);
    const size = new THREE.Vector3(max.x-min.x, max.y-min.y, max.z-min.z);
    return { center, size, minY: min.y, maxY: max.y, min, max };
  };

  state.publicAPI.getHeartBottomWorld = function() {
    if (!pts.length) return null;
    let best = null, minY = Infinity;
    for (const p of pts) {
      const w = _hl2w(p);
      if (w.y < minY) { minY = w.y; best = w; }
    }
    return best ? best.clone() : null;
  };
}

// passthrough for consumers
export const heartLocalToWorld = _hl2w;

// NOTE: import THREE locally to avoid circulars in build setups
import { THREE } from '../../core/three.js';
