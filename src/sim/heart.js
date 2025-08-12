import { THREE } from '../core/three.js';
import { CARD_W, CARD_MARGIN, TARGET_Z_JITTER } from '../cards/mesh.js';

export const HEART_CENTER = new THREE.Vector3(0, 16.0, 0);
export const heartFrame = new THREE.Object3D();

export function updateHeartFrame(camera) {
  heartFrame.position.copy(HEART_CENTER);
  heartFrame.lookAt(camera.position);
}

export function heartLocalToWorld(v) {
  return v.clone().applyQuaternion(heartFrame.quaternion).add(heartFrame.position);
}

export function generateHeartPoints(n) {
  const baseXY = (t) => {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
    return [x, y];
  };

  const SAMPLES = 2048;
  const ring = new Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const [x, y] = baseXY(t);
    ring[i] = new THREE.Vector2(x, y);
  }

  let L_base = 0;
  const segLen = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const d = ring[i + 1].distanceTo(ring[i]);
    segLen[i] = d;
    L_base += d;
  }

  const desiredSpacing = CARD_W + CARD_MARGIN;
  const SAFETY_SCALE = 1.15;
  const scale = (n * desiredSpacing / L_base) * SAFETY_SCALE;

  const targetsLocal = [];
  const stepLenScaled = (L_base * scale) / n;

  let accScaled = 0;
  let segIdx = 0;
  for (let k = 0; k < n; k++) {
    const targetLenScaled = k * stepLenScaled;
    while (accScaled + segLen[segIdx] * scale < targetLenScaled && segIdx < SAMPLES) {
      accScaled += segLen[segIdx] * scale;
      segIdx++;
    }
    const segScaled = (segLen[segIdx] * scale) || 1e-6;
    const u = (targetLenScaled - accScaled) / segScaled;

    const p0 = ring[segIdx];
    const p1 = ring[(segIdx + 1) % SAMPLES];

    const x = THREE.MathUtils.lerp(p0.x, p1.x, u) * scale;
    const y = THREE.MathUtils.lerp(p0.y, p1.y, u) * scale;

    targetsLocal.push(new THREE.Vector3(
      x, y, (Math.random() * 2 - 1) * TARGET_Z_JITTER
    ));
  }
  return targetsLocal;
}
