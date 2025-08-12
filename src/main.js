// src/main.js
import { THREE } from './core/three.js';
import { createApp } from './core/app.js';
import { buildSkyDome } from './env/sky.js';
import { buildGrassPatch } from './env/grassPatch.js';
import { createSystem } from './sim/system.js';
import { updateHeartFrame } from './sim/heart.js';
import { initUI } from './ui/panel.js';
import { CARD_H } from './cards/mesh.js';
import { loadImageDeck } from './cards/imageDeck.js';
import { FrameBorderOverlay } from './overlay/frameBorderOverlay.js';

const container = document.getElementById('renderer');
const overlay   = document.getElementById('overlay');
const { scene, camera, renderer, controls } = createApp(container, overlay);

// Overlay frame (HUD) — normals + texture blend
const frameOverlay = new FrameBorderOverlay({
  url: '/assets/overlay.glb',
  marginV: 0.01,
  marginH: 0.01,
  distance: 2.0,
  renderOnTop: true,
  scalingMode: 'stretch',
  lighting: 'normals',     // show texture blended with normals
  mixStrength: 0.6         // 0=only texture, 1=only normals
});
await frameOverlay.load();
frameOverlay.addTo(scene);

// Robust resize using ResizeObserver (works in grid/flex containers)
const ro = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
});
ro.observe(container);

// Environment
const sky = buildSkyDome({ radius: 800 });
scene.add(sky);

const grassPatch = buildGrassPatch({ radius: 3.8, bladeCount: 5000, groundRepeat: 7 });
scene.add(grassPatch);

// Load image deck & system (ONE CARD PER IMAGE)
const imageDeck = await loadImageDeck('/assets/images/');
const trails = new THREE.Group();
scene.add(trails);
const system = createSystem(scene, trails, imageDeck);

// One-time initial placement (camera & grass)
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

  grassPatch.position.set(bx, by - gap, bz);
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

// Keep grass under current bottom of heart every frame (with dead-zone + Y-only smoothing)
const _grassState = {
  prevTarget: new THREE.Vector3(0, 0, 0),
  initialized: false
};
function updateGrassUnderHeart() {
  const bounds = system.getHeartBoundsWorld && system.getHeartBoundsWorld();
  const bottom = system.getHeartBottomWorld && system.getHeartBottomWorld();
  if (!bounds || !bottom) return;

  const heartH = Math.max(bounds.size.y, 1e-4);
  const gap = 0.10 * heartH + 0.008 * Math.sqrt(Math.max(1, imageDeck.length)) * CARD_H;

  const target = new THREE.Vector3(bottom.x, bottom.y - gap, bottom.z);

  // Dead-zone: ignore tiny jitter under ~2mm
  const DEAD = 0.002 * heartH;
  const dx = Math.abs(target.x - _grassState.prevTarget.x);
  const dz = Math.abs(target.z - _grassState.prevTarget.z);
  const dy = Math.abs(target.y - _grassState.prevTarget.y);

  if (!_grassState.initialized) {
    grassPatch.position.copy(target);
    _grassState.prevTarget.copy(target);
    _grassState.initialized = true;
    return;
  }

  const newPos = grassPatch.position.clone();

  // X/Z snap only if movement is significant to avoid lateral “swim”
  if (dx > DEAD) newPos.x = THREE.MathUtils.lerp(newPos.x, target.x, 0.3);
  if (dz > DEAD) newPos.z = THREE.MathUtils.lerp(newPos.z, target.z, 0.3);

  // Y always smooth (slightly stronger to avoid overlap)
  newPos.y = THREE.MathUtils.lerp(newPos.y, target.y, 0.35);

  grassPatch.position.copy(newPos);
  _grassState.prevTarget.copy(target);
}

// UI (count ignored — one card per image)
const ui = initUI();
ui.onInput(() => {
  system.prepareHeartTargets(); // deck length drives targets
});

// Init pool & frame once
system.ensureCardCount(ui.values().power);
initialPlaceCameraAndGrass(0.60);

// Render loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);
  frameOverlay.update(camera);
  system.step(dt, ui.values(), camera);
  updateGrassUnderHeart();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
  system.reset(ui.values().power);
});
