import { THREE } from "@/core/three";
import { cubicBezier } from "./path";

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface CurveSpec {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
}
export interface AnimState {
  t: number;
  dur: number;
  curve: CurveSpec;
  fromQuat: THREE.Quaternion;
  toQuat: THREE.Quaternion;
  fromScale: number;
  toScale: number;
}

export function stepAnimation(obj: THREE.Object3D, state: AnimState, dt: number): boolean {
  state.t += dt;
  const u = Math.min(1, state.t / Math.max(1e-6, state.dur));
  const k = easeInOutCubic(u);

  const p = cubicBezier(state.curve.p0, state.curve.p1, state.curve.p2, state.curve.p3, k);
  const q = new THREE.Quaternion().copy(state.fromQuat).slerp(state.toQuat, k);
  const s = THREE.MathUtils.lerp(state.fromScale, state.toScale, k);

  obj.position.copy(p);
  obj.quaternion.copy(q);
  obj.scale.setScalar(s);

  return u >= 1;
}
