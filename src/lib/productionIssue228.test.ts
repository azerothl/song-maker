import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, describe, it } from "node:test";
import { t } from "../ui/i18n.ts";
import { formatMs, formatMsForClipLabel } from "./productionTimeFormat.ts";
import {
  applyClipGainEdit,
  clampClipGainDb,
} from "./mixClipGainEdit.ts";
import type { MixClip, MixDoc } from "./types.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

const KEYS_228 = [
  "production.clip.gain",
  "production.clip.gainNamed",
  "production.clip.named",
  "production.clip.titleNamed",
  "production.select.none",
  "production.select.clip",
  "production.select.left",
  "production.select.right",
  "production.select.needClip",
  "production.cut.atPlayhead",
  "production.cut.preview",
  "production.cut.needClip",
  "production.cut.done",
  "production.cut.midpoint",
  "production.fade.in",
  "production.fade.out",
  "production.fade.less",
  "production.fade.more",
  "production.fade.lessNamed",
  "production.fade.moreNamed",
  "production.fade.needClip",
  "production.playhead.back",
  "production.playhead.forward",
  "production.status.moved",
  "production.status.duplicated",
  "production.status.fade",
  "production.status.clipGain",
  "production.actions.bar",
] as const;

before(() => {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
});

afterEach(() => {
  store.delete(LOCALE_KEY);
});

function sampleMix(): MixDoc {
  const c: MixClip = {
    id: "c1",
    trackId: "trk",
    sourcePath: "a.wav",
    sourceSha256: "abc",
    startMs: 0,
    offsetMs: 0,
    durationMs: 2000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
  };
  return {
    schema: "mix",
    schemaVersion: 1,
    id: "m",
    separationId: "",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: 0,
    tracks: [
      {
        id: "trk",
        name: "Voix",
        role: "vocals",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: false,
        clips: [c],
      },
    ],
  };
}

describe("Production #228 — gain, formatMs, i18n", () => {
  it("formatMs : 12340 ms → FR « 0:12,3 » et EN « 0:12.3 »", () => {
    assert.equal(formatMs(12340), "0:12,3");
    assert.equal(formatMsForClipLabel(12340), "0:12,3");
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(formatMs(12340), "0:12.3");
    assert.equal(formatMsForClipLabel(12340), "0:12.3");
  });

  it("mutation : toFixed sans locale casserait le FR", () => {
    const broken = (ms: number) => {
      const s = Math.max(0, ms) / 1000;
      const m = Math.floor(s / 60);
      const rest = (s % 60).toFixed(1);
      return `${m}:${rest.padStart(4, "0")}`;
    };
    assert.equal(broken(12340), "0:12.3");
    assert.notEqual(broken(12340), formatMs(12340));
  });

  it("clés #228 FR/EN présentes, Split en EN pour cut", () => {
    for (const key of KEYS_228) {
      const fr = t(key, {
        track: "Voix",
        n: 1,
        time: "0:12,3",
        duration: "0:02,0",
        musical: "1.1",
        end: "0:14,3",
        take: "A",
        name: "Clip",
        bar: 11,
        fade: "Fondu d'entrée",
        kind: "Fondu d'entrée",
        value: "300 ms",
      });
      assert.ok(fr.length > 0 && fr !== key, key);
      localStorage.setItem(LOCALE_KEY, "en");
      const en = t(key, {
        track: "Vocals",
        n: 1,
        time: "0:12.3",
        duration: "0:02.0",
        musical: "1.1",
        end: "0:14.3",
        take: "A",
        name: "Clip",
        bar: 11,
        fade: "Fade in",
        kind: "Fade in",
        value: "300 ms",
      });
      assert.ok(en.length > 0 && en !== key, `${key} en`);
      localStorage.removeItem(LOCALE_KEY);
    }
    localStorage.setItem(LOCALE_KEY, "en");
    assert.match(t("production.cut.atPlayhead"), /Split/i);
    assert.doesNotMatch(t("production.cut.atPlayhead"), /\bCut\b/);
  });

  it("applyClipGainEdit applique −3,5 dB borné", () => {
    const next = applyClipGainEdit(sampleMix(), "trk", "c1", -3.5);
    assert.equal(next.tracks[0]!.clips[0]!.gainDb, -3.5);
    assert.equal(clampClipGainDb(40), 12);
    assert.equal(clampClipGainDb(-40), -24);
  });

  it("ClipTimeline / popin : gain + formatMs partagés, pas de concat aria hard-codée", () => {
    const timeline = readFileSync("src/components/ClipTimeline.tsx", "utf8");
    assert.match(timeline, /from ["'].*productionTimeFormat["']/);
    assert.match(timeline, /production\.clip\.named/);
    assert.match(timeline, /clip-action-bar/);
    assert.doesNotMatch(
      timeline,
      /aria-label=\{`\$\{tr\.name\}, \$\{formatMs/,
    );
    const popin = readFileSync(
      "src/components/production/ProductionTrackSettingsPopin.tsx",
      "utf8",
    );
    assert.match(popin, /production\.clip\.gain/);
    assert.match(popin, /applyClipGainEdit/);
  });
});
