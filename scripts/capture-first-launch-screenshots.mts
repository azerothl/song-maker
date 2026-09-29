import { chromium } from "playwright";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(rootDir, "../artifacts/screenshots");

const targets = [
  { id: "etat-a-gpu", file: "first-launch-etat-a-gpu.png" },
  { id: "etat-a-metal", file: "first-launch-etat-a-metal.png" },
  { id: "etat-b-sans-gpu", file: "first-launch-etat-b-sans-gpu.png" },
  { id: "etat-c-interrompu", file: "first-launch-etat-c-interrompu.png" },
];

const server = await createServer({
  configFile: path.resolve(rootDir, "../vite.config.ts"),
  root: path.resolve(rootDir, ".."),
  server: { port: 0, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const port = server.config.server.port;
const baseUrl = `http://127.0.0.1:${port}`;
await new Promise((r) => setTimeout(r, 500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${baseUrl}/first-launch-screenshots.html`, {
  waitUntil: "networkidle",
});

for (const { id, file } of targets) {
  const el = page.locator(`#${id} .fl-card`);
  await el.screenshot({ path: path.join(outDir, file) });
}

await browser.close();
await server.close();
console.log(`Saved ${targets.length} screenshots to ${outDir}`);
