import { THREE } from "@/core/three";
import { createApp } from "@/core/app";
import { createSystem } from "@/engine/system";
import { updateHeartFrame } from "@/engine/heart";
import { CARD_H } from "@/cards/mesh";
import { setupFlatLighting } from "@/environment/lighting";
import { runBoot } from "@/runtime/boot";
import { createInteractions } from "@/interaction";
import { createCloudsEffect } from "@/effects/clouds";

const container = document.getElementById("renderer") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const { scene, camera, renderer, controls } = createApp(container, overlay);

// boot
const { frameOverlay, imageDeck } = await runBoot(scene);

// resize
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    overlay.width = width;
    overlay.height = height;

    clouds.resize(width, height);
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

// camera placement vs heart (kept)
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

  // @ts-expect-error grassPatch preserved
  grassPatch.position.set(bx, by - gap, bz);
  // @ts-expect-error grassPatch preserved
  grassPatch.scale.set(1, 1, 1);

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

// Clouds with staging ------------------------------------------
const clouds = createCloudsEffect(renderer, camera);
// Hotkeys to step stages:
// 1 = FSQ gradient -> screen
// 2 = gradient -> RT -> composite
// 3 = show mask render target
// 6 = full clouds
window.addEventListener("keydown", (e) => {
  const k = e.key;
  if (k === "1" || k === "2" || k === "3" || k === "6") {
    // @ts-ignore
    const stage = parseInt(k, 10);
    clouds.setStage(stage as any);
  }
});
// ----------------------------------------------------------------

// loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());

  // Prepare mask for clouds BEFORE scene render (stage >= 3 only)
  clouds.prepare(dt);

  controls.update();
  updateHeartFrame(camera);
  frameOverlay.update(camera);

  interactions.update(dt);
  system.step(dt, UI.values(), camera);

  // normal scene
  renderer.render(scene, camera);

  // Composite clouds AFTER scene render
  clouds.draw(dt);

  requestAnimationFrame(render);
}
render();

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") {
    interactions.clear();
    system.reset(UI.values().power);
  }
});
