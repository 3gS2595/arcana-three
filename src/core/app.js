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

  function resize() {
    const w = container.clientWidth || container.offsetWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    overlayCanvas.width = w; overlayCanvas.height = h;
  }
  window.addEventListener('resize', resize);
  resize();

  // Lights
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x204020, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(25, 50, -20);
  sun.target.position.set(0, 2.5, 0);
  scene.add(sun, sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  return { THREE, scene, camera, renderer, controls };
}
