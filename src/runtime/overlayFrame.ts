import { FrameBorderOverlay } from "@/overlay/frameBorderOverlay";
import type { THREE } from "@/core/three";

export async function setupFrameOverlay(scene: THREE.Scene) {
  const frameOverlay = new FrameBorderOverlay({
    url: "/assets/overlay.glb",
    marginV: 0.01,
    marginH: 0.01,
    distance: 2.0,
    renderOnTop: true,
    scalingMode: "stretch",
    lighting: "normals",
    mixStrength: 0.6
  });
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
