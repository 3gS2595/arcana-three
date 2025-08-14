import { FrameBorderOverlay } from "@/overlay/frameBorderOverlay";
import type { THREE } from "@/core/three";
// import overlay as a module URL so Vite serves it correctly
import overlayUrl from "@/assets/overlay.glb?url";

export async function setupFrameOverlay(scene: THREE.Scene) {
  const frameOverlay = new FrameBorderOverlay({
    url: overlayUrl,
    marginV: 0.09,
    marginH: 0.09,
    distance: 3.0,
    renderOnTop: true,
    scalingMode: "stretch",
    lighting: "normals",
    mixStrength: 0.6
  });
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
