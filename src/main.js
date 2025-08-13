// src/main.js
import { THREE } from './core/three.js';
import { createApp } from './core/app.js';
import { createSystem } from './sim/system.js';
import { updateHeartFrame } from './sim/heart.js';
import { initUI } from './ui/panel.js';
import { CARD_H } from './cards/mesh.js';
import { loadImageDeck } from './cards/imageDeck.js';
import { FrameBorderOverlay } from './overlay/frameBorderOverlay.js';

// If you have these env helpers in your project, keep them; else comment out.
// import { buildSkyDome } from './env/sky.js';
// import { buildGrassPatch } from './env/grassPatch.js';
// import { setupFlatLighting } from './env/lighting.js';

const container = document.getElementById('renderer');
const overlayCanvas = document.getElementById('overlay');
const { scene, camera, renderer, controls } = createApp(container, overlayCanvas);

// ------- Overlay (HUD) — now modular 16 GLBs -------
const frameOverlay = new FrameBorderOverlay({
  dir: '/assets/glb/',         // <- use the 16 files
  distance: 2.0,
  marginH: 0.01,
  marginV: 0.01,
  renderOnTop: true,
  lighting: 'normals',         // 'unlit' | 'keep' | 'normals'
  mixStrength: 0.6,
  fillMode: 'expandersOnly'    // mains+corners fixed, only expanders stretch
});
await frameOverlay.load();
frameOverlay.addTo(scene);

// --- Environment (optional) ---
// const sky = buildSkyDome({ radius: 800 }); scene.add(sky);
// const grassPatch = buildGrassPatch({ radius: 3.8, bladeCount: 5000, groundRepeat: 7 });
// scene.add(grassPatch);
// setupFlatLighting(scene, renderer);

// Load images
const imageDeck = await loadImageDeck('/assets/images/');

// Trails container
const trails = new THREE.Group();
scene.add(trails);

// Particle system
const system = createSystem(scene, trails, imageDeck);

// Initial camera/grass placement — simplified (kept your previous logic)
function initialPlaceCamera() {
  // Aim at heart center and move back based on FOV
  controls.target.set(0, 16, 0);
  camera.position.set(0, 16, 28);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}

const ui = initUI({
  // NEW: wire in overlay controls
  overlayControls: true,
  onOverlayChange: (values) => {
    // values: { frameDistance, fillMode, marginH, marginV, lighting, mixStrength, debugPivots, debugBounds, frameScale, expanderXBoost, expanderYBoost }
    frameOverlay.setDistance(values.frameDistance);
    frameOverlay.setFillMode(values.fillMode);
    frameOverlay.setMargins(values.marginH, values.marginV);
    frameOverlay.setLighting(values.lighting);
    frameOverlay.setMixStrength(values.mixStrength);
    frameOverlay.setDebugPivots(values.debugPivots);
    frameOverlay.setDebugBounds(values.debugBounds);
    // Note: frameScale / expander boosts are applied after update() in the render loop (non-invasive debug assists).
  },
  onOverlayDump: () => {
    console.log('[Debug] Camera & Frame');
    console.log('Camera position:', camera.position.toArray());
    console.log('Camera quaternion:', camera.quaternion.toArray());
    console.log('FOV/aspect/near/far:', camera.fov, camera.aspect, camera.near, camera.far);
    console.log('Frame distance:', frameOverlay.distance);
    frameOverlay.debugDump(camera);
  }
});

ui.onInput(() => {
  system.prepareHeartTargets(); // deck length drives targets
});

system.ensureCardCount(ui.values().power);
initialPlaceCamera();

// Render loop
const clock = new THREE.Clock();
function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();
  updateHeartFrame(camera);

  // Normal overlay update
  frameOverlay.update(camera);

  // --- NEW: Manual debug assists from the panel (non-invasive, post-update) ---
  {
    const vals = ui.values();

    // 1) Global scale bias (uniform multiplier on whatever update() computed)
    if (vals.frameScale && Math.abs(vals.frameScale - 1.0) > 1e-6) {
      frameOverlay.group.scale.multiplyScalar(vals.frameScale);
    }

    // 2) Expander boosts: multiply local scale on expanders only
    const EXP_H = [
      'top-left-expander', 'bottom-left-expander',
      'top-right-expander', 'bottom-right-expander'
    ];
    const EXP_V = [
      'left-top-expander', 'left-bottom-expander',
      'right-top-expander', 'right-bottom-expander'
    ];
    if (vals.expanderXBoost && vals.expanderXBoost > 1.0) {
      for (const k of EXP_H) {
        const P = frameOverlay.parts?.get(k);
        if (P?.object) P.object.scale.x *= vals.expanderXBoost;
      }
    }
    if (vals.expanderYBoost && vals.expanderYBoost > 1.0) {
      for (const k of EXP_V) {
        const P = frameOverlay.parts?.get(k);
        if (P?.object) P.object.scale.y *= vals.expanderYBoost;
      }
    }
  }

  system.step(dt, ui.values(), camera);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
  system.reset(ui.values().power);
});
