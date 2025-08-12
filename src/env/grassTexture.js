import { THREE } from '../core/three.js';

export function makeGrassTexture({w=1024, h=1024, hue=100, sat=45, light=30, noise=0.12, tuftCount=800} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
  ctx.fillRect(0,0,w,h);

  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  for (let i=0; i<d.length; i+=4) {
    const n = (Math.random()-0.5)*255*noise;
    d[i  ] = Math.min(255, Math.max(0, d[i  ] + n*0.3));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + n*0.2));
  }
  ctx.putImageData(img, 0, 0);

  ctx.lineWidth = 1;
  for (let i=0;i<tuftCount;i++){
    const x = Math.random()*w;
    const y = Math.random()*h;
    const len = 6 + Math.random()*18;
    const ang = -Math.PI/2 + (Math.random()*0.6 - 0.3);
    ctx.strokeStyle = `hsla(${hue+Math.random()*12-6}, ${sat+10}%, ${light+25}%, ${0.25+Math.random()*0.35})`;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x + Math.cos(ang)*len, y + Math.sin(ang)*len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
  return tex;
}
