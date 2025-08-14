import { THREE } from "@/core/three";

export interface DeckEntry {
  url: string;
  texture: THREE.Texture;
  aspect: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Prefer bundler discovery (no HTTP) by importing URLs for all images
 * under src/assets/images/. Falls back to HTTP + window override if empty.
 */
function discoverViaBuild(): string[] {
  // eager + as:'url' gives a map of {path: urlString}
  const modules = import.meta.glob(
    "/src/assets/images/**/*.{png,jpg,jpeg,webp,gif}",
    { eager: true, as: "url" }
  ) as Record<string, string>;

  const urls = Object.values(modules);

  // filter out any 'back.png' / 'back.jpg' if someone dropped it here by mistake
  return urls.filter((u) => {
    const name = u.toLowerCase().split("/").pop() ?? "";
    return !(name === "back.png" || name === "back.jpg");
  });
}

async function discoverViaHttp(base = "/assets/images/"): Promise<string[]> {
  if (!base.endsWith("/")) base += "/";
  const urls = new Set<string>();

  // Optional manifest for public deployments
  try {
    const res = await fetch(base + "index.json", { cache: "no-cache" });
    if (res.ok) {
      const list = (await res.json()) as string[];
      for (const n of list) if (/\.(png|jpe?g|webp|gif)$/i.test(n)) urls.add(base + n);
    }
  } catch {}

  // Directory listing (won’t work on Vite dev; kept for static servers)
  try {
    const res = await fetch(base, { cache: "no-cache" });
    if (res.ok) {
      const html = await res.text();
      const re = /href="(?:\.\/)?([^"]+\.(?:png|jpe?g|webp|gif))"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) urls.add(base + m[1]);
    }
  } catch {}

  // window override
  if (Array.isArray(window?.ASSET_IMAGES)) {
    for (const u of window.ASSET_IMAGES) if (/\.(png|jpe?g|webp|gif)$/i.test(u)) urls.add(u);
  }

  const filtered = [...urls].filter((u) => {
    const name = u.toLowerCase().split("/").pop() ?? "";
    return !(name === "back.png" || name === "back.jpg");
  });

  return [...new Set(filtered)];
}

function imageToTexture(img: HTMLImageElement): THREE.Texture {
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  return tex;
}

export async function loadImageDeck(
  base = "/assets/images/",
  onProgress?: (loaded: number, total: number) => void
): Promise<DeckEntry[]> {
  // 1) Try build-time discovery (Option A)
  let urls = discoverViaBuild();

  // 2) Fallback to HTTP discovery (public deployments) only if build found none
  if (urls.length === 0) {
    urls = await discoverViaHttp(base);
  }

  const total = urls.length;
  let loaded = 0;
  onProgress?.(loaded, total);

  if (!total) {
    console.warn("[imageDeck] No front images found.", {
      hint: "Put images under src/assets/images/ for automatic discovery, or provide public/assets/images/index.json, or set window.ASSET_IMAGES.",
    });
    return [];
  }

  const loads = urls.map(
    (url) =>
      new Promise<DeckEntry | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          loaded++;
          onProgress?.(loaded, total);
          const aspect = img.naturalWidth / img.naturalHeight;
          resolve({
            url,
            texture: imageToTexture(img),
            aspect: Math.max(aspect || 1, 0.05),
            widthPx: img.naturalWidth,
            heightPx: img.naturalHeight
          });
        };
        img.onerror = () => {
          console.warn("[imageDeck] Failed to load", url);
          loaded++;
          onProgress?.(loaded, total);
          resolve(null);
        };
        img.crossOrigin = "anonymous"; // harmless for local/module URLs
        img.src = url;
      })
  );

  return (await Promise.all(loads)).filter(Boolean) as DeckEntry[];
}
