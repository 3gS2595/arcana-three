// src/interaction/focusController.js
import { THREE } from '../core/three.js';
import { updateHeartFrame, heartLocalToWorld, HEART_CENTER } from '../sim/heart.js';
import { CARD_H } from '../cards/mesh.js';
import { createPicker } from './picker.js';
import { updateTrail as updateTrailLine } from '../sim/trails.js';

/**
 * FocusController
 * - Click a card: animate along a CURVED path that gently bows toward the heart center,
 *   rotating smoothly toward a FIXED end-orientation (camera-aligned) for buttery focus.
 *   Then scale to fit viewport and LOCK under a camera child (static relative to camera).
 * - Click again: detach from camera and animate back along a curved path to its heart slot,
 *   rotating smoothly back to its original pre-focus orientation (no last-second snap).
 * - Trails remain visible during both focus-in and focus-out animations; decay while static.
 *
 * NOTE: interaction/index.js sets options.margin = 0.65 (respected here).
 */
export function createFocusController({ camera, scene, renderer, system, options = {} }) {
  const cfg = {
    distance: options.distance ?? 0.8,
    margin:   options.margin   ?? 1.0,        // overridden to 0.65 in your index.js
    fitMode:  options.fitMode  ?? 'contain',  // 'contain' | 'height'
    animDur:  1.2                              // longer to showcase curve & rotation
  };

  const picker = createPicker(camera, renderer, system);
  const animating = new Set();

  // Camera-anchored focus point; card is parented here AFTER focus-in anim completes
  const focusAnchor = new THREE.Object3D();
  focusAnchor.position.set(0, 0, -cfg.distance);
  camera.add(focusAnchor);

  const easeInOutCubic = t => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2);

  function worldPosOf(obj3D) { return obj3D.getWorldPosition(new THREE.Vector3()); }
  function worldQuatOf(obj3D) { return obj3D.getWorldQuaternion(new THREE.Quaternion()); }

  function cardAspect(card) {
    return Math.max(0.05, (card.cardWidth || (CARD_H * 1.0)) / CARD_H);
  }
  function viewSizeAt(dist) {
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFOV / 2) * dist;
    const viewW = viewH * camera.aspect;
    return { viewW, viewH };
  }
  function computeFocusTargetWorld() {
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const pos = camPos.clone().add(camDir.multiplyScalar(cfg.distance));
    // FIXED end rotation for smoothness: match camera's *current* world orientation.
    // This yields the same world orientation that the card will have once parented
    // to the camera with local identity, avoiding any end-of-anim snap.
    const quat = camera.getWorldQuaternion(new THREE.Quaternion());
    return { pos, quat };
  }
  function computeFocusScale(card) {
    const { viewW, viewH } = viewSizeAt(cfg.distance);
    const a = cardAspect(card);
    const heightFit = (viewH * cfg.margin) / CARD_H;
    const widthFit  = (viewW * cfg.margin) / (CARD_H * a);
    return (cfg.fitMode === 'height') ? heightFit : Math.min(heightFit, widthFit);
  }

  // ------------------------
  // Curved path construction
  // ------------------------
  function cubicBezier(p0, p1, p2, p3, t, out = new THREE.Vector3()) {
    const it = 1 - t;
    const b0 = it * it * it;
    const b1 = 3 * it * it * t;
    const b2 = 3 * it * t * t;
    const b3 = t * t * t;
    return out
      .set(0,0,0)
      .addScaledVector(p0, b0)
      .addScaledVector(p1, b1)
      .addScaledVector(p2, b2)
      .addScaledVector(p3, b3);
  }

  /**
   * Make a gentle heartward curve from p0 -> p3:
   *  - P1 pulls toward heart center near start (stronger),
   *  - P2 pulls lightly near end (weaker), giving an inward bow that straightens near the camera.
   */
  function makeCurveTowardCenter(p0, p3) {
    const center = new THREE.Vector3().copy(HEART_CENTER);
    const d0 = p0.distanceTo(center);
    const d3 = p3.distanceTo(center);

    const v0c = new THREE.Vector3().subVectors(center, p0).normalize();
    const v3c = new THREE.Vector3().subVectors(center, p3).normalize();

    const k1 = Math.min(1.0, 0.45 * d0);
    const k2 = Math.min(1.0, 0.15 * d3);

    const p1 = new THREE.Vector3().copy(p0).addScaledVector(v0c, k1);
    const p2 = new THREE.Vector3().copy(p3).addScaledVector(v3c, k2);

    const lift = 0.12 * (d0 + d3);
    p1.y += lift * 0.25;
    p2.y += lift * 0.10;

    return { p0: p0.clone(), p1, p2, p3: p3.clone() };
  }

  // ------------------------
  // Animation driver
  // ------------------------
  // rotMode:
  //   - 'toQuat': slerp toward a fixed target quaternion (e.g., camera orientation at start, or original pre-focus rotation)
  function startCurveAnim(card, bezier, { toQuat }, toScale, dur, onDone) {
    const fromQuat = worldQuatOf(card.group);
    const fromScale = card.group.scale.x;

    card._anim = {
      t: 0, dur,
      curve: bezier,      // {p0,p1,p2,p3}
      fromQuat,
      toQuat: toQuat ? toQuat.clone() : fromQuat.clone(),
      fromScale,
      toScale
    };
    card._onAnimDone = onDone;
    animating.add(card);
  }

  function updateAnimations(dt) {
    if (animating.size === 0) return;
    for (const card of Array.from(animating)) {
      const a = card._anim;
      if (!a) { animating.delete(card); continue; }
      a.t += dt;
      const u = Math.min(1, a.t / Math.max(1e-6, a.dur));
      const k = easeInOutCubic(u);

      // Position along curve
      const p = cubicBezier(a.curve.p0, a.curve.p1, a.curve.p2, a.curve.p3, k);

      // Smoothly blend rotation from starting → fixed target across the whole path
      const q = new THREE.Quaternion().copy(a.fromQuat).slerp(a.toQuat, k);

      const s = THREE.MathUtils.lerp(a.fromScale, a.toScale, k);

      // Ensure under scene while animating
      if (card.group.parent !== scene) scene.add(card.group);
      card.group.position.copy(p);
      card.group.quaternion.copy(q);
      card.group.scale.setScalar(s);

      // Trails during animation
      card.trail.visible = true;
      updateTrailLine(card, dt, true, camera);

      if (u >= 1) {
        animating.delete(card);
        card._anim = null;
        const done = card._onAnimDone; card._onAnimDone = null;
        if (typeof done === 'function') done();
      }
    }
  }

  // ---- Focus / release ----
  function focusCard(card) {
    // Remember the pre-focus world orientation so we can rotate back to it on unfocus
    card._preFocusQuat = worldQuatOf(card.group).clone();

    // Freeze sim for this card
    card.velocity.set(0,0,0);
    card.angular.set(0,0,0);
    card.state = 'homing';
    card.opacity = 1;

    card.mode = 'focus_in';

    const startPos = worldPosOf(card.group);
    const { pos: targetPos, quat: targetQuatWorld } = computeFocusTargetWorld(); // FIXED end quaternion = camera world quat
    const s = computeFocusScale(card);

    const bez = makeCurveTowardCenter(startPos, targetPos);

    // Ensure trail is active during the animation
    card.trail.visible = true;

    // During focus-in, rotate smoothly toward the FIXED end orientation (camera-aligned)
    startCurveAnim(
      card,
      bez,
      { toQuat: targetQuatWorld },
      s,
      cfg.animDur,
      () => {
        // Reparent under camera and keep it static relative to camera
        focusAnchor.updateWorldMatrix(true, false);
        focusAnchor.attach(card.group);          // preserves world transform on reparent
        card.group.position.set(0, 0, 0);        // lock to anchor origin
        card.group.quaternion.identity();        // orientation fixed relative to camera
        card.group.scale.setScalar(s);

        card.mode = 'focused';
        // Focused = static; let the trail decay naturally (no movement)
        updateTrailLine(card, 0, false, camera);
      }
    );
  }

  function releaseCard(card) {
    // Detach from camera while preserving current world transform
    const curWorldPos = worldPosOf(card.group);
    const curWorldQuat = worldQuatOf(card.group); // current (camera-relative) at release moment
    const curScale = card.group.scale.x;

    if (card.group.parent !== scene) {
      scene.add(card.group);
      card.group.position.copy(curWorldPos);
      card.group.quaternion.copy(curWorldQuat);
      card.group.scale.setScalar(curScale);
    }

    // Animate back to heart slot along a similarly gentle curve
    updateHeartFrame(camera);
    const targetWorld = heartLocalToWorld(card.targetLocal);

    card.mode = 'focus_out';
    card.trail.visible = true;

    const bez = makeCurveTowardCenter(curWorldPos, targetWorld);

    // During unfocus, rotate smoothly back to the ORIGINAL pre-focus orientation
    const targetQuatBack = (card._preFocusQuat && card._preFocusQuat.clone()) || curWorldQuat.clone();

    startCurveAnim(
      card,
      bez,
      { toQuat: targetQuatBack },
      1.0,
      cfg.animDur,
      () => {
        card.mode = 'normal';
        card.state = 'homing';
        card.velocity.set(0,0,0);
        card.angular.set(0,0,0);
        // trail resumes under sim control
      }
    );
  }

  // ---- Housekeeping ----
  function clear() {
    for (const card of system.cards) {
      if (card._anim) { card._anim = null; animating.delete(card); card._onAnimDone = null; }
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
        // trail management returns to the sim
      }
    }
  }

  // Keep focused card size correct across resizes (no per-frame orientation/position updates)
  const onResize = () => {
    for (const c of system.cards) {
      if (c.mode === 'focused' && !animating.has(c)) {
        const s = computeFocusScale(c);
        c.group.scale.setScalar(s);
      }
    }
  };
  window.addEventListener('resize', onResize);

  // Click-to-toggle
  function onClick(e) {
    const card = picker.pick(e.clientX, e.clientY);
    if (!card) return;

    if (card.mode === 'focused' || card.mode === 'focus_in') {
      releaseCard(card);
    } else {
      // If another is focused, release it first
      for (const c of system.cards) {
        if (c !== card && (c.mode === 'focused' || c.mode === 'focus_in')) releaseCard(c);
      }
      focusCard(card);
    }
  }
  renderer.domElement.addEventListener('click', onClick);

  // Public API
  return {
    update(dt) {
      // No per-frame “lock to camera” while focused—only animations advance.
      // However, keep trails decaying while fully focused (static).
      for (const c of system.cards) {
        if (c.mode === 'focused' && !animating.has(c) && c.trail.visible) {
          updateTrailLine(c, dt, false, camera); // decay toward zero while static
        }
      }
      updateAnimations(dt);
    },
    clear,
    dispose() {
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      clear();
      if (focusAnchor.parent) focusAnchor.parent.remove(focusAnchor);
    }
  };
}
