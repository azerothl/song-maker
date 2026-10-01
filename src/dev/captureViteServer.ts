import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Dev server Vite pour harness capture (mock Tauri, `VITE_CAPTURE=1`). */
export async function startCaptureViteServer(
  port: number,
): Promise<ViteDevServer> {
  // `vite.config.ts` lit VITE_CAPTURE à l’import — doit être posé avant createServer.
  process.env.VITE_CAPTURE = "1";
  const server = await createServer({
    configFile: path.join(ROOT, "vite.config.ts"),
    // Concurrent test servers must not invalidate each other's optimized deps.
    cacheDir: path.join(ROOT, "node_modules/.vite", `capture-${port}`),
    server: { host: "127.0.0.1", port, strictPort: true },
    env: { ...process.env, VITE_CAPTURE: "1" },
    logLevel: "error",
  });
  await server.listen();
  return server;
}

export async function stopCaptureViteServer(
  server: ViteDevServer,
  timeoutMs = 15_000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      server.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`vite.close() > ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function captureBaseUrl(port: number, html = "separation-export-a11y-capture.html"): string {
  return `http://127.0.0.1:${port}/${html}`;
}
