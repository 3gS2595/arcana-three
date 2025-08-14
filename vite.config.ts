import { defineConfig } from "vite";

export default defineConfig({
  server: { open: true },
  resolve: {
    alias: { "@": "/src" }
  },
  assetsInclude: ["**/*.glb", "**/*.gltf", "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.webp"]
});
