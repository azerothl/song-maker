import assert from "node:assert/strict";
import { createElement } from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { separatorLicense } from "@song-maker/stem-providers";
import { SeparatorLicenseBadge } from "./SeparatorLicenseBadge";

describe("SeparatorLicenseBadge (#167)", () => {
  it("affiche icône et texte dans le rendu", () => {
    const license = separatorLicense("htdemucs");
    assert.ok(license);
    const html = renderToStaticMarkup(
      createElement(SeparatorLicenseBadge, { license }),
    );
    assert.match(html, /sep-license-badge-icon/);
    assert.match(html, /sep-license-badge-text/);
    assert.match(html, /Non vérifié/);
    assert.match(html, /data-license-status="unverified"/);
  });
});
