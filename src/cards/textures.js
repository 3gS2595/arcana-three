import { THREE } from '../core/three.js';

const SUITS = ['♠','♥','♦','♣'];
const COLORS = { '♠':'#0a0a0a','♣':'#0a0a0a','♥':'#991111','♦':'#991111' };
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function makeCardFace(rank, suit) {
  const w = 256, h = 356;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#f9fbff'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 6; ctx.strokeRect(6,6,w-12,h-12);

  ctx.fillStyle = COLORS[suit];
  ctx.font = 'bold 40px ui-sans-serif, system-ui, Segoe UI, Roboto';
  ctx.textAlign = 'left'; ctx.textBaseline='top';
  ctx.fillText(rank, 18, 14);
  ctx.font = 'bold 36px ui-sans-serif, system-ui';
  ctx.fillText(suit, 18, 54);

  ctx.textAlign='right';
  ctx.fillText(rank, w-18, h-60);
  ctx.fillText(suit, w-18, h-30);

  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font = 'bold 120px ui-sans-serif, system-ui';
  ctx.globalAlpha = 0.25; ctx.fillText(suit, w/2, h/2); ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeCardBack() {
  const w = 256, h = 356;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0f1f3a'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#6aa8ff'; ctx.lineWidth = 8; ctx.strokeRect(8,8,w-16,h-16);

  ctx.strokeStyle = '#1c66ff'; ctx.lineWidth = 2;
  for (let y=20; y<h-20; y+=16) {
    for (let x=20; x<w-20; x+=16) {
      ctx.beginPath(); ctx.arc(x,y,2.8,0,Math.PI*2); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export function createDeckTextures() {
  const deck = [];
  for (let s of SUITS) for (let r of RANKS) deck.push(makeCardFace(r, s));
  const back = makeCardBack();
  return { deck, back };
}
