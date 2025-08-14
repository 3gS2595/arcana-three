// src/interaction/focus/index.js
import { THREE } from '../core/three.js';
import { heartLocalToWorld, updateHeartFrame } from '../sim/heart.js';
import { createPicker } from './picker.js';
import { updateTrail as updateTrailLine } from '../sim/trails.js';

import { createAnimationDriver } from './focus/animation.js';
import { createFocusAttachment } from './focus/attachment.js';
import { makeCurveTowardCenter } from './focus/path.js';
import { computeFocusScale, computeFocusTargetWorld } from './focus/sizing.js';

/**
 * Orchestrates pick → focus/unfocus using the small helpers in this folder.
 * Public API: { update(dt), clear(), dispose() }
 */
export function createFocusController({ camera, scene, renderer, system, options = {} }) {
  const config = {
    distance: options.distance ?? 0.8,
    margin:   options.margin   ?? 1.0,       // interaction/index.js overrides to 0.65
    fitMode:  options.fitMode  ?? 'contain', // 'contain' | 'height'
    animDur:  options.animDur  ?? 1.2
  };

  const picker = createPicker(camera, renderer, system);
  const attachment = createFocusAttachment(camera, config.distance);

  const easeInOutCubic = t => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2);
  const anim = createAnimationDriver({
    scene, camera, updateTrailLine, easeFn: easeInOutCubic
  });

  function worldPosOf(obj3D) { return obj3D.getWorldPosition(new THREE.Vector3()); }
  function worldQuatOf(obj3D) { return obj3D.getWorldQuaternion(new THREE.Quaternion()); }

  function focusCard(card) {
    // Cache pre-focus world rotation for a graceful unfocus later
    card._preFocusQuat = worldQuatOf(card.group).clone();

    // Freeze sim for this card
    card.velocity.set(0,0,0);
    card.angular.set(0,0,0);
    card.state = 'homing';
    card.opacity = 1;

    card.mode = 'focus_in';

    const startPos = worldPosOf(card.group);
    const { pos: targetPos, quat: targetQuatWorld } = computeFocusTargetWorld(camera, config.distance);
    const targetScale = computeFocusScale(camera, card, config);

    const curve = makeCurveTowardCenter(startPos, targetPos);

    // Animate toward camera with smooth rotation into fixed end orientation
    anim.start(
      card,
      curve,
      { toQuat: targetQuatWorld, toScale: targetScale, duration: config.animDur },
      () => {
        // Reparent under camera and lock relative transform
        attachment.attachCardGroup(card.group, targetScale);
        card.mode = 'focused';
        // Focused: static — let trail decay naturally
        updateTrailLine(card, 0, false, camera);
      }
    );
  }

  function releaseCard(card) {
    // Detach from camera, preserving world transforms
    const curPos = worldPosOf(card.group);
    const curQuat = worldQuatOf(card.group);
    const curScale = card.group.scale.x;

    if (card.group.parent !== scene) {
      scene.add(card.group);
      card.group.position.copy(curPos);
      card.group.quaternion.copy(curQuat);
      card.group.scale.setScalar(curScale);
    }

    // Target is the card's heart slot in world space
    updateHeartFrame(camera);
    const targetWorld = heartLocalToWorld(card.targetLocal);

    card.mode = 'focus_out';
    card.trail.visible = true;

    const curve = makeCurveTowardCenter(curPos, targetWorld);

    // Rotate smoothly back to pre-focus orientation
    const toQuat = (card._preFocusQuat && card._preFocusQuat.clone()) || curQuat.clone();

    anim.start(
      card,
      curve,
      { toQuat, toScale: 1.0, duration: config.animDur },
      () => {
        card.mode = 'normal';
        card.state = 'homing';
        card.velocity.set(0,0,0);
        card.angular.set(0,0,0);
      }
    );
  }

  function onClick(e) {
    const card = picker.pick(e.clientX, e.clientY);
    if (!card) return;

    if (card.mode === 'focused' || card.mode === 'focus_in') {
      releaseCard(card);
    } else {
      // Ensure only one focused at a time
      for (const c of system.cards) {
        if (c !== card && (c.mode === 'focused' || c.mode === 'focus_in')) releaseCard(c);
      }
      focusCard(card);
    }
  }

  renderer.domElement.addEventListener('click', onClick);

  function clear() {
    anim.stopAll();
    for (const card of system.cards) {
      if (card.mode && card.mode !== 'normal') {
        const pos = worldPosOf(card.group);
        const quat = worldQuatOf(card.group);
        const scl = card.group.scale.x;
        if (card.group.parent !== scene) scene.add(card.group);
        card.group.position.copy(pos);
        card.group.quaternion.copy(quat);
        card.group.scale.setScalar(scl);

        card.mode = 'normal';
        card.state = 'homing';
        card.velocity.set(0,0,0);
        card.angular.set(0,0,0);
      }
    }
  }

  function update(dt) {
    // While focused and not animating, let the trail decay
    for (const c of system.cards) {
      if (c.mode === 'focused') updateTrailLine(c, dt, false, camera);
    }
    anim.update(dt);
  }

  function dispose() {
    renderer.domElement.removeEventListener('click', onClick);
    clear();
    attachment.dispose();
  }

  // Keep focused card scaled correctly on resize (no per-frame reposition/orient)
  const onResize = () => {
    for (const c of system.cards) {
      if (c.mode === 'focused') {
        const s = computeFocusScale(camera, c, config);
        c.group.scale.setScalar(s);
      }
    }
  };
  window.addEventListener('resize', onResize);

  return { update, clear, dispose };
}
