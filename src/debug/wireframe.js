// src/debug/wireframe.js
import { THREE } from '../core/three.js';

/**
 * WireframeDebugger
 * - Adds BoxHelper outlines around objects to visualize bounds.
 * - Designed to be lightweight and safe: it won't mutate your meshes.
 *
 * Options:
 *   - includeCards: boolean (default true) — outlines for system.cards[].group
 *   - includeSceneMeshes: boolean (default false) — outlines for all scene meshes (filtered)
 *   - colorCards: number (default 0xff3333)
 *   - colorScene: number (default 0x33aaff)
 *   - exclude: (obj: THREE.Object3D) => boolean  (skip heavy/irrelevant meshes)
 *   - cardsProvider: () => THREE.Object3D[]  (e.g., () => system.cards.map(c=>c.group))
 */
export function createWireframeDebugger(scene, {
  includeCards = true,
  includeSceneMeshes = false,
  colorCards = 0xff3333,
  colorScene = 0x33aaff,
  exclude = defaultExclude,
  cardsProvider = () => []
} = {}) {

  const group = new THREE.Group();
  group.name = 'WireframeDebuggerHelpers';
  scene.add(group);

  const cardHelpers = new Map();  // Object3D -> BoxHelper
  const sceneHelpers = new Map(); // Object3D -> BoxHelper

  function makeHelper(target, color) {
    const h = new THREE.BoxHelper(target, color);
    // draw on top for clarity
    h.material.depthTest = false;
    h.material.depthWrite = false;
    h.renderOrder = 9998;
    return h;
  }

  function syncCards() {
    if (!includeCards) return;

    const cards = cardsProvider() || [];

    // Add missing
    for (const obj of cards) {
      if (!obj || !(obj.isObject3D)) continue;
      if (!cardHelpers.has(obj)) {
        const h = makeHelper(obj, colorCards);
        group.add(h);
        cardHelpers.set(obj, h);
      }
    }
    // Remove stale
    for (const [obj, helper] of cardHelpers) {
      if (!cards.includes(obj) || !obj.parent) {
        group.remove(helper);
        cardHelpers.delete(obj);
      }
    }
  }

  function syncSceneMeshes() {
    if (!includeSceneMeshes) return;

    const seen = new Set();

    scene.traverse(obj => {
      if (!obj || !obj.isMesh) return;
      if (exclude(obj)) return;
      seen.add(obj);
      if (!sceneHelpers.has(obj)) {
        const h = makeHelper(obj, colorScene);
        group.add(h);
        sceneHelpers.set(obj, h);
      }
    });

    // Remove stale
    for (const [obj, helper] of sceneHelpers) {
      if (!seen.has(obj) || !obj.parent) {
        group.remove(helper);
        sceneHelpers.delete(obj);
      }
    }
  }

  function refresh() {
    syncCards();
    syncSceneMeshes();
  }

  function update() {
    // Update boxes to current transforms
    for (const [, helper] of cardHelpers) helper.update();
    for (const [, helper] of sceneHelpers) helper.update();
  }

  function dispose() {
    for (const [, helper] of cardHelpers) {
      group.remove(helper);
      helper.geometry?.dispose?.();
      helper.material?.dispose?.();
    }
    for (const [, helper] of sceneHelpers) {
      group.remove(helper);
      helper.geometry?.dispose?.();
      helper.material?.dispose?.();
    }
    cardHelpers.clear();
    sceneHelpers.clear();
    if (group.parent) group.parent.remove(group);
  }

  return { group, refresh, update, dispose };
}

/**
 * Default exclusion filter for scene meshes to reduce clutter:
 * - skip very large or environment items by name/class
 * - skip known overlay/sky/grass meshes
 */
function defaultExclude(obj) {
  const name = (obj.name || '').toLowerCase();
  if (name.includes('framed') || name.includes('frameborderoverlay')) return true;
  if (name.includes('sky') || name.includes('skydome')) return true;
  if (name.includes('grass') || name.includes('patch')) return true;

  // Skip InstancedMesh (grass blades) to avoid huge boxes, unless explicitly requested
  if (obj.isInstancedMesh) return true;

  // Very large bounds? skip (likely environment)
  // (We don't compute bounds here to keep this O(1), rely on names/classes)
  return false;
}
