import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": path.join(here, "tauri-mock.ts"),
      "@tauri-apps/api/app": path.join(here, "tauri-app-mock.ts"),
      "@tauri-apps/plugin-updater": path.join(here, "tauri-updater-mock.ts"),
      "@tauri-apps/plugin-process": path.join(here, "tauri-process-mock.ts"),
      "@song-maker/score-engine": path.resolve(
        repoRoot,
        "packages/score-engine/src/index.ts",
      ),
      "@song-maker/stem-providers": path.resolve(
        repoRoot,
        "packages/stem-providers/src/index.ts",
      ),
      "@song-maker/mix-production": path.resolve(
        repoRoot,
        "packages/mix-production/src/index.ts",
      ),
      "@song-maker/lora-packs": path.resolve(
        repoRoot,
        "packages/lora-packs/src/index.ts",
      ),
      "@song-maker/lora-training": path.resolve(
        repoRoot,
        "packages/lora-training/src/index.ts",
      ),
      "@song-maker/partition-invariants": path.resolve(
        repoRoot,
        "packages/partition-invariants/src/index.ts",
      ),
      "@song-maker/remote-worker": path.resolve(
        repoRoot,
        "packages/remote-worker/src/index.ts",
      ),
      "@song-maker/project-sync": path.resolve(
        repoRoot,
        "packages/project-sync/src/index.ts",
      ),
      "@song-maker/sheetsage": path.resolve(
        repoRoot,
        "packages/sheetsage/src/index.ts",
      ),
      "@song-maker/akasha-declui": path.resolve(
        repoRoot,
        "packages/akasha-declui/src/index.ts",
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: false,
    host: "127.0.0.1",
  },
});
