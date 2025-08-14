import * as THREE from "three";
import { CloudsRenderer, type CloudsStage } from "./CloudsRenderer";
import { createCameraEdgeMask } from "./EdgeMask";

export interface CloudsEffect {
  prepare: (dt: number) => void;          // render mask to FBO
  draw: (dt: number) => void;             // stage-driven compose
  resize: (w: number, h: number) => void;
  dispose: () => void;
  setStage: (s: CloudsStage) => void;
  getStage: () => CloudsStage;
}

export function createCloudsEffect(gl: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): CloudsEffect {
  const size = gl.getSize(new THREE.Vector2());
  const renderer = new CloudsRenderer(gl, size.x, size.y);
  const mask = createCameraEdgeMask(camera, {
    distance: 2.0, thickness: 0.12, volumeDepth: 1.6, volumeGrow: 1.4
  });

  // default to stage 1 (FSQ gradient on screen)
  renderer.setStage(1);

  function prepare(_dt: number) {
    const s = renderer.getStage();
    if (s >= 3) {
      renderer.renderMask(mask.root, camera);
    }
  }

  function draw(dt: number) {
    renderer.compose(dt, camera, mask.root);
  }

  function resize(w: number, h: number) {
    renderer.resize(w, h);
    mask.rebuild();
  }

  function dispose() {
    mask.dispose();
    renderer.dispose();
  }

  return {
    prepare,
    draw,
    resize,
    dispose,
    setStage: (s) => renderer.setStage(s),
    getStage: () => renderer.getStage()
  };
}
