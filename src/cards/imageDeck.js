// src/cards/imageDeck.js
import { THREE } from '../core/three.js';

/**
 * Discover image URLs in /assets/images/
 * Supports:
 *  - /assets/images/index.json -> ["file1.jpg","file2.png",...]
 *  - Directory listing HTML (http-server) by scraping <a href="...">
 *  - window.ASSET_IMAGES (absolute URLs) as an override
 *
 * Excludes any file whose basename is back.png or back.jpg (case-insensitive),
 * so your card back asset will never appear as a front image.
 */
async function discoverImages(base = '/assets/images/') {
  if (!base.endsWith('/')) base += '/';
  const urls = new Set();

  // From manifest
  try {
    const res = await fetch(base + 'index.json', { cache: 'no-cache' });
    if (res.ok) {
      const list = await res.json();
      for (const n of list) {
        if (/\.(png|jpe?g|webp|gif)$/i.test(n)) urls.add(base + n);
      }
    }
  } catch {}

  // From directory listing
  try {
    const res = await fetch(base, { cache: 'no-cache' });
    if (res.ok) {
      const html = await res.text();
      // accept href="file.png" or href="./file.png"
      const re = /href="(?:\.\/)?([^"]+\.(?:png|jpe?g|webp|gif))"/ig;
      let m;
      while ((m = re.exec(html))) urls.add(base + m[1]);
    }
  } catch {}

  // Override by explicit injection (absolute URLs)
  if (Array.isArray(window?.ASSET_IMAGES)) {
    for (const u of window.ASSET_IMAGES) {
      if (/\.(png|jpe?g|webp|gif)$/i.test(u)) urls.add(u);
    }
  }

  // Filter out any .../back.png or .../back.jpg (case-insensitive)
  const filtered = Array.from(urls).filter(u => {
    try {
      const path = new URL(u, window.location.origin).pathname.toLowerCase();
      const name = path.split('/').pop() || '';
      return !(name === 'back.png' || name === 'back.jpg');
    } catch {
      const low = (u || '').toLowerCase();
      return !(low.endsWith('/back.png') || low.endsWith('/back.jpg'));
    }
  });

  // De-dupe and return
  return Array.from(new Set(filtered));
}

function imageToTexture(img) {
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Loads images from /assets/images/ and returns an array of:
 * { url, texture, aspect, widthPx, heightPx }
 *
 * @param {string} base
 * @param {(loaded:number,total:number)=>void} onProgress optional progress callback
 */
export async function loadImageDeck(base = '/assets/images/', onProgress) {
  const urls = await discoverImages(base);

  const total = urls.length;
  let loaded = 0;
  if (typeof onProgress === 'function') onProgress(loaded, total);

  if (!total) {
    console.warn('[imageDeck] No front images found in', base,
      'Place images there or provide window.ASSET_IMAGES = ["..."]');
    return [];
  }

  const loads = urls.map(url => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (typeof onProgress === 'function') onProgress(loaded, total);
      resolve({ url, img, aspect: img.naturalWidth / img.naturalHeight });
    };
    img.onerror = () => {
      console.warn('[imageDeck] Failed to load', url);
      loaded++;
      if (typeof onProgress === 'function') onProgress(loaded, total);
      resolve(null); // keep progress moving; skip broken file
    };
    img.crossOrigin = 'anonymous'; // safe for same-origin; ignored otherwise
    img.src = url;
  }));

  const entries = (await Promise.all(loads)).filter(Boolean);
  return entries.map(({ url, img, aspect }) => ({
    url,
    texture: imageToTexture(img),
    aspect: Math.max(aspect || 1, 0.05), // guard
    widthPx: img.naturalWidth,
    heightPx: img.naturalHeight,
  }));
}
