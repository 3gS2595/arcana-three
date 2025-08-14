// src/core/app.js
import { THREE } from './three.js';
import { OrbitControls } from './controls.js';

export function createApp(container, overlayCanvas) {
  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x0f141b, 180, 900);

  const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 200);
  camera.position.set(0, 50, 0);

  // IMPORTANT: ensure camera is part of the scene graph so children of the camera render
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.5, 0);

  // initial size (in case resize observer is late)
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  overlayCanvas.width = w; overlayCanvas.height = h;

  return { THREE, scene, camera, renderer, controls };
}
