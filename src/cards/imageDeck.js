// src/cards/imageDeck.js
import { THREE } from '../core/three.js';

// Prefer an /assets/images/index.json (array of filenames). Fallback: scrape directory listing.
async function listImages(base = '/assets/images/') {
  try {
    const res = await fetch(base + 'index.json', { cache: 'no-cache' });
    if (res.ok) {
      const files = await res.json();
      return files
        .filter(n => /\.(png|jpe?g|webp|gif)$/i.test(n))
        .map(n => base + n);
    }
  } catch {}

  try {
    const res = await fetch(base, { cache: 'no-cache' });
    if (res.ok) {
      const html = await res.text();
      const urls = [];
      const re = /href="([^"]+\.(?:png|jpe?g|webp|gif))"/ig;
      let m;
      while ((m = re.exec(html))) urls.push(base + m[1]);
      if (urls.length) return urls;
    }
  } catch {}

  if (Array.isArray(window?.ASSET_IMAGES)) {
    return window.ASSET_IMAGES.filter(u => /\.(png|jpe?g|webp|gif)$/i.test(u));
  }

  console.warn('[imageDeck] No images found in', base);
  return [];
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
 * Loads all images from /assets/images/ and returns an array of:
 * { url, texture, aspect, widthPx, heightPx }
 */
export async function loadImageDeck(base = '/assets/images/') {
  const urls = await listImages(base);
  const loads = urls.map(url => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ url, img, aspect: img.naturalWidth / img.naturalHeight });
    img.onerror = (e) => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  }));

  const entries = await Promise.all(loads);
  return entries.map(({ url, img, aspect }) => ({
    url,
    texture: imageToTexture(img),
    aspect: Math.max(aspect || 1, 0.05), // guard
    widthPx: img.naturalWidth,
    heightPx: img.naturalHeight,
  }));
}
