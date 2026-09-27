import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@song-maker/score-engine": path.resolve(
        rootDir,
        "packages/score-engine/src/index.ts",
      ),
      "@song-maker/stem-providers": path.resolve(
        rootDir,
        "packages/stem-providers/src/index.ts",
      ),
      "@song-maker/mix-production": path.resolve(
        rootDir,
        "packages/mix-production/src/index.ts",
      ),
      "@song-maker/lora-packs": path.resolve(
        rootDir,
        "packages/lora-packs/src/index.ts",
      ),
      "@song-maker/lora-training": path.resolve(
        rootDir,
        "packages/lora-training/src/index.ts",
      ),
      "@song-maker/partition-invariants": path.resolve(
        rootDir,
        "packages/partition-invariants/src/index.ts",
      ),
      "@song-maker/remote-worker": path.resolve(
        rootDir,
        "packages/remote-worker/src/index.ts",
      ),
      "@song-maker/project-sync": path.resolve(
        rootDir,
        "packages/project-sync/src/index.ts",
      ),
      "@song-maker/sheetsage": path.resolve(
        rootDir,
        "packages/sheetsage/src/index.ts",
      ),
      "@song-maker/akasha-declui": path.resolve(
        rootDir,
        "packages/akasha-declui/src/index.ts",
      ),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
