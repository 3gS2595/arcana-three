
# WIP <br> [The Wrong Biennale](https://thewrong.org/), [Arcana](http://a-r-c-a-n-a.moe) pavilion <br> TypeScript, Three.js, Vite

![1231111](https://github.com/user-attachments/assets/9c496462-2330-4d12-857c-5e4c648bd417)
<!-- clown court as the morning dew settles on the ground so shall the blood of our enemies -->

### Prerequisites
- **Node.js ≥ 18** (LTS recommended)
- **npm** (or **pnpm/yarn**, adjust commands accordingly)

### Install & Run
```bash
# 1) Install deps
npm install

# 2) Start dev server (opens browser)
npm run dev

# 3) Build for production
npm run build

# 4) Preview the build locally
npm run preview
```

## Features

- **Image deck → cards:** Each face image becomes a dual-sided mesh with a rotated back for landscape fronts.
- **Emitter & physics:** Cards launch upward with drag/gravity, then transition to homing.
- **Heart targets:** High-res parametric outline scaled by **per-card width + margins**; always faces the camera.
- **Trails:** Simple line strips that insert while moving and decay when idle; anchored to the card’s front face.
- **Focus interaction:** Click a card to animate it in front of the camera (contain/height fit), click again to return it to the heart slot.
- **Frame overlay (GLB):** Camera-attached border with **unlit / normals / material** display modes, margin & scaling controls.
- **Boot UI:** Progress bar merges GLTF/texture + image-deck loading; click **Start** to fade in the overlay and enter the scene.

---

## Controls

- **OrbitControls** (mouse/touch): rotate/pan/zoom the camera
- **Click card**: focus / release
- **Keyboard**: `R` → reset the fountain

---

## Project Structure (condensed)

```
3gs2595-arcana-three/
├─ index.html                   # Boot overlay + viewport
├─ styles/main.css              # Boot + layout styles
├─ src/
│  ├─ main.ts                   # App entry: boot, overlay, system, loop
│  ├─ core/                     # Three.js + OrbitControls wiring
│  ├─ environment/lighting.ts   # Ambient (flat) lighting
│  ├─ cards/                    # Card mesh + image deck loader
│  ├─ engine/
│  │  ├─ heart/                 # Heart curve, sampling, camera-facing frame
│  │  ├─ system/                # Physics, spawn, targets, trails driver, state
│  │  └─ trails.ts              # Trail line buffers & updates
│  ├─ interaction/              # Picker + focus controller & helpers
│  ├─ overlay/frameBorderOverlay.ts  # GLB overlay (modes, margins, scaling)
│  └─ runtime/                  # Boot flow + overlay setup
├─ vite.config.ts               # @ alias, asset includes, dev server
├─ tsconfig.json                # Bundler resolution, strict TS, @ paths
└─ types/global.d.ts            # window.ASSET_IMAGES
```

---

## Configuration

- **Overlay frame** (`src/runtime/overlayFrame.ts` → `FrameBorderOverlay`)
  - `marginH`, `marginV`: normalized viewport margins
  - `distance`: world units in front of camera
  - `scalingMode`: `"stretch"` (non-uniform) or `"fit"` (uniform)
  - `lighting`: `"unlit" | "normals" | "material"`
  - `mixStrength`: blend for `"normals"` mode
- **Heart** (`src/engine/heart/frame.ts`)
  - `HEART_CENTER`: default `(0,0,0)`; heart always **faces camera**, centered here
- **Spacing** (`src/engine/system/constants.ts`, `targets.ts`)
  - `CARD_MARGIN_ABS`, `SIDE_BUFFER_ABS`: per-card world spacing
- **Physics** (`constants.ts`)
  - `GRAVITY`, `DRAG`, `FLOOR_Y`, `HOMING_POS_SPEED`
- **Trails** (`engine/trails.ts`)
  - `maxPoints`, `decayPtsPerSec`
- **Focus sizing** (`interaction/focus/sizing.ts`)
  - `fitMode`: `"contain"` (default) or `"height"`
  - `distance`, `margin` (percent of view)

---

## How it works (brief)

- **Boot** loads the GLB overlay, preloads `back.png`, discovers face images (build-time glob first, HTTP fallback).
- **System** ensures the card pool matches deck size, spawns new cards, integrates physics, then **homes** them to heart targets; trails update per movement.
- **Heart mapping** uses a high-res polyline + arc-length sampling, scaled to per-card spans; local XY points are converted to world via a camera-facing frame.
- **Focus** animates world → camera-relative anchor and back, preserving pre-focus orientation.

---

## Troubleshooting

- **No cards visible**
  - Ensure `src/assets/back.png` exists and **at least one** face image is present under `src/assets/images/` (or the public alternatives).
- **Build error importing `@/assets/back.png?url`**
  - Add the missing file under `src/assets/back.png`.
- **Overlay appears but doesn’t fit the viewport**
  - Adjust `marginH/marginV`, `distance`, or switch `scalingMode` to `"fit"`.
- **Type errors in focus sizing**
  - Ensure the type import is from `@/engine/system` if you reference `SystemCard` in external code.

---

## License

Specify your license in `LICENSE` (e.g., MIT).  

---

## Credits

- [Three.js](https://threejs.org/)
- Vite + TypeScript toolchain
