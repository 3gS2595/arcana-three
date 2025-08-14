import { THREE } from "@/core/three";
import { createApp } from "@/core/app";
import { buildSkyDome } from "@/env/sky";
import { createSystem } from "@/sim/system";
import { updateHeartFrame } from "@/sim/heart";
import { CARD_H } from "@/cards/mesh";
import { setupFlatLighting } from "@/env/lighting";
import { runBoot } from "@/runtime/boot";
import { createInteractions } from "@/interaction";

const container = document.getElementById("renderer") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const { scene, camera, renderer, controls } = createApp(container, overlay);

// boot: progress, overlay GLB + images, wait for Start; overlay fades in inside runBoot
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
  }
});
ro.observe(container);

// env
const sky = buildSkyDome({ radius: 800 });
scene.add(sky);
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

// camera placement vs heart (grass calls kept as-is if present)
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

  // @ts-expect-error grassPatch is defined elsewhere in your project; preserved
  grassPatch.position.set(bx, by - gap, bz);
  // @ts-expect-error grassPatch is defined elsewhere in your project; preserved
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

// loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);
  frameOverlay.update(camera);

  interactions.update(dt);
  system.step(dt, UI.values(), camera);

  // @ts-expect-error grassPatch external; preserved
  if (typeof grassPatch !== "undefined") {
    // keep your existing follow logic if desired
  }

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
