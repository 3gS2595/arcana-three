import { THREE } from './core/three.js';
import { createApp } from './core/app.js';
import { buildSkyDome } from './env/sky.js';
import { buildGrassPatch } from './env/grassPatch.js';
import { createDeckTextures } from './cards/textures.js';
import { createSystem } from './sim/system.js';
import { updateHeartFrame } from './sim/heart.js';
import { initUI } from './ui/panel.js';
import { CARD_H } from './cards/mesh.js';
import { FrameBorderOverlay } from './overlay/frameBorderOverlay.js';

const container = document.getElementById('renderer');
const overlay   = document.getElementById('overlay');
const { scene, camera, renderer, controls } = createApp(container, overlay);

// Overlay
const frameOverlay = new FrameBorderOverlay({
  url: '/assets/overlay.glb',
  // keep vertical margin as-is (e.g., 6%), halve horizontal to 3%
  marginV: 0.01,
  marginH: 0.01,
  distance: 2.0,
  renderOnTop: true,
  scalingMode: 'stretch', // <- matches the window ratio (portrait/landscape)
    lighting: 'normals' // <- NEW mode

});
await frameOverlay.load();
frameOverlay.addTo(scene);

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

// Cards & sim
const { deck, back } = createDeckTextures();
const trails = new THREE.Group();
scene.add(trails);
const system = createSystem(scene, trails, deck, back);

// --- ONE-TIME initial framing (camera looks straight-on; grass just below heart) ---
function initialPlaceCameraAndGrass(occupancy = 0.60) {
  updateHeartFrame(camera);

  const bounds = system.getHeartBoundsWorld && system.getHeartBoundsWorld();
  if (!bounds) return;

  const { center, size, minY, maxY } = bounds;
  const count = system.cards?.length ?? 0;

  // Use precise lowest world-space point on the heart
  const bottomP = system.getHeartBottomWorld && system.getHeartBottomWorld();
  const bx = bottomP ? bottomP.x : center.x;
  const by = bottomP ? bottomP.y : minY;
  const bz = bottomP ? bottomP.z : center.z;

  // Place grass just BELOW that point (small, scale-aware gap)
  const heartH = Math.max(size.y, 1e-4);
  const gap    = 0.08 * heartH + 0.008 * Math.sqrt(Math.max(1, count)) * CARD_H;
  grassPatch.position.set(bx, by - gap, bz);
  grassPatch.scale.set(1, 1, 1);

  // One-time straight-on camera frame so (heart top .. grass) ≈ occupancy of viewport height
  const vFOV    = THREE.MathUtils.degToRad(camera.fov);
  const halfTan = Math.tan(vFOV / 2);
  const spanH   = (maxY - (by - gap));
  const spanW   = Math.max(size.x, 1e-4);

  const distH = spanH / (2 * halfTan * occupancy);
  const distW = spanW / (2 * halfTan * camera.aspect * occupancy);
  const distance = Math.max(distH, distW) * 1.05;

  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + distance);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}




// UI
const ui = initUI();
ui.onInput(() => {
  // Only update heart targets; do not touch camera or controls here
  system.prepareHeartTargets(ui.values().count);
});

// Initial pool + one-time framing
system.ensureCardCount(ui.values().count, ui.values().power);
initialPlaceCameraAndGrass(0.60);


function updateGrassUnderHeart() {
  const bounds = system.getHeartBoundsWorld && system.getHeartBoundsWorld();
  const bottom = system.getHeartBottomWorld && system.getHeartBottomWorld();
  if (!bounds || !bottom) return;

  const count = system.cards?.length ?? 0;
  // scale-aware gap so grass never intersects
  const heartH = Math.max(bounds.size.y, 1e-4);
  const gap    = 0.08 * heartH + 0.008 * Math.sqrt(Math.max(1, count)) * CARD_H;

  // optional smoothing to avoid micro-jitter as the heart eases
  const target = new THREE.Vector3(bottom.x, bottom.y - gap, bottom.z);
  grassPatch.position.lerp(target, 0.25); // 0.25 = ease factor; set to 1 for instant
}

// Render loop (NO camera fitting here)
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);          // plane faces the current camera
  frameOverlay.update(camera);       // HUD frame fits current aspect/fov
  system.step(dt, ui.values(), camera);

  updateGrassUnderHeart();           // <— keep grass under the true bottom

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Reset button (do not re-aim camera)
document.getElementById('resetBtn').addEventListener('click', () => {
  system.reset(ui.values().power);
});
