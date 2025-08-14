import { THREE } from "@/core/three";
import { updateHeartFrame, heartLocalToWorld } from "@/engine/heart";
import { createPicker } from "@/interaction/picker";
import { updateTrail as updateTrailLine } from "@/engine/trails";
import { makeCurveTowardCenter } from "./focus/path";
import { makeFocusAnchor, attachToAnchor } from "./focus/attachment";
import { computeFocusScale } from "./focus/sizing";
import { stepAnimation } from "./focus/animation";
import type { AnimState } from "./focus/animation";
import type { SystemAPI, SystemCard } from "@/engine/system";

export interface FocusOptions {
  distance?: number;
  margin?: number; // 1.0 exact, <1 inset
  fitMode?: "contain" | "height";
  animDur?: number;
}
export interface FocusController {
  update: (dt: number) => void;
  clear: () => void;
  dispose: () => void;
}

export function createFocusController({
  camera,
  scene,
  renderer,
  system,
  options = {}
}: {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  system: SystemAPI;
  options?: FocusOptions;
}): FocusController {
  const cfg = {
    distance: options.distance ?? 0.8,
    margin: options.margin ?? 1.0,
    fitMode: options.fitMode ?? "contain",
    animDur: options.animDur ?? 1.2
  };

  const picker = createPicker(camera, renderer, system);
  const animating = new Set<SystemCard>();
  const focusAnchor = makeFocusAnchor(camera, cfg.distance);

  const worldPosOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const worldQuatOf = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());

  function startCurveAnim(
    card: SystemCard,
    curve: ReturnType<typeof makeCurveTowardCenter>,
    toQuat: THREE.Quaternion,
    toScale: number,
    dur: number,
    onDone: () => void
  ) {
    const fromQuat = worldQuatOf(card.group);
    const fromScale = card.group.scale.x;
    (card as any)._anim = {
      t: 0,
      dur,
      curve,
      fromQuat,
      toQuat: toQuat.clone(),
      fromScale,
      toScale
    } as AnimState;
    (card as any)._onAnimDone = onDone;
    animating.add(card);
  }

  function updateAnimations(dt: number) {
    if (!animating.size) return;
    for (const card of Array.from(animating)) {
      const state = (card as any)._anim as AnimState | undefined;
      if (!state) {
        animating.delete(card);
        continue;
      }
      // ensure under scene while animating
      if (card.group.parent !== scene) scene.add(card.group);
      const done = stepAnimation(card.group, state, dt);
      // trails during animation
      card.trail.visible = true;
      updateTrailLine(card, dt, true, camera);

      if (done) {
        animating.delete(card);
        (card as any)._anim = undefined;
        const onDone = (card as any)._onAnimDone as (() => void) | undefined;
        (card as any)._onAnimDone = undefined;
        onDone?.();
      }
    }
  }

  function focusCard(card: SystemCard) {
    card._preFocusQuat = worldQuatOf(card.group).clone();
    card.velocity.set(0, 0, 0);
    card.angular.set(0, 0, 0);
    card.state = "homing";
    card.opacity = 1;
    card.mode = "focus_in";

    const startPos = worldPosOf(card.group);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const targetPos = camPos.clone().add(camDir.multiplyScalar(cfg.distance));
    const targetQuatWorld = camera.getWorldQuaternion(new THREE.Quaternion());
    const s = computeFocusScale(card, camera, cfg.distance, cfg.margin, cfg.fitMode);
    const bez = makeCurveTowardCenter(startPos, targetPos);
    card.trail.visible = true;

    startCurveAnim(card, bez, targetQuatWorld, s, cfg.animDur, () => {
      attachToAnchor(focusAnchor, card.group);
      card.group.scale.setScalar(s);
      card.mode = "focused";
      updateTrailLine(card, 0, false, camera); // decay
    });
  }

  function releaseCard(card: SystemCard) {
    const curWorldPos = worldPosOf(card.group);
    const curWorldQuat = worldQuatOf(card.group);
    const curScale = card.group.scale.x;

    if (card.group.parent !== scene) {
      scene.add(card.group);
      card.group.position.copy(curWorldPos);
      card.group.quaternion.copy(curWorldQuat);
      card.group.scale.setScalar(curScale);
    }

    updateHeartFrame(camera);
    const targetWorld = heartLocalToWorld(card.targetLocal);
    card.mode = "focus_out";
    card.trail.visible = true;

    const bez = makeCurveTowardCenter(curWorldPos, targetWorld);
    const targetQuatBack = card._preFocusQuat?.clone() ?? curWorldQuat.clone();

    startCurveAnim(card, bez, targetQuatBack, 1.0, cfg.animDur, () => {
      card.mode = "normal";
      card.state = "homing";
      card.velocity.set(0, 0, 0);
      card.angular.set(0, 0, 0);
    });
  }

  function clear() {
    for (const card of system.cards) {
      (card as any)._anim = undefined;
      (card as any)._onAnimDone = undefined;
      if (card.mode && card.mode !== "normal") {
        const pos = worldPosOf(card.group);
        const quat = worldQuatOf(card.group);
        const scl = card.group.scale.x;
        if (card.group.parent !== scene) scene.add(card.group);
        card.group.position.copy(pos);
        card.group.quaternion.copy(quat);
        card.group.scale.setScalar(scl);
        card.mode = "normal";
        card.state = "homing";
        card.velocity.set(0, 0, 0);
        card.angular.set(0, 0, 0);
      }
    }
  }

  const onResize = () => {
    for (const c of system.cards) {
      if (c.mode === "focused" && !(c as any)._anim) {
        const s = computeFocusScale(c, camera, cfg.distance, cfg.margin, cfg.fitMode);
        c.group.scale.setScalar(s);
      }
    }
  };
  window.addEventListener("resize", onResize);

  const onClick = (e: MouseEvent) => {
    const card = picker.pick(e.clientX, e.clientY);
    if (!card) return;
    if (card.mode === "focused" || card.mode === "focus_in") {
      releaseCard(card);
    } else {
      for (const c of system.cards)
        if (c !== card && (c.mode === "focused" || c.mode === "focus_in")) releaseCard(c);
      focusCard(card);
    }
  };
  renderer.domElement.addEventListener("click", onClick);

  return {
    update(dt: number) {
      for (const c of system.cards) {
        if (c.mode === "focused" && !(c as any)._anim && c.trail.visible) {
          updateTrailLine(c, dt, false, camera);
        }
      }
      updateAnimations(dt);
    },
    clear,
    dispose() {
      renderer.domElement.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      clear();
      if (focusAnchor.parent) focusAnchor.parent.remove(focusAnchor);
    }
  };
}
