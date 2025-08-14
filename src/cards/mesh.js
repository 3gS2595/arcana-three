// src/cards/mesh.js
import { THREE } from '../core/three.js';

/**
 * Card sizing (kept): height is our canonical unit; width scales by image aspect.
 * This preserves your heart spacing logic that keys off built.width.
 */
export const CARD_W = 0.63 * 1.6;   // legacy width hint (unused directly for geometry)
export const CARD_H = 0.88 * 1.6;   // canonical card height in world units
export const CARD_T = 0.0025;
export const CARD_MARGIN = 0.002;   // spacing hint used by heart layout
export const TARGET_Z_JITTER = 0.003; // tiny depth jitter to avoid z-fighting

// --- Back texture loader (new) -----------------------------------------------
// Uses /assets/back.jpg for the card back image.
// We clone & rotate per-card so landscape fronts can get a 90°-rotated back.
let _baseBackTexture = null;
function loadBaseBackTexture() {
  if (_baseBackTexture) return _baseBackTexture;
  const loader = new THREE.TextureLoader();
  const tex = loader.load('/assets/back.png'); // returns immediately; updates when loaded
  tex.anisotropy = 8;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  _baseBackTexture = tex;
  return _baseBackTexture;
}

// Keep named export for compatibility (not used elsewhere, but harmless).
export const backTexture = loadBaseBackTexture();

// -----------------------------------------------------------------------------
// (Old canvas back removed in favor of assets/back.jpg as requested.)
// -----------------------------------------------------------------------------

/**
 * Build a “card” mesh from an arbitrary image texture.
 * - Height = CARD_H; Width = CARD_H * aspect (so portrait/landscape/square match the image).
 * - Back face uses /assets/back.jpg:
 *     * portrait (aspect <= 1): use as-is (portrait orientation)
 *     * landscape (aspect > 1): rotate the back 90° so it reads landscape
 *     * square: treated as portrait
 */
export function makeImageCardMesh(imageTexture, aspect = 1.0) {
  const width = CARD_H * Math.max(aspect, 0.05); // guard against degenerate aspects
  const height = CARD_H;

  // Shared geometry for both sides
  const geo = new THREE.PlaneGeometry(width, height, 1, 1);

  // Front material (image)
  const matFront = new THREE.MeshStandardMaterial({
    map: imageTexture,
    metalness: 0.0,
    roughness: 0.9,
    side: THREE.FrontSide
  });

  // Back material (assets/back.jpg), rotated for landscape
  const base = loadBaseBackTexture();
  const backTex = base.clone(); // share image data; independent transform per card
  backTex.needsUpdate = true;
  backTex.center.set(0.5, 0.5);

  // Orientation rules:
  // - portrait or square => 0°
  // - landscape          => 90°
  if (aspect > 1.0) {
    backTex.rotation = Math.PI * 0.5; // 90° for landscape backs
  } else {
    backTex.rotation = 0.0;           // portrait & square use as-is
  }

  const matBack = new THREE.MeshStandardMaterial({
    map: backTex,
    metalness: 0.0,
    roughness: 0.9,
    side: THREE.BackSide
  });

  // Assemble front/back into a single group with a tiny thickness offset
  const group = new THREE.Group();
  const front = new THREE.Mesh(geo, matFront);
  const back  = new THREE.Mesh(geo, matBack);

  // Face the back outward
  back.rotateY(Math.PI);

  // Give a hint of thickness so both faces render cleanly
  front.position.z = CARD_T;
  back.position.z = -CARD_T;

  group.add(front);
  group.add(back);

  return { group, width, height };
}
