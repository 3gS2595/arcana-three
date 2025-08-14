import { THREE } from '../../core/three.js';

export const GRAVITY = new THREE.Vector3(0, -9.8, 0);
export const DRAG = 0.12;
export const FLOOR_Y = 0.02;

export const EMITTER_POS = new THREE.Vector3(0, 1.0, 0);

export const CARD_MARGIN_ABS = 0.5;   // world units between neighbors
export const SIDE_BUFFER_ABS = 0.0;   // extra per-card padding

export const BILLBOARD_MODE = 'capped';
export const BILLBOARD_MAX_DEG_PER_SEC = 240;

export const LOCK_DIST_SQ = 0.0009;
export const SPEED_EPS_SQ = 0.0004;
export const HEAD_MOVE_EPS_SQ = 0.000025;

export const HOMING_POS_SPEED = 3.5;
