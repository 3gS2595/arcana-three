// src/post/composer.js
import { THREE } from '../core/three.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Create a post-processing pipeline with Unreal Bloom.
 * Returns { composer, bloomPass, render, onResize }.
 */
export function createPostFX(renderer, scene, camera, {
  bloomStrength = 0.85,
  bloomRadius = 0.55,
  bloomThreshold = 0.0
} = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    bloomStrength,
    bloomRadius,
    bloomThreshold
  );

  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  function onResize(w, h) {
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  }

  function render() {
    composer.render();
  }

  return { composer, bloomPass, render, onResize };
}
