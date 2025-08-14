import { THREE } from "@/core/three";
import { createApp } from "@/core/app";
import { createSystem } from "@/engine/system";
import { updateHeartFrame } from "@/engine/heart";
import { CARD_H } from "@/cards/mesh";
import { setupFlatLighting } from "@/environment/lighting";
import { runBoot } from "@/runtime/boot";
import { createInteractions } from "@/interaction";
// Keep your existing overlays:
import { setupCloudBorder } from "@/overlay/cloudBorder";   // 2.5D slab
import { setupCloudSwarm } from "@/overlay/cloudSwarm";     // particles (optional)
// NEW: multi-shell volumetric ring
import { setupCloudShells } from "@/overlay/cloudShells";

const container = document.getElementById("renderer") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const { scene, camera, renderer, controls } = createApp(container, overlay);

// boot
const { frameOverlay, imageDeck } = await runBoot(scene);

// --- Overlays --------------------------------------------------------------
// (A) Optional: subtle border fog (existing)
const cloudOverlay = setupCloudBorder(scene, {
  distance: 2.0,
  innerMarginH: 0.02,
  innerMarginV: 0.02,
  ringWidthH: 0.0,
  ringWidthV: 0.0,
  density: 0.9,
  speed: 0.05,
  opacity: 0.85,
  renderAboveFrame: true,
  debugMode: 0
});

// (B) Optional: particle swarm (keep OFF for now to avoid visual clutter)
// const cloudSwarm = setupCloudSwarm(scene, {
//   distance: 2.0, count: 7000, innerMarginH: 0.03, innerMarginV: 0.03,
//   ringWidthH: 0.18, ringWidthV: 0.18, thickness: 0.45, speed: 0.08, size: 7.0, density: 1.0
// });

// (C) NEW: multi-shell volumetric ring (primary visual)
const cloudShells = setupCloudShells(scene, {
  distance: 8.0,
  layers: 7,          // try 9 or 11 if you want thicker fog
  thicknessZ: 0.6,    // world units spread across shells
  innerMarginH: 0.00,
  innerMarginV: 0.00,
  ringWidthH: 0.8,
  ringWidthV: 0.8,
  speed: 0.06,
  density: 0.95,
  strength: 1.0,
    renderAboveFrame: true,
  renderOrderBase: 9920
});

// resize
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    overlay.width = width;
    overlay.height = height;
  }
});
ro.observe(container);

// env
setupFlatLighting(scene, renderer);

// sim
const trails = new THREE.Group();
scene.add(trails);
const system = createSystem(scene, trails, imageDeck);

// UI defaults (headless)
const UI = {
  values: () => ({
    count: 60,
    power: 1000,
    showPaths: true,
    spin: true
  })
};

// camera placement vs heart
function initialPlaceCameraAndGrass(occupancy = 0.6) {
  updateHeartFrame(camera);
  const bounds = system.getHeartBoundsWorld?.();
  if (!bounds) return;

  const { center, size, minY, maxY } = bounds;
  const bottomP = system.getHeartBottomWorld?.();
  const bx = bottomP ? bottomP.x : center.x;
  const by = bottomP ? bottomP.y : minY;
  const bz = bottomP ? bottomP.z : center.z;

  const heartH = Math.max(size.y, 1e-4);
  const gap = 0.1 * heartH + 0.008 * Math.sqrt(Math.max(1, imageDeck.length)) * CARD_H;

  // @ts-expect-error external
  if (typeof grassPatch !== "undefined") {
    // @ts-expect-error external
    grassPatch.position.set(bx, by - gap, bz);
    // @ts-expect-error external
    grassPatch.scale.set(1, 1, 1);
  }

  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const halfTan = Math.tan(vFOV / 2);
  const spanH = maxY - (by - gap);
  const spanW = Math.max(size.x, 1e-4);
  const distH = spanH / (2 * halfTan * occupancy);
  const distW = spanW / (2 * halfTan * camera.aspect * occupancy);
  const distance = Math.max(distH, distW) * 1.05;

  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + distance);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}

initialPlaceCameraAndGrass(0.6);

// interactions
const interactions = createInteractions({ camera, scene, renderer, system });

// loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);

  // overlays update
  frameOverlay.update(camera);
  cloudOverlay.update(camera, dt);
  cloudShells.update(camera, dt);
  // if (cloudSwarm) cloudSwarm.update(camera, dt);

  interactions.update(dt);
  system.step(dt, UI.values(), camera);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") {
    interactions.clear();
    system.reset(UI.values().power);
  }
});
