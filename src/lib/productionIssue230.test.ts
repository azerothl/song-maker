import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, describe, it } from "node:test";
import { t } from "../ui/i18n.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

const PLACEMENT_KEYS = [
  "production.track.tab.routing",
  "production.routing.popover",
  "production.routing.sendsLegend",
  "production.routing.sidechainDestFixed",
  "production.routing.defaultGroup",
  "production.routing.defaultAux",
  "export.dialog.mode.package",
  "clips.stretch.open",
  "phase3.mix.runLimiterMeter",
  "phase3.routing.noGroup",
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

describe("Production #230 — emplacements planches", () => {
  it("clés FR/EN des cinq emplacements", () => {
    for (const key of PLACEMENT_KEYS) {
      const fr = t(key, { track: "Basse", n: 1 });
      assert.ok(fr.length > 0 && fr !== key, key);
      localStorage.setItem(LOCALE_KEY, "en");
      const en = t(key, { track: "Bass", n: 1 });
      assert.ok(en.length > 0 && en !== key, `${key} en`);
      localStorage.removeItem(LOCALE_KEY);
    }
  });

  it("Routage onglet piste + loudness dans Réglages du mix + Export package", () => {
    const tools = readFileSync(
      "src/components/production/ProductionTrackTools.tsx",
      "utf8",
    );
    assert.match(tools, /ProductionTrackRoutingPopin/);
    assert.match(tools, /"routing"/);
    assert.match(tools, /production\.track\.tab\.routing/);

    const routing = readFileSync(
      "src/components/production/ProductionTrackRoutingPopin.tsx",
      "utf8",
    );
    assert.match(routing, /phase3\.mix\.sidechainLegend/);
    assert.match(routing, /production\.routing\.sendsLegend/);
    assert.match(routing, /data-testid="production-track-routing"/);

    const mixSettings = readFileSync(
      "src/components/ProductionMixSettingsPopin.tsx",
      "utf8",
    );
    assert.match(mixSettings, /production-mix-settings-loudness/);
    assert.match(mixSettings, /measureLoudness/);
    assert.match(mixSettings, /phase3\.mix\.runLimiterMeter/);

    const exportDialog = readFileSync(
      "src/components/ExportDialog.tsx",
      "utf8",
    );
    assert.match(exportDialog, /export\.dialog\.mode\.package/);
    assert.match(exportDialog, /ExportWizard/);

    const workspace = readFileSync(
      "src/screens/song/ProductionWorkspace.tsx",
      "utf8",
    );
    assert.doesNotMatch(workspace, /Phase3MixPanel/);
    assert.doesNotMatch(workspace, /production-panel-tools/);
    assert.doesNotMatch(workspace, /<ExportWizard/);
    assert.match(workspace, /sources=\{playbackSources\}/);
  });

  it("prises et Tempo/hauteur sur la barre de sélection clip (p8)", () => {
    const clips = readFileSync("src/components/ClipTimeline.tsx", "utf8");
    assert.match(clips, /clip-selection-bar/);
    assert.match(clips, /clip-stretch-open/);
    assert.match(clips, /clips\.stretch\.open/);
    assert.match(clips, /clip-takes-bar/);
    assert.doesNotMatch(
      clips,
      /className="clip-stretch">\s*<p className="clip-inspector-title"/,
    );
  });

  it("libellés bus Gabriel/Pascal (commentaire #230)", () => {
    assert.equal(t("phase3.routing.addGroup"), "+ Bus de groupe");
    assert.equal(t("phase3.routing.addAux"), "+ Bus auxiliaire");
    assert.equal(t("phase3.routing.noGroup"), "Master (sans bus de groupe)");
    assert.equal(
      t("production.routing.defaultGroup", { n: 2 }),
      "Bus de groupe 2",
    );
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(t("phase3.routing.addGroup"), "+ Group bus");
    assert.equal(t("phase3.routing.noGroup"), "Master (no group bus)");
  });
});
