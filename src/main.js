// src/main.js
import { THREE } from './core/three.js';
import { createApp } from './core/app.js';
import { buildSkyDome } from './env/sky.js';
import { createSystem } from './sim/system.js';
import { updateHeartFrame } from './sim/heart.js';
import { CARD_H } from './cards/mesh.js';
import { loadImageDeck } from './cards/imageDeck.js';
import { FrameBorderOverlay } from './overlay/frameBorderOverlay.js';
import { setupFlatLighting } from './env/lighting.js';

const container = document.getElementById('renderer');
const overlay   = document.getElementById('overlay');
const { scene, camera, renderer, controls } = createApp(container, overlay);

// Camera-locked overlay (unchanged)
const frameOverlay = new FrameBorderOverlay({
  url: '/assets/overlay.glb',
  marginV: 0.01,
  marginH: 0.01,
  distance: 2.0,
  renderOnTop: true,
  scalingMode: 'stretch',
  lighting: 'normals',
  mixStrength: 0.6
});
await frameOverlay.load();
frameOverlay.addTo(scene);

// Resize
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

// Environment (kept)
const sky = buildSkyDome({ radius: 800 });
scene.add(sky);

// Lighting
setupFlatLighting(scene, renderer);

// Data & sim
const imageDeck = await loadImageDeck('/assets/images/');
const trails = new THREE.Group();
scene.add(trails);
const system = createSystem(scene, trails, imageDeck);

// ---- Headless "UI" defaults (since side panel is gone) ----
const UI = {
  // count is ignored (deck size drives card count)
  values: () => ({
    count: 60,
    power: 1000,       // strong fountain, as before
    showPaths: true,   // keep trails visible
    spin: true         // spin cards while flying
  })
};

// Initial placement (unchanged logic)
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

// Grass follow (unchanged)
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
    grassPatch.position.copy(target);
    _grassState.prevTarget.copy(target);
    _grassState.initialized = true;
    return;
  }

  const newPos = grassPatch.position.clone();
  if (Math.abs(target.x - _grassState.prevTarget.x) > DEAD) newPos.x = THREE.MathUtils.lerp(newPos.x, target.x, 0.3);
  if (Math.abs(target.z - _grassState.prevTarget.z) > DEAD) newPos.z = THREE.MathUtils.lerp(newPos.z, target.z, 0.3);
  newPos.y = THREE.MathUtils.lerp(newPos.y, target.y, 0.35);
  grassPatch.position.copy(newPos);
  _grassState.prevTarget.copy(target);
}

// Boot
system.ensureCardCount(UI.values().power);
initialPlaceCameraAndGrass(0.60);

// Render loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);
  frameOverlay.update(camera);
  system.step(dt, UI.values(), camera);
  updateGrassUnderHeart();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Optional: keyboard reset since the button is gone
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') system.reset(UI.values().power);
});
