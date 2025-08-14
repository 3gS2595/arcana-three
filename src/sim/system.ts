import { THREE } from "@/core/three";
import * as K from "@/sim/system/constants";
import { createState } from "@/sim/system/state";
import { spawnCard, ensurePool } from "@/sim/system/spawn";
import { integrateFlying } from "@/sim/system/physics";
import { homeTowards } from "@/sim/system/homing";
import { billboardTowardCamera } from "@/sim/system/billboard";
import { decideTrail } from "@/sim/system/trailsDriver";
import { generateTargets, heartLocalToWorld } from "@/sim/system/targets";

export interface SystemCard {
  group: THREE.Group;
  trail: THREE.Line;
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  age: number;
  alive: boolean;
  opacity: number;
  state: "flying" | "homing";
  mode: "normal" | "focus_in" | "focused" | "focus_out";
  targetLocal: THREE.Vector3;
  homingDelay: number;
  prevPos: THREE.Vector3;
  prevHead: THREE.Vector3 | null;
  cardWidth?: number;
  _preFocusQuat?: THREE.Quaternion;
}

export interface SystemAPI {
  cards: SystemCard[];
  getHeartBoundsWorld: (() => { center: THREE.Vector3; size: THREE.Vector3; minY: number; maxY: number } | null) | null;
  getHeartBottomWorld: (() => THREE.Vector3 | null) | null;
  step: (dt: number, ui: { count: number; power: number; showPaths: boolean; spin: boolean }, camera: THREE.PerspectiveCamera) => void;
  reset: (power: number) => void;
  ensureCardCount: (power: number) => void;
  prepareHeartTargets: () => void;
  updateTrail: (c: SystemCard, dt: number, moving: boolean, camera: THREE.PerspectiveCamera) => void;
  clearTrail: (c: SystemCard) => void;
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
      if (c.mode && c.mode !== "normal") continue;

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
      state.clearTrail(c);
      c.trail.visible = true;
      if (c.group.parent !== scene) scene.add(c.group);
      c.group.quaternion.identity();
      c.prevPos.copy(c.group.position);
      c.prevHead = null;
      spawnCard(state, c, power);
    }
  }

  return { ...state.publicAPI, step, reset, ensureCardCount, prepareHeartTargets } as unknown as SystemAPI;
}
