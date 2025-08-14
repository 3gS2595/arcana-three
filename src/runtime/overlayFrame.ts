import { FrameBorderOverlay } from "@/overlay/frameBorderOverlay";
import type { THREE } from "@/core/three";
// import overlay as a module URL so Vite serves it correctly
import overlayUrl from "@/assets/overlay.glb?url";

export async function setupFrameOverlay(scene: THREE.Scene) {
const frameOverlay = new FrameBorderOverlay({
  url: overlayUrl,
  marginV: 0.01,
  marginH: 0.01,
  distance: 2.0,
  renderOnTop: false,   // <-- allow depth test/write so clouds behind can be hidden by frame
  scalingMode: "stretch",
  lighting: "normals",
  mixStrength: 0.6
});
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
