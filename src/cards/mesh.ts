import { THREE } from "@/core/three";
// import back.png as a module URL so Vite serves it correctly
import backUrl from "@/assets/back.png?url";

export const CARD_W = 0.63 * 1.6;
export const CARD_H = 0.88 * 1.6;
export const CARD_T = 0.0025;
export const CARD_MARGIN = 0.002;
export const TARGET_Z_JITTER = 0.003;

let _baseBackTexture: THREE.Texture | null = null;
function loadBaseBackTexture(): THREE.Texture {
  if (_baseBackTexture) return _baseBackTexture;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(backUrl);
  tex.anisotropy = 8;
  if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  _baseBackTexture = tex;
  return tex;
}
export const backTexture = loadBaseBackTexture();

export interface BuiltCard {
  group: THREE.Group;
  width: number;
  height: number;
}

/** front/back card; back is rotated for landscape fronts */
export function makeImageCardMesh(imageTexture: THREE.Texture, aspect = 1.0): BuiltCard {
  const width = CARD_H * Math.max(aspect, 0.05);
  const height = CARD_H;

  const geo = new THREE.PlaneGeometry(width, height, 1, 1);

  const matFront = new THREE.MeshStandardMaterial({
    map: imageTexture,
    metalness: 0.0,
    roughness: 0.9,
    side: THREE.FrontSide
  });

  const base = loadBaseBackTexture();
  const backTex = base.clone();
  backTex.needsUpdate = true;
  backTex.center.set(0.5, 0.5);
  backTex.rotation = aspect > 1.0 ? Math.PI * 0.5 : 0.0;

  const matBack = new THREE.MeshStandardMaterial({
    map: backTex,
    metalness: 0.0,
    roughness: 0.9,
    side: THREE.BackSide
  });

  const front = new THREE.Mesh(geo, matFront);
  const back = new THREE.Mesh(geo, matBack);
  back.rotateY(Math.PI);
  front.position.z = CARD_T;
  back.position.z = -CARD_T;

  const group = new THREE.Group();
  group.add(front, back);

  return { group, width, height };
}
