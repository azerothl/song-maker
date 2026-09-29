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

describe("Dialogues séparation / export a11y (#187)", () => {
  it("garde un pied de dialogue fixe (corps défilant)", () => {
    const css = readSrc("src/App.css");
    assert.match(css, /\.anchored-popin-footer/);
    assert.match(css, /\.anchored-popin-scroll/);
    assert.match(
      css,
      /\.separation-recommend-popin,\s*\n\.export-dialog-popin \{[\s\S]*?overflow:\s*hidden/,
    );
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.match(sep, /anchored-popin-footer/);
    assert.match(sep, /anchored-popin-scroll/);
    assert.match(exp, /anchored-popin-footer/);
    assert.match(exp, /anchored-popin-scroll/);
    assert.match(sep, /data-testid="sep-recommend-footer"/);
    assert.match(exp, /data-testid="export-dialog-footer"/);
  });

  it("rend « Télécharger le modèle » focalisable via aria-disabled + raison", () => {
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    assert.match(sep, /aria-disabled=\{downloadBlocked/);
    assert.match(sep, /aria-describedby=\{/);
    assert.match(sep, /sep-download-reason-/);
    assert.match(sep, /t\("separate\.license\.blocked"\)/);
    assert.doesNotMatch(
      sep,
      /disabled=\{\s*busy\s*\|\|\s*installing === opt\.id\s*\|\|\s*!canDownloadSeparator/,
    );
    assert.ok(EXCLUDED_SEPARATOR_NOTES_FR.length >= 2);
    assert.match(sep, /EXCLUDED_SEPARATOR_NOTES_FR/);
    assert.match(sep, /data-testid="sep-rec-exclusions"/);
  });

  it("n’expose qu’un seul écran d’export audio (plus de popin pistes ni note Alphonse)", async () => {
    const fs = await import("node:fs/promises");
    await assert.rejects(
      () =>
        fs.access(
          path.join(root, "src/components/ExportTracksPopin.tsx"),
        ),
      /ENOENT/,
    );
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.doesNotMatch(exp, /Maquette Alphonse|mockupMissing|mockup-note/);
    assert.doesNotMatch(exp, /window\.alert/);
    assert.match(exp, /export\.dialog\.result/);
    const wizard = readSrc("src/components/ExportWizard.tsx");
    assert.match(wizard, /Portable project package only/);
    assert.doesNotMatch(wizard, /exportAlignedStems|mode === "stems"|ExportFormat/);
    assert.doesNotMatch(
      t("export.dialog.intro"),
      /Maquette Alphonse/i,
    );
  });

  it("annonce le format, la raison d’export bloqué, et le retour à la reco", () => {
    const exp = readSrc("src/components/ExportDialog.tsx");
    assert.match(exp, /aria-live="polite"/);
    assert.match(exp, /export-format-live/);
    assert.match(exp, /export-disabled-reason/);
    assert.match(exp, /htmlFor=\{formatId\}/);
    assert.match(exp, /export\.dialog\.formatLabel/);
    assert.match(exp, /export-dialog-actions-end/);
    const sep = readSrc("src/components/SeparationRecommendDialog.tsx");
    assert.match(sep, /separate\.recommend\.revert/);
    assert.match(sep, /sep-revert-recommend/);
    assert.equal(
      t("separate.recommend.revert"),
      "Revenir à la recommandation",
    );
    const css = readSrc("src/App.css");
    assert.match(
      css,
      /\.separation-recommend-popin \.btn,[\s\S]*?min-height:\s*44px/,
    );
  });
});
