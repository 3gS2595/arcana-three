import { THREE } from "@/core/three";

export interface DeckEntry {
  url: string;
  texture: THREE.Texture;
  aspect: number;
  widthPx: number;
  heightPx: number;
}

async function discoverImages(base = "/assets/images/"): Promise<string[]> {
  if (!base.endsWith("/")) base += "/";
  const urls = new Set<string>();

  try {
    const res = await fetch(base + "index.json", { cache: "no-cache" });
    if (res.ok) {
      const list = (await res.json()) as string[];
      for (const n of list) if (/\.(png|jpe?g|webp|gif)$/i.test(n)) urls.add(base + n);
    }
  } catch {}

  try {
    const res = await fetch(base, { cache: "no-cache" });
    if (res.ok) {
      const html = await res.text();
      const re = /href="(?:\.\/)?([^"]+\.(?:png|jpe?g|webp|gif))"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) urls.add(base + m[1]);
    }
  } catch {}

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
  const urls = await discoverImages(base);
  const total = urls.length;
  let loaded = 0;
  onProgress?.(loaded, total);

  if (!total) {
    console.warn("[imageDeck] No front images found in", base);
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
        img.crossOrigin = "anonymous";
        img.src = url;
      })
  );

  return (await Promise.all(loads)).filter(Boolean) as DeckEntry[];
}
