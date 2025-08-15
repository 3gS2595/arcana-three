// src/shapes/index.ts
import { THREE } from "@/core/three";
import { generateHeartPointsVariable as heartVar } from "./heart";
import { generateStarPointsVariable as starVar } from "./star";
import { generateHourglassPointsVariable as hourVar } from "./hourglass";

export type ShapeId = "heart" | "star" | "hourglass";

// Order of cycling:
const ORDER: ShapeId[] = ["heart", "star", "hourglass"];

let current: ShapeId = "heart";

/** Shape-change listeners (pub/sub) */
type ShapeChangeListener = (id: ShapeId) => void;
const listeners = new Set<ShapeChangeListener>();

/** Subscribe to shape changes; returns an unsubscribe function. */
export function onShapeChange(fn: ShapeChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const fn of listeners) fn(current);
}

export function getCurrentShapeId(): ShapeId {
  return current;
}

export function setCurrentShapeId(id: ShapeId) {
  current = id;
  notify();
}

export function cycleShape(): ShapeId {
  const i = ORDER.indexOf(current);
  current = ORDER[(i + 1) % ORDER.length];
  notify();
  return current;
}

/**
 * Generate local-XY points for the current shape given per-card spacings (world units).
 * Returned points are in the shape's LOCAL frame; consumers must call heartLocalToWorld(...)
 * (which is really the camera-facing frame) to place in world space.
 */
export function getPointsForSpacings(spacings: number[]): THREE.Vector3[] {
  switch (current) {
    case "heart":      return heartVar(spacings);
    case "star":       return starVar(spacings);
    case "hourglass":  return hourVar(spacings);
  }
}
