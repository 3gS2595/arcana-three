// src/interaction/index.js
// Aggregates all interaction modules; main.js stays feature-agnostic.
import { createFocusController } from './focusController.js';

export function createInteractions({ camera, scene, renderer, system }) {
  const focus = createFocusController({
    camera, scene, renderer, system,
    options: {
      distance: 0.8,       // in front of camera
      margin: 0.65,         // 1.0 = exact fit, <1 inset
      fitMode: 'contain' ,
      animDur: 2  // 'contain' (full image visible) or 'height' (touch top/bottom)
    }
  });

  return {
    update(dt) {
      focus.update(dt);
    },
    clear() {
      focus.clear();
    },
    dispose() {
      focus.dispose();
    }
  };
}
