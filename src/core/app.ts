import { THREE } from "@/core/three";
import { OrbitControls } from "@/core/controls";

export interface AppContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
}

export function createApp(container: HTMLElement, overlayCanvas: HTMLCanvasElement): AppContext {
  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x0f141b, 180, 900);

  const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 200);
  camera.position.set(0, 50, 0);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.5, 0);

  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  overlayCanvas.width = w;
  overlayCanvas.height = h;

  return { THREE, scene, camera, renderer, controls };
}
