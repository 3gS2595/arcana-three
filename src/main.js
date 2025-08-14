// src/main.js
import { THREE } from './core/three.js';
import { createApp } from './core/app.js';
import { buildSkyDome } from './env/sky.js';
import { createSystem } from './sim/system.js';
import { updateHeartFrame } from './sim/heart.js';
import { CARD_H } from './cards/mesh.js';
import { setupFlatLighting } from './env/lighting.js';
import { runBoot } from './runtime/boot.js';
import { createInteractions } from './interaction/index.js';

const container = document.getElementById('renderer');
const overlay   = document.getElementById('overlay');
const { scene, camera, renderer, controls } = createApp(container, overlay);

// Use boot sequence: shows progress, loads overlay GLB + images, waits for Start
const { frameOverlay, imageDeck } = await runBoot(scene);

// After Start is clicked, viewport is shown — now finish wiring the scene:

// Resize (kept behavior)
const ro = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    overlay.width = width; overlay.height = height;
  }
});
ro.observe(container);

// Environment & lighting
const sky = buildSkyDome({ radius: 800 });
scene.add(sky);
setupFlatLighting(scene, renderer);

// Data & sim
const trails = new THREE.Group();
scene.add(trails);
const system = createSystem(scene, trails, imageDeck);

// Headless “UI” defaults
const UI = {
  values: () => ({
    count: 60,
    power: 1000,
    showPaths: true,
    spin: true
  })
};

// ----- Camera placement & grass follow (unchanged logic) -----
function initialPlaceCameraAndGrass(occupancy = 0.60) {
  updateHeartFrame(camera);

  const bounds = system.getHeartBoundsWorld && system.getHeartBoundsWorld();
  if (!bounds) return;

  const { center, size, minY, maxY } = bounds;
  const bottomP = system.getHeartBottomWorld && system.getHeartBottomWorld();
  const bx = bottomP ? bottomP.x : center.x;
  const by = bottomP ? bottomP.y : minY;
  const bz = bottomP ? bottomP.z : center.z;

  const heartH = Math.max(size.y, 1e-4);
  const gap = 0.10 * heartH + 0.008 * Math.sqrt(Math.max(1, imageDeck.length)) * CARD_H;

  // NOTE: grassPatch is defined elsewhere in your project; preserved as-is
  // eslint-disable-next-line no-undef
  grassPatch.position.set(bx, by - gap, bz);
  // eslint-disable-next-line no-undef
  grassPatch.scale.set(1, 1, 1);

  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const halfTan = Math.tan(vFOV / 2);
  const spanH = (maxY - (by - gap));
  const spanW = Math.max(size.x, 1e-4);
  const distH = spanH / (2 * halfTan * occupancy);
  const distW = spanW / (2 * halfTan * camera.aspect * occupancy);
  const distance = Math.max(distH, distW) * 1.05;

  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + distance);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}

const _grassState = { prevTarget: new THREE.Vector3(0,0,0), initialized: false };
function updateGrassUnderHeart() {
  const bounds = system.getHeartBoundsWorld?.();
  const bottom = system.getHeartBottomWorld?.();
  if (!bounds || !bottom) return;

  const heartH = Math.max(bounds.size.y, 1e-4);
  const gap = 0.10 * heartH + 0.008 * Math.sqrt(Math.max(1, imageDeck.length)) * CARD_H;
  const target = new THREE.Vector3(bottom.x, bottom.y - gap, bottom.z);

  const DEAD = 0.002 * heartH;
  if (!_grassState.initialized) {
    // eslint-disable-next-line no-undef
    grassPatch.position.copy(target);
    _grassState.prevTarget.copy(target);
    _grassState.initialized = true;
    return;
  }

  // eslint-disable-next-line no-undef
  const newPos = grassPatch.position.clone();
  if (Math.abs(target.x - _grassState.prevTarget.x) > DEAD) newPos.x = THREE.MathUtils.lerp(newPos.x, target.x, 0.3);
  if (Math.abs(target.z - _grassState.prevTarget.z) > DEAD) newPos.z = THREE.MathUtils.lerp(newPos.z, target.z, 0.3);
  newPos.y = THREE.MathUtils.lerp(newPos.y, target.y, 0.35);
  // eslint-disable-next-line no-undef
  grassPatch.position.copy(newPos);
  _grassState.prevTarget.copy(target);
}

// Boot-time: size pool & set camera before starting loop
system.ensureCardCount(UI.values().power);
// Force a clean spawn pass so cards are visibly emitted right after Start
system.reset(UI.values().power);
initialPlaceCameraAndGrass(0.60);

// Interactions (focus click-in/out)
const interactions = createInteractions({ camera, scene, renderer, system });

// Render loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);
  frameOverlay.update(camera);

  interactions.update(dt);
  system.step(dt, UI.values(), camera);
  updateGrassUnderHeart();

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Keyboard reset (kept)
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') {
    interactions.clear();
    system.reset(UI.values().power);
  }
});
