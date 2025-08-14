import { THREE } from "@/core/three";

export function makeFocusAnchor(camera: THREE.PerspectiveCamera, distance: number) {
  const focusAnchor = new THREE.Object3D();
  focusAnchor.position.set(0, 0, -distance);
  camera.add(focusAnchor);
  return focusAnchor;
}

export function attachToAnchor(anchor: THREE.Object3D, object: THREE.Object3D) {
  anchor.updateWorldMatrix(true, false);
  anchor.attach(object); // preserves world transform
  object.position.set(0, 0, 0);
  object.quaternion.identity();
}
