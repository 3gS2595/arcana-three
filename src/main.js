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
  scalingMode: 'stretch' // <- matches the window ratio (portrait/landscape)
});
await frameOverlay.load();
frameOverlay.addTo(scene);

// Add near the top of main.js after you have `container`, `renderer`, and `camera`
function hardResize() {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', hardResize);

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
  // Make sure bounds reflect the current camera-facing heart plane
  updateHeartFrame(camera);

  const bounds = system.getHeartBoundsWorld && system.getHeartBoundsWorld();
  if (!bounds) return;

  const { center, size, minY, maxY } = bounds;
  const count = system.cards?.length ?? 0;

  // --- Place grass just below the heart bottom (no scaling) ---
  // Gap scales with heart height and (gently) with card count so it never intersects
  const heartH   = Math.max(size.y, 1e-4);
  const gapBase  = 0.450 * heartH;                 // 10% of heart height
  const gapCount = 0.012 * Math.sqrt(Math.max(1, count)) * CARD_H; // tiny lift for more cards
  const gap      = gapBase + gapCount;

  const grassY = minY - gap;
  grassPatch.position.set(center.x, grassY, center.z);
  grassPatch.scale.set(1, 1, 1); // ensure no leftover scaling

  // --- One-time camera frame so (heart top .. grass plane) ~ 60% of window height ---
  // We keep the camera straight-on (+Z), and aim at the HEART CENTER (free OrbitControls after)
  const vFOV    = THREE.MathUtils.degToRad(camera.fov);
  const halfTan = Math.tan(vFOV / 2);

  const spanH = (maxY - grassY);              // vertical span we want in view
  const spanW = Math.max(size.x, 1e-4);       // horizontal span (heart width)

  // Distance required so span fills `occupancy` of the viewport
  const distH = spanH / (2 * halfTan * occupancy);
  const distW = spanW / (2 * halfTan * camera.aspect * occupancy);
  const distance = Math.max(distH, distW) * 1.05; // tiny safety margin

  // Aim once at the heart center; look straight on; then leave controls free
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

hardResize();

// Render loop (NO camera fitting here)
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();                 // user has full control from here
  updateHeartFrame(camera);          // heart plane follows camera
  frameOverlay.update(camera, renderer); // <— keep the frame fitted and facing camera
  system.step(dt, ui.values(), camera);
  renderer.render(scene, camera);
  system.step(dt, ui.values(), camera);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Reset button (do not re-aim camera)
document.getElementById('resetBtn').addEventListener('click', () => {
  system.reset(ui.values().power);
});
