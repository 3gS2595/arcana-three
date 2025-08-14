import { EMITTER_POS } from './constants.js';

const rng = (min, max) => min + Math.random() * (max - min);

export function spawnCard(state, obj, power = 50) {
  if (obj.group.parent !== state.scene) state.scene.add(obj.group);

  obj.group.position
    .copy(EMITTER_POS)
    .add({ x: rng(-0.05, 0.05), y: 0, z: rng(-0.05, 0.05) });

  obj.velocity.set(
    rng(-0.6, 0.6) * (0.6 + power / 100),
    rng(6.5, 10.0) * (0.8 + power / 70),
    rng(-0.6, 0.6) * (0.6 + power / 100)
  );

  obj.angular.set(rng(-2, 2), rng(-2, 2), rng(-2, 2));
  obj.age = 0; obj.alive = true; obj.group.scale.setScalar(0.05); obj.opacity = 0.0;
  obj.trail.userData.count = 0; obj.trail.geometry.setDrawRange(0, 0);
  obj.state = 'flying';
  obj.homingDelay = 0.8 + Math.random() * 0.8;
  obj.prevPos.copy(obj.group.position);
  obj.prevHead = null;
}

export function ensurePool(state, power) {
  const n = state.deck.length;

  // grow
  while (state.cards.length < n) {
    const obj = state.makeCard(state.cards.length);
    spawnCard(state, obj, power);
    state.cards.push(obj);
    state._targetsDirty = true;
  }

  // shrink
  while (state.cards.length > n) {
    const obj = state.cards.pop();
    if (obj.group.parent) obj.group.parent.remove(obj.group);
    state.trailsGroup.remove(obj.trail);
    state._targetsDirty = true;
  }

  if (state._lastCount !== n) {
    state._lastCount = n;
    state._targetsDirty = true;
  }
}
