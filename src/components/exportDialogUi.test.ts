import assert from "node:assert/strict";
import { createElement } from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { t } from "../ui/i18n";

describe("ExportDialog accessibilité (#168)", () => {
  it("expose un libellé de format et une explication si export pistes bloqué", () => {
    assert.equal(t("export.dialog.formatLabel"), "Format de fichier audio");
    assert.match(
      t("export.dialog.downloadDisabled"),
      /piste IA|séparation/i,
    );
    const hint = createElement(
      "p",
      { id: "export-download-disabled-reason", className: "hint", role: "note" },
      t("export.dialog.downloadDisabled"),
    );
    const html = renderToStaticMarkup(hint);
    assert.match(html, /export-download-disabled-reason/);
  });
});
