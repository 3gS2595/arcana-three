// src/core/app.js
import { THREE } from './three.js';
import { OrbitControls } from './controls.js';

export function createApp(container, overlayCanvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0xaed8ff, 180, 900);

  const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 200);
  camera.position.set(7, 6, 12);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.5, 0);

  // ---- Robust Resize (container + DPR) ----
  let lastW = -1, lastH = -1, lastDPR = -1;
  let ro;
  let dprRAF = 0;

  function applySize(w, h, dpr) {
    // Guard
    if (!w || !h) return;

    // Update renderer CSS size too (3rd arg = true is critical for shrink)
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);

    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();

    if (overlayCanvas) {
      // Backing store respects DPR; CSS size matches container
      overlayCanvas.width  = Math.max(1, Math.floor(w * dpr));
      overlayCanvas.height = Math.max(1, Math.floor(h * dpr));
      overlayCanvas.style.width  = w + 'px';
      overlayCanvas.style.height = h + 'px';
    }
  }

  function currentSize() {
    // Prefer exact content box from RO; fall back to client dimensions
    const w = container.clientWidth || container.offsetWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3)); // cap for perf if desired
    return { w, h, dpr };
  }

  function handleResize({ w, h, dpr }) {
    if (w === lastW && h === lastH && dpr === lastDPR) return;
    lastW = w; lastH = h; lastDPR = dpr;
    applySize(w, h, dpr);
  }

  // Observe container size precisely
  ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const cr = e.contentRect;
      const { dpr } = currentSize();
      handleResize({ w: (Math.round(cr.width) - 260), h: Math.round(cr.height), dpr });
      console.log("changed")
    }
  });
  ro.observe(document.body);

  // Watch DPR changes (zoom / screen move). Polling via rAF is the most reliable cross-browser.
  function tickDPR() {
    const { w, h, dpr } = currentSize();
    handleResize({ w, h, dpr });
    dprRAF = requestAnimationFrame(tickDPR);
  }
  dprRAF = requestAnimationFrame(tickDPR);

  function disposeResize() {
    ro?.disconnect?.();
    if (dprRAF) cancelAnimationFrame(dprRAF);
  }

  // Initial apply
  {
    const { w, h, dpr } = currentSize();
    applySize(w, h, dpr);
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x204020, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(25, 50, -20);
  sun.target.position.set(0, 2.5, 0);
  scene.add(sun, sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  return {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    stopAutoResize: disposeResize
  };
}
