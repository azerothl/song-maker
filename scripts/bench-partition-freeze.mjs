#!/usr/bin/env node
/**
 * Bench for issue #113 — Partition tab main-thread cost.
 *
 * Reproduces abcjs staff composition + forced SVG layout (the work React
 * <Profiler> cannot see) and PianoRoll DOM mount for a long sparse score.
 *
 * Usage:
 *   node scripts/bench-partition-freeze.mjs
 *
 * Requires system Chrome (`google-chrome` / `chromium` / `CHROME_PATH`).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const abcjsPath = path.join(root, "node_modules/abcjs/dist/abcjs-basic-min.js");

/** ~3 min @ 120 bpm 4/4 ≈ 90 bars, two voices — matches exportScoreAbc shape. */
function buildReferenceTune(bars = 90) {
  const header = `X:1
T:Bench Partition
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% other`;
  const vocalBars = [];
  const insBars = [];
  for (let i = 0; i < bars; i++) {
    const pitch = ["A1", "B1", "c1", "d1", "e1", "f1", "g1", "a1"][i % 8];
    vocalBars.push(`${pitch}B1c1d1`);
    insBars.push(i % 4 === 0 ? "Z4" : null);
  }
  const chunks = [];
  for (let i = 0; i < bars; i += 4) {
    chunks.push("V: Vocal");
    chunks.push(vocalBars.slice(i, i + 4).map((b) => `${b}|`).join(""));
    chunks.push("V: Ins");
    const group = insBars.slice(i, i + 4);
    if (group[0] === "Z4") chunks.push("Z4|");
    else chunks.push(group.map(() => "Z|").join(""));
  }
  return [header, ...chunks].join("\n");
}

function sliceAbc(abc, start, count) {
  const lines = abc.split(/\r?\n/).filter((l) => l.trim());
  const headerLines = [];
  const byVoice = new Map();
  const blocks = [];
  const declared = new Set();
  let current = null;
  let sawBar = false;
  for (const line of lines) {
    const voice = line.match(/^\s*V:\s*(\S+)/);
    if (voice) {
      const id = voice[1];
      if (!sawBar && !declared.has(id)) {
        declared.add(id);
        headerLines.push(line);
        continue;
      }
      declared.add(id);
      let block = byVoice.get(id);
      if (!block) {
        block = { voice: id, bars: [] };
        byVoice.set(id, block);
        blocks.push(block);
      }
      current = block;
      continue;
    }
    if (!line.includes("|")) {
      if (!sawBar) headerLines.push(line);
      continue;
    }
    sawBar = true;
    if (!current) {
      current = { voice: "1", bars: [] };
      byVoice.set("1", current);
      blocks.push(current);
    }
    for (const part of line.split("|")) {
      const bar = part.trim();
      if (!bar) continue;
      const rest = bar.match(/^([Zz])(\d+)$/);
      if (rest) {
        for (let i = 0; i < Math.max(1, Number(rest[2])); i++) current.bars.push("Z");
      } else {
        current.bars.push(bar);
      }
    }
  }
  const body = [];
  for (const block of blocks) {
    const bars = block.bars.slice(start, start + count);
    if (!bars.length) continue;
    body.push(`V: ${block.voice}`);
    body.push(bars.map((b) => `${b}|`).join(""));
  }
  return [...headerLines, ...body].join("\n");
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>partition-freeze-bench</title></head>
<body>
<div id="paper"></div>
<div id="piano"></div>
<script src="/abcjs.js"></script>
<script>
function forceLayout(el) {
  const t0 = performance.now();
  const nodes = el.getElementsByTagName("*").length;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  return { ms: performance.now() - t0, nodes, w, h };
}

function renderStaff(abc, opts) {
  const paper = document.getElementById("paper");
  paper.innerHTML = "";
  const t0 = performance.now();
  ABCJS.renderAbc(paper, abc, {
    add_classes: true,
    scale: 1,
    paddingtop: 8,
    paddingbottom: 8,
    paddingleft: 8,
    paddingright: 8,
    viewportHorizontal: true,
    ...opts,
  });
  const renderMs = performance.now() - t0;
  const layout = forceLayout(paper);
  return { renderMs, layoutMs: layout.ms, nodes: layout.nodes, w: layout.w, h: layout.h, chars: abc.length };
}

function mountPiano(noteCount, maxTick) {
  const root = document.getElementById("piano");
  root.innerHTML = "";
  const t0 = performance.now();
  const grid = document.createElement("div");
  grid.style.width = Math.max(640, maxTick * 0.04) + "px";
  grid.style.height = (84 - 48 + 1) * 14 + "px";
  grid.style.position = "relative";
  for (let pitch = 84; pitch >= 48; pitch--) {
    const row = document.createElement("div");
    row.style.position = "absolute";
    row.style.top = (84 - pitch) * 14 + "px";
    row.style.height = "14px";
    row.style.width = "100%";
    grid.appendChild(row);
  }
  for (let i = 0; i < noteCount; i++) {
    const n = document.createElement("button");
    n.style.position = "absolute";
    n.style.left = (i * 480) * 0.04 + "px";
    n.style.top = "100px";
    n.style.width = "12px";
    n.style.height = "12px";
    grid.appendChild(n);
  }
  root.appendChild(grid);
  const mountMs = performance.now() - t0;
  const layout = forceLayout(root);
  return { mountMs, layoutMs: layout.ms, nodes: layout.nodes, widthPx: maxTick * 0.04 };
}

window.__runBench = function (payload) {
  const full = payload.fullAbc;
  const windowed = payload.windowedAbc;
  const results = {
    full_with_resize: renderStaff(full, { responsive: "resize" }),
    full_no_responsive: renderStaff(full, {}),
    window24_with_resize: renderStaff(windowed, { responsive: "resize" }),
    window24_no_responsive: renderStaff(windowed, {}),
    piano_hidden_cost: mountPiano(payload.noteCount, payload.maxTick),
  };
  // Second pass: resize thrash simulation (container width change after render)
  const paper = document.getElementById("paper");
  paper.innerHTML = "";
  paper.style.width = "900px";
  ABCJS.renderAbc(paper, windowed, {
    add_classes: true,
    responsive: "resize",
    scale: 1,
    viewportHorizontal: true,
  });
  const t0 = performance.now();
  paper.style.width = "700px";
  paper.dispatchEvent(new Event("resize"));
  window.dispatchEvent(new Event("resize"));
  // Force layout after width change
  void paper.offsetWidth;
  results.resize_thrash_after_window = { ms: performance.now() - t0, nodes: paper.getElementsByTagName("*").length };
  return results;
};
</script>
</body></html>`;

function findChrome() {
  return (
    process.env.CHROME_PATH ||
    ["google-chrome", "chromium", "chromium-browser", "google-chrome-stable"].find(
      Boolean,
    )
  );
}

async function waitPort(port, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      await new Promise((resolve, reject) => {
        const s = createConnection({ port, host: "127.0.0.1" }, () => {
          s.end();
          resolve();
        });
        s.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Chrome CDP not ready on ${port}`);
}

async function main() {
  const fullAbc = buildReferenceTune(90);
  const windowedAbc = sliceAbc(fullAbc, 0, 24);
  // Sparse long score: 794 notes, ~5e6 ticks → ~200k px (from prior profile notes)
  const noteCount = 794;
  const maxTick = 5_000_000;

  const dir = await mkdtemp(path.join(tmpdir(), "partition-bench-"));
  const htmlPath = path.join(dir, "index.html");
  await writeFile(htmlPath, HTML);

  const server = createServer(async (req, res) => {
    if (req.url === "/abcjs.js") {
      const { readFile } = await import("node:fs/promises");
      const body = await readFile(abcjsPath);
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end(body);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HTML);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  const chrome = findChrome();
  const userData = path.join(dir, "chrome-profile");
  const debugPort = 9222 + Math.floor(Math.random() * 1000);
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userData}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  try {
    await waitPort(debugPort);
    const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) =>
      r.json(),
    );
    const page = list.find((p) => p.type === "page") || list[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("No CDP page");

    // Prefer native WebSocket (Node 22+)
    const WS = globalThis.WebSocket;
    if (!WS) throw new Error("WebSocket not available in this Node runtime");

    const result = await new Promise((resolve, reject) => {
      const ws = new WS(page.webSocketDebuggerUrl);
      let nextId = 1;
      const pending = new Map();
      const send = (method, params = {}) => {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { res, rej }));
      };
      ws.addEventListener("open", async () => {
        try {
          await send("Runtime.enable");
          // Wait for ABCJS
          for (let i = 0; i < 50; i++) {
            const ready = await send("Runtime.evaluate", {
              expression: "typeof ABCJS !== 'undefined' && typeof window.__runBench === 'function'",
              returnByValue: true,
            });
            if (ready.result?.value) break;
            await new Promise((r) => setTimeout(r, 100));
          }
          const payload = JSON.stringify({
            fullAbc,
            windowedAbc,
            noteCount,
            maxTick,
          });
          const evaluated = await send("Runtime.evaluate", {
            expression: `window.__runBench(${payload})`,
            returnByValue: true,
            awaitPromise: true,
          });
          if (evaluated.exceptionDetails) {
            reject(new Error(JSON.stringify(evaluated.exceptionDetails)));
            return;
          }
          resolve(evaluated.result.value);
        } catch (e) {
          reject(e);
        } finally {
          ws.close();
        }
      });
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id && pending.has(msg.id)) {
          const { res, rej } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
      ws.addEventListener("error", reject);
    });

    const summary = {
      scenario: {
        bars: 90,
        windowBars: 24,
        fullChars: fullAbc.length,
        windowChars: windowedAbc.length,
        pianoNotes: noteCount,
        pianoMaxTick: maxTick,
      },
      measurements: result,
      interpretation: {
        abcjs_js_vs_layout:
          "Compare renderMs (abcjs JS) vs layoutMs (forced SVG geometry). Prior #113 work found layout dominates.",
        windowing:
          "window24_* should cut nodes and layoutMs vs full_* — measure-bound, not line-bound (#107 truncate is a no-op for score export).",
        responsive:
          "full_with_resize / window24_with_resize install abcjs resize listeners; omit responsive to avoid recompose thrash and restore scale zoom.",
        piano:
          "piano_hidden_cost models ScorePanel mounting PianoRoll while staff is visible (hidden= still mounts SoftSynth + note DOM).",
      },
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    child.kill("SIGKILL");
    server.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
