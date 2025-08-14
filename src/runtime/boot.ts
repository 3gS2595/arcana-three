import { THREE } from "@/core/three";
import { setupFrameOverlay } from "@/runtime/overlayFrame";
import { loadImageDeck } from "@/cards/imageDeck";

export interface BootResult {
  frameOverlay: Awaited<ReturnType<typeof setupFrameOverlay>>;
  imageDeck: Awaited<ReturnType<typeof loadImageDeck>>;
}

export async function runBoot(scene: THREE.Scene): Promise<BootResult> {
  const $boot = document.getElementById("boot")!;
  const $viewport = document.getElementById("viewport")!;
  const $fill = document.getElementById("bootProgressFill") as HTMLDivElement;
  const $pct = document.getElementById("bootPercent")!;
  const $status = document.getElementById("bootStatus")!;
  const $start = document.getElementById("bootStart") as HTMLButtonElement;

  const setProgress = (p: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(p)));
    $fill.style.width = clamped + "%";
    $pct.textContent = clamped + "%";
  };
  const setStatus = (s: string) => ($status.textContent = s);

  let mgrLoaded = 0,
    mgrTotal = 0;
  const mgr = THREE.DefaultLoadingManager;
  mgr.onStart = (_url, _loaded, total) => {
    mgrTotal = total || 0;
    mgrLoaded = _loaded || 0;
  };
  mgr.onProgress = (_url, loaded, total) => {
    mgrLoaded = loaded || 0;
    mgrTotal = total || 0;
    refresh();
  };
  mgr.onLoad = () => {
    mgrLoaded = mgrTotal;
    refresh();
  };
  mgr.onError = (url) => console.warn("[loader] error:", url);

  let deckLoaded = 0,
    deckTotal = 0;
  function refresh() {
    const m = mgrTotal > 0 ? mgrLoaded / mgrTotal : 0;
    const d = deckTotal > 0 ? deckLoaded / deckTotal : 0;
    const both = mgrTotal > 0 && deckTotal > 0;
    const pct = 100 * (both ? 0.5 * m + 0.5 * d : Math.max(m, d));
    setProgress(pct);
  }

  setStatus("Preparing assets…");

  const preloadBack = () =>
    new Promise<void>((resolve) => {
      const tl = new THREE.TextureLoader();
      tl.load("/assets/back.png", () => resolve(), undefined, () => resolve());
    });

  const overlayPromise = (async () => setupFrameOverlay(scene))();
  const backPromise = preloadBack();
  const deckPromise = (async () =>
    loadImageDeck("/assets/images/", (loaded, total) => {
      deckLoaded = loaded;
      deckTotal = total;
      refresh();
    }))();

  const [frameOverlay, _backOK, imageDeck] = await Promise.all([overlayPromise, backPromise, deckPromise]);

  setStatus(imageDeck.length ? "Ready" : "No images found in /assets/images/");
  setProgress(100);
  $start.disabled = false;

  await new Promise<void>((resolve) => $start.addEventListener("click", () => resolve(), { once: true }));

  // fade-in overlay gracefully
  frameOverlay.setOpacity(0);
  $boot.classList.add("hidden");
  $viewport.classList.remove("hidden");
  await frameOverlay.fadeIn(450);

  return { frameOverlay, imageDeck };
}
