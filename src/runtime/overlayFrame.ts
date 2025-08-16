import { FrameBorderOverlay } from "@/overlay/frameBorderOverlay";
import type { THREE } from "@/core/three";
import overlayUrl from "@/assets/overlay.glb?url";

export async function setupFrameOverlay(scene: THREE.Scene) {
  const frameOverlay = new FrameBorderOverlay({
    url: overlayUrl,
    marginV: 0.01,
    marginH: 0.01,
    distance: 2.0,
    renderOnTop: true,
    scalingMode: "stretch",
    lighting: "normals",
    mixStrength: 0.6,
    furLines: {
      enabled: true,
      density: 16000,
      // your requested params:
      color: 0xff4da6,      // base/root color
      tipColor: 0xffffff,   // tip color
      baseRadius: 0.0025,   // world-units radius (converted to px)
      length: 0.1,          // world-units strand length
      // motion
      intensity: undefined, // defaults to 0.5 * length
      speed: 0.6,
      onTop: true,
      seed: 2595
    }
  });
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
