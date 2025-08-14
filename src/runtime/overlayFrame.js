// src/runtime/overlayFrame.js
import { FrameBorderOverlay } from '../overlay/frameBorderOverlay.js';

/**
 * Creates and attaches the camera-locked frame overlay with preserved defaults.
 * Returns the overlay instance so main can call overlay.update(camera) per-frame.
 */
export async function setupFrameOverlay(scene) {
  const frameOverlay = new FrameBorderOverlay({
    url: '/assets/overlay.glb',
    marginV: 0.01,
    marginH: 0.01,
    distance: 2.0,
    renderOnTop: true,
    scalingMode: 'stretch',
    lighting: 'normals',
    mixStrength: 0.6
  });
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
