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
    fur: {
      enabled: true,
      density: 10000,      // more plush
      length: 0.1, // auto
      radius: 0.0025,    // thick
      color: 0xff4da6,   // pink
      tipColor: 0xffffff,
      randomness: 0.22,  // mild per-strand tilt
      onTop: true,
      seed: 2595,
      // NEW: gravity bend controls
      sag: 0.9,          // 0..0.9 — bigger = droopier
      lateral: 0.35      // 0..1 — sideways flavor mixed in
    }
  });
  await frameOverlay.load();
  frameOverlay.addTo(scene);
  return frameOverlay;
}
