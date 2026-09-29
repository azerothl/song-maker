import { chromium } from "playwright";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(
  rootDir,
  "../docs/design/first-launch/captures-react",
);

const targets: { hash: string; file: string; selector?: string }[] = [
  { hash: "", file: "etat-a-gpu-nvidia.png" },
  {
    hash: "",
    file: "etat-a-licence-non-acceptee.png",
    selector: ".first-launch .fl-foot",
  },
  { hash: "metal", file: "etat-a-variante-apple-metal.png" },
  { hash: "b", file: "etat-b-sans-gpu.png" },
  { hash: "c", file: "etat-c-telechargement-interrompu.png" },
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

for (const { hash, file, selector } of targets) {
  const url = hash ? `${baseUrl}/#${hash}` : `${baseUrl}/`;
  await page.goto(url, { waitUntil: "networkidle" });
  if (file === "etat-a-gpu-nvidia.png") {
    await page.locator('input[name="model-pack"][value="q8"]').check();
  }
  const target = selector ?? ".first-launch .fl-card";
  await page.locator(target).first().waitFor({ state: "visible" });
  await page.locator(target).first().screenshot({
    path: path.join(outDir, file),
  });
}

await browser.close();
await server.close();
console.log(`Saved ${targets.length} screenshots to ${outDir}`);
