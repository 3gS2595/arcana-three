import { THREE } from '../core/three.js';

export function buildSkyDome({radius=500} = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0,0,0,c.height);
  g.addColorStop(0.0, '#7fc8ff');
  g.addColorStop(0.6, '#a8d8ff');
  g.addColorStop(1.0, '#e6f3ff');
  ctx.fillStyle = g; ctx.fillRect(0,0,c.width,c.height);

  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;

  const geom = new THREE.SphereGeometry(radius, 32, 16);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
  const dome = new THREE.Mesh(geom, mat);
  return dome;
}
