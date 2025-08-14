// src/sim/system.js
import { THREE } from '../core/three.js';
import * as K from './system/constants.js';
import { createState } from './system/state.js';
import { spawnCard, ensurePool } from './system/spawn.js';
import { integrateFlying } from './system/physics.js';
import { homeTowards } from './system/homing.js';
import { billboardTowardCamera } from './system/billboard.js';
import { decideTrail } from './system/trailsDriver.js';
import { generateTargets, heartLocalToWorld } from './system/targets.js';

export function createSystem(scene, trailsGroup, imageDeck) {
  const state = createState(scene, trailsGroup, imageDeck);

  function ensureCardCount(power) {
    ensurePool(state, power);
    if (state._targetsDirty && state.cards.length) {
      generateTargets(state);
      state._targetsDirty = false;
    }
  }

  function prepareHeartTargets() {
    state._targetsDirty = true;
    if (state.cards.length) {
      generateTargets(state);
      state._targetsDirty = false;
    }
  }

  function step(dt, ui, camera) {
    ensureCardCount(ui.power);

    for (const c of state.cards) {
      if (!c.alive) spawnCard(state, c, ui.power);

      // fade-in & scale-up
      if (c.opacity < 1) {
        c.opacity = Math.min(1, c.opacity + dt * 2.5);
        const s = THREE.MathUtils.lerp(0.05, 1, c.opacity);
        c.group.scale.setScalar(s);
      }

      let moving = false;
      if (c.state === 'flying') {
        integrateFlying(c, dt);
        if (c.group.position.y < K.FLOOR_Y) { c.group.position.y = K.FLOOR_Y; c.velocity.y = Math.max(0, c.velocity.y); c.state = 'homing'; }
        if (ui.spin) { c.group.rotation.x += c.angular.x * dt; c.group.rotation.y += c.angular.y * dt; c.group.rotation.z += c.angular.z * dt; }
        if (c.age > c.homingDelay || c.velocity.y < 0 || c.group.position.y < 0.2) c.state = 'homing';
        moving = true;
      } else {
        const targetWorld = heartLocalToWorld(c.targetLocal);
        homeTowards(c, targetWorld, dt);
        billboardTowardCamera(c, camera, dt);
        moving = true;
      }

      const movedForTrail = decideTrail(c, camera, dt, moving);
      if (ui.showPaths) {
        c.trail.visible = true;
        state.updateTrail(c, dt, movedForTrail, camera);
      } else if (c.trail.visible) {
        state.clearTrail(c);
        c.trail.visible = false;
      }
    }
  }

  function reset(power) {
    state._targetsDirty = true;
    for (const c of state.cards) {
      c.state = 'flying'; c.opacity = 0; c.alive = true;
      state.clearTrail(c); c.trail.visible = true;
      if (c.group.parent !== scene) scene.add(c.group);
      c.group.quaternion.identity();
      c.prevPos.copy(c.group.position);
      c.prevHead = null;
      spawnCard(state, c, power);
    }
  }

  return {
    ...state.publicAPI,
    step, reset, ensureCardCount, prepareHeartTargets
  };
}
