import assert from "node:assert/strict";
import fr from "../ui/fr.json";
import enProduction from "../ui/en.production.json";
import { productionClipViewControlNames } from "../components/ProductionClipViewControls";
import { productionMixSettingsFieldAccessibleNames } from "../components/ProductionMixSettingsPopin";
import { DEFAULT_PRODUCTION_CLIP_VIEW_PREFS } from "./productionClipViewPrefs";
import type { ProductionClipViewPrefs } from "./productionClipViewPrefs";

type FrKey = keyof typeof fr;

/** Clés lues par le popover « Réglages du mix » + barre Clips (#225, réutilisable #243). */
export function productionMixSettingsUiEnKeys(
  _clipPrefs: ProductionClipViewPrefs = DEFAULT_PRODUCTION_CLIP_VIEW_PREFS,
): FrKey[] {
  return [
    "production.mixSettings",
    "production.mixSettings.title",
    "production.mixSettings.close",
    "production.mixSettings.grid",
    "production.mixSettings.densityLegend",
    "production.mixSettings.sound",
    "production.mixSettings.tracks",
    "production.mixSettings.toolsMenu",
    "production.settings.master",
    "production.settings.snap",
    "production.separate.disabledBusy",
    "production.separate.disabledNoGeneration",
    "mix.density.group",
    "mix.density.auto",
    "mix.density.autoStatus",
    "mix.density.compact",
    "mix.density.confortable",
    "mix.assist.drawer",
    "mix.assist.title",
    "copilot.title",
    "separate.button",
    "separate.again",
    "mix.master",
    "clips.gridMode",
    "clips.gridMusical",
    "clips.gridTime",
    "clips.subdivision",
    "clips.sub.quarter",
    "clips.sub.eighth",
    "clips.sub.sixteenth",
    "clips.sub.thirtysecond",
    "clips.zoom",
  ];
}

/**
 * Exige que chaque clé existe dans `en.production.json` et que `t()` en locale `en`
 * renvoie l'anglais (pas le repli FR).
 */
export function assertProductionMixSettingsEnStrings(
  tEn: (key: FrKey, vars?: Record<string, string | number>) => string,
  frStrings: Record<string, string>,
  keys: readonly FrKey[] = productionMixSettingsUiEnKeys(),
): void {
  for (const key of keys) {
    assert.ok(key in enProduction, `missing EN production entry for ${key}`);
    const expected = enProduction[key as keyof typeof enProduction];
    const got = tEn(key);
    assert.equal(got, expected, `t(${key}) under en locale`);
    const frVal = frStrings[key];
    if (frVal && got === frVal && got !== expected) {
      assert.fail(`${key} falls back to French under en locale`);
    }
  }

  assert.equal(
    tEn("mix.density.autoStatus", { mode: tEn("mix.density.compact") }),
    enProduction["mix.density.autoStatus"].replace(
      "{mode}",
      tEn("mix.density.compact"),
    ),
  );
}

/** Noms accessibles attendus du popover en locale EN (musical grid). */
export function expectedMixSettingsPopoverEnAccessibleNames(): string[] {
  const prefs = { ...DEFAULT_PRODUCTION_CLIP_VIEW_PREFS, gridMode: "musical" as const };
  return productionMixSettingsFieldAccessibleNames(prefs, {
    densityPreference: "compact",
    showMixAssist: true,
    showProductionCopilot: true,
    hasAiStems: true,
    separateDisabled: false,
  });
}

/** Noms accessibles barre Clips (ProductionClipViewControls full) en EN. */
export function expectedClipsBarEnAccessibleNames(): string[] {
  return productionClipViewControlNames(
    { ...DEFAULT_PRODUCTION_CLIP_VIEW_PREFS, gridMode: "musical" },
    "full",
  );
}
