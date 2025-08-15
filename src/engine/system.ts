import { THREE } from "@/core/three";
import * as K from "@/engine/system/constants";
import { createState } from "@/engine/system/state";
import { spawnCard, ensurePool } from "@/engine/system/spawn";
import { integrateFlying } from "@/engine/system/physics";
import { homeTowards } from "@/engine/system/homing";
import { billboardTowardCamera } from "@/engine/system/billboard";
import { decideTrail } from "@/engine/system/trailsDriver";
import { generateTargets, heartLocalToWorld } from "@/engine/system/targets";

export interface SystemCard {
  group: THREE.Group;
  trail: THREE.Line;
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  age: number;
  alive: boolean;
  opacity: number;
  state: "flying" | "homing";
  mode: "normal" | "focus_in" | "focused" | "focus_out" | "morph";
  targetLocal: THREE.Vector3;
  homingDelay: number;
  prevPos: THREE.Vector3;
  prevHead: THREE.Vector3 | null;
  cardWidth?: number;
  _preFocusQuat?: THREE.Quaternion;

  // Shape-morph runtime state (present only during morph)
  _morph?: {
    t: number;
    dur: number;
    p0: THREE.Vector3; // bezier
    p1: THREE.Vector3;
    p2: THREE.Vector3;
    p3: THREE.Vector3;
    baseScale: number;
  };
}

export interface SystemAPI {
  cards: SystemCard[];
  getHeartBoundsWorld: (() => { center: THREE.Vector3; size: THREE.Vector3; minY: number; maxY: number } | null) | null;
  getHeartBottomWorld: (() => THREE.Vector3 | null) | null;
  step: (dt: number, ui: { count: number; power: number; showPaths: boolean; spin: boolean }, camera: THREE.PerspectiveCamera) => void;
  reset: (power: number) => void;
  ensureCardCount: (power: number) => void;
  prepareHeartTargets: () => void;

  // NEW: stylish morph animation to freshly generated targets (after a shape change)
  morphToNewTargets: (camera: THREE.PerspectiveCamera, opts?: { duration?: number }) => void;

  updateTrail: (c: SystemCard, dt: number, moving: boolean, camera: THREE.PerspectiveCamera) => void;
  clearTrail: (c: SystemCard) => void;
}

// ---- local helpers for morph styling ----
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function cubicBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out = new THREE.Vector3()) {
  const it = 1 - t;
  const b0 = it * it * it, b1 = 3 * it * it * t, b2 = 3 * it * t * t, b3 = t * t * t;
  return out
    .set(0, 0, 0)
    .addScaledVector(p0, b0)
    .addScaledVector(p1, b1)
    .addScaledVector(p2, b2)
    .addScaledVector(p3, b3);
}
function makeArcCurve(from: THREE.Vector3, to: THREE.Vector3) {
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);

  // Raise first, then dip slightly below target
  const lift = Math.max(0.5, from.distanceTo(to) * 0.25);
  const drop = Math.max(0.3, from.distanceTo(to) * 0.15);

  const p1 = new THREE.Vector3(mid.x, mid.y + lift, mid.z);
  const p2 = new THREE.Vector3(to.x, to.y - drop, to.z);

  return { p0: from.clone(), p1, p2, p3: to.clone() };
}

export function createSystem(scene: THREE.Scene, trailsGroup: THREE.Group, imageDeck: any[]): SystemAPI {
  const state = createState(scene, trailsGroup, imageDeck);

  function ensureCardCount(power: number) {
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

  function step(dt: number, ui: { count: number; power: number; showPaths: boolean; spin: boolean }, camera: THREE.PerspectiveCamera) {
    ensureCardCount(ui.power);

    for (const c of state.cards) {
      // If card is in focus animation, let focus controller drive it
      if (c.mode && (c.mode === "focus_in" || c.mode === "focused" || c.mode === "focus_out")) continue;

      // Morphing path (styled shape change)
      if (c.mode === "morph" && c._morph) {
        c._morph.t += dt;
        const u = Math.min(1, c._morph.t / Math.max(1e-6, c._morph.dur));
        const k = easeInOutCubic(u);

        // Arc curve: rise a little, then dip under before target
        const pos = cubicBezier(c._morph.p0, c._morph.p1, c._morph.p2, c._morph.p3, k);
        c.group.position.copy(pos);

        // --- Rotation: single 360° spin around Y ---
        billboardTowardCamera(c, camera, dt); // keep facing camera generally
        const spinAngle = THREE.MathUtils.degToRad(360) * k; // full horizontal spin
        c.group.rotateY(spinAngle - (c._morph.prevSpin || 0)); // incremental delta
        c._morph.prevSpin = spinAngle;

        // Scale pulse optional (still looks nice landing)
        const pulse = 1 + 0.08 * Math.sin(Math.PI * k);
        c.group.scale.setScalar(c._morph.baseScale * pulse);

        // Trails
        (c.trail.material as THREE.LineBasicMaterial).opacity = 0.85;
        state.updateTrail(c, dt, true, camera);

        if (u >= 1) {
          c.mode = "normal";
          c._morph = undefined;
          c.group.scale.setScalar(1);
          (c.trail.material as THREE.LineBasicMaterial).opacity = 0.65;
        }
        continue;
      }

      // Normal sim
      if (!c.alive) spawnCard(state, c, ui.power);

      if (c.opacity < 1) {
        c.opacity = Math.min(1, c.opacity + dt * 2.5);
        const s = THREE.MathUtils.lerp(0.05, 1, c.opacity);
        c.group.scale.setScalar(s);
      }

      let moving = false;
      if (c.state === "flying") {
        integrateFlying(c, dt);
        if (c.group.position.y < K.FLOOR_Y) {
          c.group.position.y = K.FLOOR_Y;
          c.velocity.y = Math.max(0, c.velocity.y);
          c.state = "homing";
        }
        if (ui.spin) {
          c.group.rotation.x += c.angular.x * dt;
          c.group.rotation.y += c.angular.y * dt;
          c.group.rotation.z += c.angular.z * dt;
        }
        if (c.age > c.homingDelay || c.velocity.y < 0 || c.group.position.y < 0.2) c.state = "homing";
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

  function reset(power: number) {
    state._targetsDirty = true;
    for (const c of state.cards) {
      c.mode = "normal";
      c.state = "flying";
      c.opacity = 0;
      c.alive = true;
      c._morph = undefined;
      state.clearTrail(c);
      c.trail.visible = true;
      if (c.group.parent !== scene) scene.add(c.group);
      c.group.quaternion.identity();
      c.prevPos.copy(c.group.position);
      c.prevHead = null;
      spawnCard(state, c, power);
      (c.trail.material as THREE.LineBasicMaterial).opacity = 0.65;
    }
  }

  function morphToNewTargets(camera: THREE.PerspectiveCamera, opts?: { duration?: number }) {
    // Rebuild targets for the *current* shape
    state._targetsDirty = true;
    generateTargets(state);
    state._targetsDirty = false;

    const dur = Math.max(0.25, Math.min(6, opts?.duration ?? 1.6));

    for (const c of state.cards) {
      // world endpoints
      const from = c.group.getWorldPosition(new THREE.Vector3());
      const to = heartLocalToWorld(c.targetLocal);

      // construct a stylish arc
      const bez = makeArcCurve(from, to);

      c.mode = "morph";
      c.state = "homing";
      c.velocity.set(0, 0, 0);
      c.angular.set(0, 0, 0);
      c._morph = { t: 0, dur, p0: bez.p0, p1: bez.p1, p2: bez.p2, p3: bez.p3, baseScale: c.group.scale.x, prevSpin: 0 };

      // ensure trail is visible & brighter during morph
      c.trail.visible = true;
      const mat = c.trail.material as THREE.LineBasicMaterial;
      mat.opacity = 0.9;
    }
  }

  return { ...state.publicAPI, step, reset, ensureCardCount, prepareHeartTargets, morphToNewTargets } as unknown as SystemAPI;
}
