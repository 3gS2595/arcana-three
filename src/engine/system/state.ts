// src/sim/system/state.js
import { THREE } from '../../core/three.js';
import { makeImageCardMesh, CARD_H } from '../../cards/mesh.js';
import { makeTrail, updateTrail, clearTrail } from '../trails.js';

export function createState(scene, trailsGroup, imageDeck) {
  const cards = [];
  const deck = imageDeck || [];
  let _lastCount = -1;

  const publicAPI = {
    cards,
    getHeartBoundsWorld: null,
    getHeartBottomWorld: null
  };

  return {
    scene, trailsGroup, deck, cards,
    _lastCount, _targetsDirty: true,
    publicAPI,
    makeCard(i) {
      const entry = deck[i];
      const built = makeImageCardMesh(entry?.texture, entry?.aspect ?? 1.0);
      const trail = makeTrail(0x52a802, 20);
      trailsGroup.add(trail);
      scene.add(built.group);
      return {
        group: built.group,
        trail,
        velocity: new THREE.Vector3(),
        angular: new THREE.Vector3(),
        age: 0, alive: false, opacity: 0,
        state: 'flying',
        mode: 'normal',                // <-- focus state ('normal' | 'focus_in' | 'focused' | 'focus_out')
        targetLocal: new THREE.Vector3(),
        homingDelay: 1,
        prevPos: new THREE.Vector3(),
        prevHead: null,
        cardWidth: built.width || (CARD_H * (entry?.aspect ?? 1.0))
      };
    },
    updateTrail, clearTrail
  };
}
