import { THREE } from '../core/three.js';

export const CARD_W = 0.63 * 1.6;
export const CARD_H = 0.88 * 1.6;
export const CARD_T = 0.0025;

export const CARD_MARGIN = CARD_W * 0.35;
export const TARGET_Z_JITTER = 0.02;

export function makeCardMesh(deckTextures, backTexture) {
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
  const matFront = new THREE.MeshStandardMaterial({
    map: deckTextures[Math.floor(Math.random()*deckTextures.length)],
    metalness: 0.0, roughness: 0.9, side: THREE.FrontSide
  });
  const matBack = new THREE.MeshStandardMaterial({
    map: backTexture, metalness: 0.0, roughness: 0.9, side: THREE.BackSide
  });

  const group = new THREE.Group();
  const front = new THREE.Mesh(geo, matFront);
  const back  = new THREE.Mesh(geo, matBack);
  back.rotateY(Math.PI);
  front.position.z = CARD_T; back.position.z = -CARD_T;
  group.add(front); group.add(back);
  return group;
}
