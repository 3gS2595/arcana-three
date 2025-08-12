// src/sim/system.js
import { THREE } from '../core/three.js';
import { makeImageCardMesh } from '../cards/mesh.js';
import { makeTrail, updateTrail, clearTrail } from './trails.js';
import { generateHeartPoints, heartLocalToWorld, heartFrame } from './heart.js';

const rng = (min, max) => min + Math.random() * (max - min);
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const DRAG = 0.12;
const FLOOR_Y = 0.02;
const emitterPos = new THREE.Vector3(0, 1.0, 0);

// Billboard behavior
const BILLBOARD_MODE = 'capped'; // 'instant' | 'capped'
const BILLBOARD_MAX_DEG_PER_SEC = 240;

export function createSystem(scene, trailsGroup, imageDeck /* [{texture, aspect}] */) {
  const cards = [];
  let heartTargets = [];
  const deck = imageDeck || [];

  // Continuous homing tunables
  const HOMING_POS_SPEED = 2.5;
  const MOVE_EPS = 0.0006;

  function spawnCard(obj, power = 50) {
    if (obj.group.parent !== scene) scene.add(obj.group);

    obj.group.position.copy(emitterPos).add(new THREE.Vector3(rng(-0.05, 0.05), 0, rng(-0.05, 0.05)));
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
  }

  // EXACTLY one card per image
  function ensureCardCount(power) {
    const n = deck.length;

    while (cards.length < n) {
      const i = cards.length;
      const entry = deck[i];
      const built = makeImageCardMesh(entry?.texture, entry?.aspect ?? 1.0);
      const group = built.group;

      const trail = makeTrail(0xff0000, 40);
      trailsGroup.add(trail); scene.add(group);

      const obj = {
        group, trail,
        velocity: new THREE.Vector3(),
        angular: new THREE.Vector3(),
        age: 0, alive: false, opacity: 0,
        state: 'flying',
        targetLocal: new THREE.Vector3(),
        homingDelay: 1,
        prevPos: new THREE.Vector3()
      };
      spawnCard(obj, power);
      cards.push(obj);
    }

    while (cards.length > n) {
      const obj = cards.pop();
      if (obj.group.parent) obj.group.parent.remove(obj.group);
      trailsGroup.remove(obj.trail);
    }

    heartTargets = generateHeartPoints(n);
    for (let i = 0; i < cards.length; i++) {
      cards[i].targetLocal = heartTargets[i % heartTargets.length].clone();
    }
  }

  function billboardTowardCamera(obj, camera, dt) {
    const target = new THREE.Object3D();
    target.position.copy(obj.group.position);
    target.up.copy(heartFrame.up);
    target.lookAt(camera.position);
    const qTarget = target.quaternion;

    if (BILLBOARD_MODE === 'instant') {
      obj.group.quaternion.copy(qTarget);
      return;
    }
    const qCurrent = obj.group.quaternion;
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(qCurrent.dot(qTarget)), 0, 1));
    if (angle < 1e-4) {
      obj.group.quaternion.copy(qTarget);
      return;
    }
    const maxRad = (BILLBOARD_MAX_DEG_PER_SEC * Math.PI / 180) * dt;
    const t = Math.min(1, maxRad / angle);
    obj.group.quaternion.slerp(qTarget, t);
  }

  function prepareHeartTargets() {
    const n = deck.length;
    heartTargets = generateHeartPoints(n);
    for (let i = 0; i < cards.length; i++) {
      cards[i].targetLocal = heartTargets[i % heartTargets.length].clone();
    }
  }

  function homeTowards(obj, targetWorld, dt) {
    const posFactor = 1 - Math.exp(-dt * HOMING_POS_SPEED);
    obj.group.position.lerp(targetWorld, posFactor);
    obj.velocity.multiplyScalar(0.85);
    obj.angular.multiplyScalar(0.85);
  }

  function step(dt, { power, spin, showPaths }, camera) {
    ensureCardCount(power);

    for (const obj of cards) {
      if (!obj.alive) spawnCard(obj, power);

      if (obj.opacity < 1) {
        obj.opacity = Math.min(1, obj.opacity + dt * 2.5);
        const s = THREE.MathUtils.lerp(0.05, 1, obj.opacity);
        obj.group.scale.setScalar(s);
      }

      obj.age += dt;

      if (obj.state === 'flying') {
        const ax = -DRAG * obj.velocity.x;
        const ay = GRAVITY.y - DRAG * obj.velocity.y;
        const az = -DRAG * obj.velocity.z;

        obj.velocity.x += ax * dt;
        obj.velocity.y += ay * dt;
        obj.velocity.z += az * dt;

        obj.group.position.x += obj.velocity.x * dt;
        obj.group.position.y += obj.velocity.y * dt;
        obj.group.position.z += obj.velocity.z * dt;

        if (obj.group.position.y < FLOOR_Y) {
          obj.group.position.y = FLOOR_Y;
          if (obj.velocity.y < 0) obj.velocity.y = 0;
          obj.state = 'homing';
        }

        if (spin) {
          obj.group.rotation.x += obj.angular.x * dt;
          obj.group.rotation.y += obj.angular.y * dt;
          obj.group.rotation.z += obj.angular.z * dt;
        }

        if (obj.age > obj.homingDelay || obj.velocity.y < 0) obj.state = 'homing';
        if (obj.group.position.y < 0.2) obj.state = 'homing';

      } else if (obj.state === 'homing') {
        const targetWorld = heartLocalToWorld(obj.targetLocal);
        homeTowards(obj, targetWorld, dt);
        billboardTowardCamera(obj, camera, dt);
      }

      // TRAILS
      if (showPaths) {
        obj.trail.visible = true;
        const moved = obj.prevPos.distanceToSquared(obj.group.position) > MOVE_EPS;
        updateTrail(obj, dt, moved, camera);
        if (moved) obj.prevPos.copy(obj.group.position);
      } else {
        if (obj.trail.visible) {
          clearTrail(obj);
        }
        obj.trail.visible = false;
      }
    }
    return false;
  }

  function reset(power) {
    heartTargets = generateHeartPoints(deck.length);
    cards.forEach((c, i) => {
      c.targetLocal = heartTargets[i % heartTargets.length].clone();
      c.state = 'flying';
      c.opacity = 0;
      c.alive = true;
      clearTrail(c);
      c.trail.visible = true;
      if (c.group.parent !== scene) {
        scene.add(c.group);
        c.group.quaternion.identity();
      }
      c.prevPos.copy(c.group.position);
      spawnCard(c, power);
    });
  }

  function getHeartBoundsWorld() {
    const n = heartTargets?.length || 0;
    if (!n) return null;
    const min = new THREE.Vector3(+Infinity, +Infinity, +Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < n; i++) {
      const p = heartLocalToWorld(heartTargets[i]);
      if (p.x < min.x) min.x = p.x;
      if (p.y < min.y) min.y = p.y;
      if (p.z < min.z) min.z = p.z;
      if (p.x > max.x) max.x = p.x;
      if (p.y > max.y) max.y = p.y;
      if (p.z > max.z) max.z = p.z;
    }
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const size = new THREE.Vector3().subVectors(max, min);
    return { center, size, minY: min.y, maxY: max.y, min, max };
  }

  function getHeartBottomWorld() {
    const n = heartTargets?.length || 0;
    if (!n) return null;
    let minY = Infinity;
    let best = null;
    for (let i = 0; i < n; i++) {
      const p = heartLocalToWorld(heartTargets[i]);
      if (p.y < minY) { minY = p.y; best = p; }
    }
    return best ? best.clone() : null;
  }

  return { cards, step, reset, ensureCardCount, prepareHeartTargets, getHeartBoundsWorld, getHeartBottomWorld };
}
