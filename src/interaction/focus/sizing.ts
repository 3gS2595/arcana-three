import { THREE } from "@/core/three";
import { CARD_H } from "@/cards/mesh";
import type { SystemCard } from "@/engine/system";

export function viewSizeAt(camera: THREE.PerspectiveCamera, dist: number) {
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const viewH = 2 * Math.tan(vFOV / 2) * dist;
  const viewW = viewH * camera.aspect;
  return { viewW, viewH };
}

export function cardAspect(card: SystemCard) {
  return Math.max(0.05, (card.cardWidth ?? CARD_H) / CARD_H);
}

export function computeFocusScale(
  card: SystemCard,
  camera: THREE.PerspectiveCamera,
  distance: number,
  margin: number,
  fitMode: "contain" | "height"
) {
  const { viewW, viewH } = viewSizeAt(camera, distance);
  const a = cardAspect(card);
  const heightFit = (viewH * margin) / CARD_H;
  const widthFit = (viewW * margin) / (CARD_H * a);
  return fitMode === "height" ? heightFit : Math.min(heightFit, widthFit);
}
