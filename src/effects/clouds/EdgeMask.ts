import * as THREE from "three";

/**
 * Creates a camera-attached group that draws ONLY at the screen edges:
 * - 4 planes for the border (opaque, writes alpha into the mask FBO)
 * - 1 invisible big box child to define the marching volume AABB
 */
export function createCameraEdgeMask(camera: THREE.PerspectiveCamera, opts?: {
  distance?: number;        // plane distance from camera
  thickness?: number;       // border thickness in view-space fraction (0..0.5)
  volumeDepth?: number;     // Z-depth of the volume box
  volumeGrow?: number;      // expand box width/height relative to view rect
}) {
  const distance = opts?.distance ?? 2.0;
  const thickness = THREE.MathUtils.clamp(opts?.thickness ?? 0.12, 0.01, 0.45);
  const volumeDepth = opts?.volumeDepth ?? 1.2;
  const volumeGrow = opts?.volumeGrow ?? 1.25;

  const group = new THREE.Group();
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0, -distance);
  camera.add(anchor);
  anchor.add(group);

  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // opaque -> alpha=1 in mask
  const makePlane = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat);
    m.position.set(x, y, 0);
    group.add(m);
    return m;
    // NOTE: leaves depthTest enabled, we render only mask FBO so it's fine
  };

  function viewSizeAt(dist: number) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * dist;
    const viewW = viewH * camera.aspect;
    return { viewW, viewH };
  }

  function rebuild() {
    const { viewW, viewH } = viewSizeAt(distance);
    const tH = viewH * thickness;
    const tW = viewW * thickness;

    // clear prior planes
    group.children.slice().forEach((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
      group.remove(c);
    });

    // TOP / BOTTOM
    makePlane(viewW, tH, 0,  (viewH - tH) * 0.5);
    makePlane(viewW, tH, 0, -(viewH - tH) * 0.5);
    // LEFT / RIGHT
    makePlane(tW, viewH - 2 * tH, -(viewW - tW) * 0.5, 0);
    makePlane(tW, viewH - 2 * tH,  (viewW - tW) * 0.5, 0);

    // Invisible volume box child (used only for bounds)
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(viewW * volumeGrow, viewH * volumeGrow, volumeDepth),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    box.position.set(0, 0, 0); // at anchor z
    group.add(box);
  }

  rebuild();

  const api = {
    root: group,
    anchor,
    rebuild,
    dispose() {
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material;
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).geometry.dispose();
          if (m && m.dispose) m.dispose();
        }
      });
      if (anchor.parent) anchor.parent.remove(anchor);
    }
  };

  return api;
}
