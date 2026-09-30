import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { EXCLUDED_SEPARATOR_NOTES_FR } from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Dialogues séparation / export a11y (#187 / #191)", () => {
  it("garde un pied de dialogue fixe (corps défilant)", () => {
    const css = readSrc("src/App.css");
    assert.match(css, /\.anchored-popin-footer/);
    assert.match(css, /\.anchored-popin-scroll/);
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.match(sep, /anchored-popin-footer/);
    assert.match(exp, /anchored-popin-footer/);
  });

  it("repositionne AnchoredPopin au resize contenu (B1)", () => {
    const src = readSrc("src/components/AnchoredPopin.tsx");
    assert.match(src, /ResizeObserver/);
    assert.match(src, /positionPanel/);
    assert.match(src, /resize/);
  });

  it("bloque Lancer la séparation si modèle non installé (I7)", () => {
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    assert.match(sep, /selectedRunnable/);
    assert.match(sep, /aria-disabled=\{runBlockedReason/);
    assert.match(sep, /sep-run-blocked-reason/);
  });

  it("résume les exclusions en tête + details (I3)", () => {
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    assert.match(sep, /sep-exclusions-summary/);
    assert.match(sep, /sep-exclusions-details/);
    assert.doesNotMatch(sep, /<h4>\{t\("separate\.license\.exclusions"\)\}<\/h4>/);
    assert.ok(EXCLUDED_SEPARATOR_NOTES_FR.length >= 2);
  });

  it("n’expose qu’un seul écran d’export audio", async () => {
    const fs = await import("node:fs/promises");
    await assert.rejects(
      () => fs.access(path.join(root, "src/components/ExportTracksPopin.tsx")),
      /ENOENT/,
    );
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.doesNotMatch(exp, /window\.alert/);
    assert.doesNotMatch(
      t("export.dialog.intro"),
      /Maquette Alphonse/i,
    );
  });

  it("neutralise la bordure native des fieldsets export (#191)", () => {
    const css = readSrc("src/App.css");
    assert.match(
      css,
      /\.export-dialog-popin fieldset\s*\{[\s\S]*?border:\s*none/,
    );
  });

  it("comportement pied export : voir anchoredPopinFooter.behavior.test.ts", () => {
    assert.match(
      readSrc("src/dev/anchoredPopinFooter.behavior.test.ts"),
      /export-drawer-top-12-after/,
    );
  });

  it("raison visible + aria-describedby sur Exporter (0 piste) et RegenerationGate", () => {
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.match(exp, /export\.tracks\.disabledNoneSelected/);
    assert.match(exp, /aria-describedby=\{/);
    assert.match(exp, /aria-disabled=\{exportBlockedNotBusy/);
    const regen = readSrc("src/components/RegenerationGate.tsx");
    assert.match(regen, /regen-gate-proceed-blocked-reason/);
    assert.match(regen, /phase4\.regenGate\.proceedBlocked/);
    assert.match(regen, /aria-describedby=\{/);
  });
});
