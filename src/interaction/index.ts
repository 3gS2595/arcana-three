// src/interaction/index.ts
// Aggregates all interaction modules; main.ts stays feature-agnostic.
import { createFocusController, onCardSelect, onCardRelease } from "./focusController";

export function createInteractions({ camera, scene, renderer, system }: any) {
  const focus = createFocusController({
    camera,
    scene,
    renderer,
    system,
    options: {
      distance: 0.8,      // in front of camera
      margin: 0.65,       // 1.0 = exact fit, <1 inset
      fitMode: "contain", // full image visible
      animDur: 0.75       // smooth timing
    }
  });

  return {
    update(dt: number) { focus.update(dt); },
    clear() { focus.clear(); },
    dispose() { focus.dispose(); }
  };
}

// Re-export selection events for convenience.
export { onCardSelect, onCardRelease } from "./focusController";
