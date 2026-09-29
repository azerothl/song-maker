#!/usr/bin/env node
/**
 * Repro issue #126 — layout portée (ligne unique, z5, avertissements bruts).
 *
 * Usage:
 *   node --import tsx scripts/repro-partition-126.mjs
 *   node --import tsx scripts/repro-partition-126.mjs --after
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStaffAbc, sliceAbcMeasures } from "../src/lib/staffAbc.ts";
import { buildMinimalMidi, importMidiToScoreDocument } from "@song-maker/score-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const afterMode = process.argv.includes("--after");

function longDocument(bars) {
  const ppq = 960;
  const barTicks = ppq * 4;
  const notes = [];
  for (let i = 0; i < bars; i++) {
    notes.push({
      startTick: i * barTicks,
      durationTick: 240,
      pitch: 60 + (i % 12),
    });
  }
  const midi = buildMinimalMidi({ ppq, tempoBpm: 120, notes });
  return importMidiToScoreDocument(midi, { id: `repro-${bars}` }).document;
}

const built = buildStaffAbc(longDocument(90), "Repro #126");
if (!built.ok) {
  console.error("buildStaffAbc failed:", built.error);
  process.exit(1);
}

let abc = sliceAbcMeasures(built.abc, 0, 20);
const fitAbcSlice = sliceAbcMeasures(built.abc, 0, 8);
if (!afterMode) {
  abc = abc.replace(/\bz4z\b/g, "z5");
}

const z5Tune = "X:1\nM:4/4\nL:1/16\nK:C\nz5|";
const abcjsPath = path.join(root, "node_modules/abcjs/dist/abcjs-basic-min.js");

const harness = `
import { chromium } from 'playwright';

const abc = ${JSON.stringify(abc)};
const fitAbc = ${JSON.stringify(afterMode ? fitAbcSlice : "")};
const z5 = ${JSON.stringify(z5Tune)};
const afterMode = ${JSON.stringify(afterMode)};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<div id="paper" style="width:560px"></div>');
await page.addScriptTag({ path: ${JSON.stringify(abcjsPath)} });

async function render(source, opts) {
  return page.evaluate(({ source, opts }) => {
    const paper = document.getElementById('paper');
    paper.innerHTML = '';
    const tunes = window.ABCJS.renderAbc(paper, source, opts);
    const svg = paper.querySelector('svg');
    const w = parseFloat(svg?.getAttribute('width') || '0');
    const h = parseFloat(svg?.getAttribute('height') || '0');
    return {
      w,
      h,
      layoutRatio: h > 0 ? w / h : null,
      warnings: tunes[0]?.warnings ?? [],
    };
  }, { source, opts });
}

async function renderInScroll(source, opts) {
  return page.evaluate(({ source, opts }) => {
    document.body.innerHTML =
      '<div id="scroll" style="width:560px;max-height:420px;height:fit-content;overflow:auto;padding:6px;background:#0b0e13;box-sizing:border-box"><div id="paper" style="width:fit-content;max-width:100%"></div></div>';
    const scroll = document.getElementById('scroll');
    const paper = document.getElementById('paper');
    window.ABCJS.renderAbc(paper, source, opts);
    const svg = paper.querySelector('svg');
    const svgH = svg?.getBoundingClientRect().height ?? 0;
    const paperH = paper.getBoundingClientRect().height;
    const scrollH = scroll.clientHeight;
    return {
      svgH,
      paperH,
      scrollH,
      slackBelowPaper: scrollH - paperH,
      scrollOverflow: scroll.scrollHeight - scroll.clientHeight,
    };
  }, { source, opts });
}

const beforeOpts = { add_classes: true, viewportHorizontal: true, scale: 1 };
const afterOpts = {
  add_classes: true,
  staffwidth: 520,
  wrap: { preferredMeasuresPerLine: 4, minSpacing: 1.1, maxSpacing: 2.7 },
  scale: 1,
};

const opts = afterMode ? afterOpts : beforeOpts;
const main = await render(abc, opts);
const z5case = await render(z5, opts);
const scrollFit = afterMode && fitAbc ? await renderInScroll(fitAbc, afterOpts) : null;
await browser.close();
console.log(JSON.stringify({ afterMode, main, z5case, scrollFit }, null, 2));
`;

const tmp = path.join(root, "bench", "repro-126-run.mjs");
writeFileSync(tmp, harness);
const run = spawnSync("node", ["--import", "tsx", tmp], {
  encoding: "utf8",
  cwd: root,
});
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  process.exit(run.status ?? 1);
}

const result = JSON.parse(run.stdout.trim());
const outPath = path.join(
  root,
  "bench",
  afterMode ? "partition-126-after.json" : "partition-126-before.json",
);
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(
  `layoutRatio=${result.main.layoutRatio?.toFixed(3)} warnings=${result.main.warnings.length} z5warnings=${result.z5case.warnings.length}`,
);
if (afterMode && result.scrollFit) {
  const slack = result.scrollFit.slackBelowPaper;
  console.log(`scrollSlackBelowPaper=${slack?.toFixed(1)}px`);
  if (slack > 24) {
    console.error("Assertion échouée: vide noir sous la portée (slack > 24px)");
    process.exit(1);
  }
}
