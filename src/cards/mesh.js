// src/cards/mesh.js
import { THREE } from '../core/three.js';

export const CARD_W = 0.63 * 1.6;   // legacy default width (used by heart spacing)
export const CARD_H = 0.88 * 1.6;   // fixed height for all image "cards"
export const CARD_T = 0.0025;
export const CARD_MARGIN = 0.002;   // spacing hint used by heart layout
export const TARGET_Z_JITTER = 0.003; // tiny depth jitter to avoid z-fighting

function makeBackTexture() {
  const w = 256, h = 356;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f1f3a'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#6aa8ff'; ctx.lineWidth = 8; ctx.strokeRect(8,8,w-16,h-16);
  ctx.strokeStyle = '#1c66ff'; ctx.lineWidth = 2;
  for (let y=20; y<h-20; y+=16) for (let x=20; x<w-20; x+=16) {
    ctx.beginPath(); ctx.arc(x,y,2.8,0,Math.PI*2); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;
  return tex;
}
export const backTexture = makeBackTexture();

/**
 * Build a “card” mesh from an arbitrary image texture.
 * Height = CARD_H; Width = CARD_H * aspect.
 */
export function makeImageCardMesh(imageTexture, aspect = 1.0) {
  const width = CARD_H * aspect;
  const height = CARD_H;

  const geo = new THREE.PlaneGeometry(width, height, 1, 1);
  const matFront = new THREE.MeshStandardMaterial({
    map: imageTexture,
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

  return { group, width, height };
}
