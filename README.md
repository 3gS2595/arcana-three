
# (WIP) <br> [The Wrong Biennale](https://thewrong.org/), [Arcana](http://a-r-c-a-n-a.moe) pavilion <br> TypeScript, Three.js, Vite

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

## Controls

- **OrbitControls** (mouse/touch): rotate/pan/zoom the camera
- **Click card**: focus / release
- **Keyboard**: `R` → reset the fountain
- **Keyboard**: `C` → changes card group pattern
  
---

## Troubleshooting

- **No cards visible**
  - Ensure `src/assets/back.png` exists and **at least one** face image is present under `src/assets/images/` (or the public alternatives).
---

## License

Specify your license in `LICENSE` (e.g., MIT).  

---
