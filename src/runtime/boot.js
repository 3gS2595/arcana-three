// src/runtime/boot.js
import { THREE } from '../core/three.js';
import { setupFrameOverlay } from './overlayFrame.js';
import { loadImageDeck } from '../cards/imageDeck.js';

/**
 * Unified loading bar (THREE manager + image deck).
 * Returns: { frameOverlay, imageDeck }
 */
export async function runBoot(scene) {
  // UI hooks
  const $boot = document.getElementById('boot');
  const $viewport = document.getElementById('viewport');
  const $fill = document.getElementById('bootProgressFill');
  const $pct = document.getElementById('bootPercent');
  const $status = document.getElementById('bootStatus');
  const $start = document.getElementById('bootStart');

  function setProgress(p) {
    const clamped = Math.max(0, Math.min(100, Math.round(p)));
    $fill.style.width = clamped + '%';
    $pct.textContent = clamped + '%';
  }
  function setStatus(s) { $status.textContent = s; }

  // THREE-managed loads
  let mgrLoaded = 0, mgrTotal = 0;
  const mgr = THREE.DefaultLoadingManager;
  mgr.onStart = (_url, _loaded, total) => { mgrTotal = total || 0; mgrLoaded = _loaded || 0; };
  mgr.onProgress = (_url, loaded, total) => { mgrLoaded = loaded || 0; mgrTotal = total || 0; refresh(); };
  mgr.onLoad = () => { mgrLoaded = mgrTotal; refresh(); };
  mgr.onError = (url) => { console.warn('[loader] error:', url); };

  // Deck (HTMLImage)
  let deckLoaded = 0, deckTotal = 0;

  function refresh() {
    // Single % = 50% manager + 50% deck (or whichever is present)
    const m = mgrTotal > 0 ? (mgrLoaded / mgrTotal) : 0;
    const d = deckTotal > 0 ? (deckLoaded / deckTotal) : 0;
    const both = (mgrTotal > 0) && (deckTotal > 0);
    const pct = 100 * (both ? (0.5 * m + 0.5 * d) : Math.max(m, d));
    setProgress(pct);
  }

  setStatus('Preparing assets…');

  // Preload back texture so it participates in THREE manager progress
  const preloadBack = () => new Promise((resolve) => {
    const tl = new THREE.TextureLoader();
    tl.load('/assets/back.png', () => resolve(), undefined, () => resolve());
  });

  // Load overlay (GLB) + back.png + deck in parallel
  const overlayPromise = (async () => {
    const fo = await setupFrameOverlay(scene);
    return fo;
  })();

  const backPromise = preloadBack();

  const deckPromise = (async () => {
    const deck = await loadImageDeck('/assets/images/', (loaded, total) => {
      deckLoaded = loaded; deckTotal = total; refresh();
    });
    return deck;
  })();

  const [frameOverlay, _backOK, imageDeck] = await Promise.all([overlayPromise, backPromise, deckPromise]);

  // If no images found, keep UI honest and still allow Start
  if (!Array.isArray(imageDeck) || imageDeck.length === 0) {
    setStatus('No images found in /assets/images/');
  } else {
    setStatus('Ready');
  }
  setProgress(100);
  $start.disabled = false;

  // Wait for user click
  await new Promise((resolve) => {
    $start.addEventListener('click', resolve, { once: true });
  });

  // Show app
  $boot.classList.add('hidden');
  $viewport.classList.remove('hidden');

  return { frameOverlay, imageDeck };
}
