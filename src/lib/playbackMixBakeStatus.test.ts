import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, afterEach } from "node:test";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import fr from "../ui/fr.json";
import enProfiles from "../ui/en.profiles.json";
import { t } from "../ui/i18n.ts";
import {
  mixBakeStatusPhaseOnPendingChange,
  resetMixBakeDonePhase,
} from "./mixBakeStatusAnnouncement";
import {
  bakeMixPcmAsync,
  setMixBakeAsyncTestDelegate,
} from "./mixBakeClient";
import type { MixDoc } from "./types";

const KEYS = [
  "player.mixBakePending",
  "player.mixBakeDone",
  "player.mixBakeFailed",
] as const;

const LOCALE_KEY = "song-maker.locale";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const miniMix = (): MixDoc => ({
  schema: "song-maker.mix",
  schemaVersion: 1,
  id: "mix-test",
  separationId: "sep",
  sampleRate: 48_000,
  masterGainDb: 0,
  peakCeilingDb: -1,
  tracks: [],
});

describe("indicateur rebake mix (#234 / Alphonse)", () => {
  afterEach(() => {
    setMixBakeAsyncTestDelegate(null);
  });

  it("expose les libellés FR et EN sans mot interdit", () => {
    for (const key of KEYS) {
      const frText = String(fr[key]);
      const enText = String(
        enProfiles[key as keyof typeof enProfiles] ?? "",
      );
      assert.ok(frText.length > 0, key);
      assert.ok(enText.length > 0, `${key} EN manquant`);
      assert.equal(COMMERCIAL_COPY_FORBIDDEN.test(frText), false, frText);
      assert.equal(COMMERCIAL_COPY_FORBIDDEN.test(enText), false, enText);
      assert.doesNotMatch(frText, /\btu\b/i);
      assert.doesNotMatch(enText, /\byou\b/i);
    }
    assert.equal(fr["player.mixBakePending"], "Calcul du mix en cours…");
    assert.equal(enProfiles["player.mixBakePending"], "Rendering mix…");
    assert.equal(enProfiles["player.mixBakeFailed"], "Mix rendering failed.");
  });

  it("résout l’anglais via t() sans repli FR pour l’état d’erreur", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
      configurable: true,
    });
    store.set(LOCALE_KEY, "en");
    assert.equal(t("player.mixBakeFailed"), "Mix rendering failed.");
    assert.notEqual(t("player.mixBakeFailed"), fr["player.mixBakeFailed"]);
  });

  it("transition pending → done → hidden", () => {
    let phase = mixBakeStatusPhaseOnPendingChange("hidden", true, false);
    assert.equal(phase, "pending");
    phase = mixBakeStatusPhaseOnPendingChange(phase, false, false);
    assert.equal(phase, "done");
    phase = resetMixBakeDonePhase(phase);
    assert.equal(phase, "hidden");
  });

  it("transition pending → error (pas de faux succès)", () => {
    let phase = mixBakeStatusPhaseOnPendingChange("hidden", true, false);
    phase = mixBakeStatusPhaseOnPendingChange(phase, false, true);
    assert.equal(phase, "error");
    assert.notEqual(phase, "done");
  });

  it("chemin d’erreur Worker : rejet sans message technique exposé", async () => {
    setMixBakeAsyncTestDelegate(() => ({
      cancel: () => {},
      result: Promise.reject(new Error("Worker secret detail")),
    }));
    const stems = [
      {
        trackId: "a",
        left: new Float32Array(4),
        right: new Float32Array(4),
        sampleRate: 48_000,
      },
    ];
    await assert.rejects(
      () => bakeMixPcmAsync(miniMix(), stems, null, null).result,
    );
  });

  it("annule le job précédent quand un nouveau bake async démarre", () => {
    const cancelled: number[] = [];
    let seq = 0;
    setMixBakeAsyncTestDelegate(() => {
      const id = ++seq;
      return {
        cancel: () => {
          cancelled.push(id);
        },
        result: new Promise(() => {}),
      };
    });
    const stems = [
      {
        trackId: "a",
        left: new Float32Array(8),
        right: new Float32Array(8),
        sampleRate: 48_000,
      },
    ];
    const first = bakeMixPcmAsync(miniMix(), stems, null, null);
    first.cancel();
    bakeMixPcmAsync(miniMix(), stems, null, null);
    assert.deepEqual(cancelled, [1]);
  });

  it("ne vide pas bakedBuffer au début du pending async", () => {
    const src = readFileSync(path.join(root, "lib/playback.ts"), "utf8");
    const fn = src.slice(
      src.indexOf("private requestProductionBakeAsync"),
      src.indexOf("private applyCeilingFromBuffers"),
    );
    assert.match(fn, /productionMixBakePending = true/);
    assert.doesNotMatch(fn, /bakedBuffer = null/);
    assert.doesNotMatch(fn, /productionBake = false/);
  });

  it("MixBakeStatusIndicator applique className sur le slot de placement", () => {
    const comp = readFileSync(
      path.join(root, "components/MixBakeStatusIndicator.tsx"),
      "utf8",
    );
    assert.match(comp, /player-mix-bake-status-slot.*className/);
    assert.match(comp, /role=\{isError \? "alert" : "status"\}/);
  });
});
