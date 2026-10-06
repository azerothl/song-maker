import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXCLUDED_SEPARATOR_NOTES_FR,
  HTDEMUCS_MAINTAINER_QUOTE_EN,
  HTDEMUCS_NOTICE_FR,
  LICENSE_STATUS_ICON,
  LICENSE_STATUS_LABEL_FR,
  canDownloadSeparator,
  licenseStatusIcon,
  licenseStatusLabelFr,
  separatorLicense,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n.ts";

describe("separator licenses UI contract (#167)", () => {
  it("Mel-Band « Kim Vocal » license follows the author's current official model card", () => {
    const mel = separatorLicense("mel_band_roformer");
    assert.ok(mel);
    assert.equal(mel.status, "verified");
    assert.match(mel.badgeFr, /MIT/i);
    assert.equal(licenseStatusLabelFr(mel.status), "vérifié");
    assert.doesNotMatch(mel.sourceUrl, /mlx-community/);
    assert.match(mel.sourceUrl, /KimberleyJSN\/melbandroformer/);
    assert.match(mel.noticeFr, /données d’entraînement ne sont pas documentées/i);
    assert.match(mel.noticeFr, /Kim Vocal »/);
    assert.doesNotMatch(mel.noticeFr, /Kim Vocal 2/);
    assert.equal(mel.readDate, "2026-10-06");
    assert.equal(canDownloadSeparator("mel_band_roformer", {}), false);
    assert.equal(canDownloadSeparator("mel_band_roformer", { mel_band_roformer: true }), true);
  });

  it("BS-RoFormer ep368 badge is non vérifié", () => {
    const bs = separatorLicense("bs_roformer");
    assert.ok(bs);
    assert.equal(bs.status, "unverified");
    assert.equal(licenseStatusLabelFr(bs.status), "non vérifié");
    assert.match(bs.noticeFr, /non vérifié/i);
  });

  it("HTDemucs warning quotes maintainer scientific purposes with source and date", () => {
    const ht = separatorLicense("htdemucs");
    assert.ok(ht);
    assert.equal(HTDEMUCS_MAINTAINER_QUOTE_EN, "only for scientific purposes");
    assert.match(ht.noticeFr, /only for scientific purposes/);
    assert.match(HTDEMUCS_NOTICE_FR, /Demucs #327/);
    assert.match(ht.noticeFr, /23 mai 2022|2022/);
    assert.match(ht.sourceUrl, /demucs\/issues\/327$/);
    assert.doesNotMatch(ht.sourceUrl, /issuecomment/);
    assert.match(ht.noticeFr, /MIT, usage commercial : oui/);
    const ht6 = separatorLicense("htdemucs_6s");
    assert.ok(ht6);
    assert.match(ht6.noticeFr, /6 stems non vérifiée/);
    assert.doesNotMatch(ht6.noticeFr, /jarredou/i);
    assert.doesNotMatch(ht6.noticeFr, /ONNX/i);
    assert.equal(ht.readDate, "2026-09-29");
    assert.match(ht.badgeFr, /scientific purposes/i);
  });

  it("exposes typed statuses with icons and exclusion notes", () => {
    assert.equal(licenseStatusLabelFr("verified"), "vérifié");
    assert.equal(licenseStatusLabelFr("unverified"), "non vérifié");
    assert.equal(licenseStatusLabelFr("non_commercial"), "usage non commercial");
    assert.equal(licenseStatusLabelFr("excluded"), "exclu");
    assert.ok(LICENSE_STATUS_ICON.unverified);
    assert.ok(licenseStatusIcon("non_commercial"));
    assert.ok(
      EXCLUDED_SEPARATOR_NOTES_FR.some((n) => /jarredou/i.test(n)),
    );
    assert.ok(EXCLUDED_SEPARATOR_NOTES_FR.some((n) => /CC BY-NC/i.test(n)));
    assert.equal(LICENSE_STATUS_LABEL_FR.excluded, "exclu");
  });

  it("Production license checkbox copy includes accessible model name", () => {
    const named = t("separate.license.acceptNamed", { name: "HTDemucs" });
    assert.match(named, /HTDemucs/);
    assert.match(named, /J'ai lu la licence/);
    assert.equal(t("separate.license.nc"), "usage non commercial");
    assert.match(t("sheetsage.license.badge"), /non commercial/);
    assert.match(t("phase4.styleLora.ncBadge"), /non commercial/);
  });
});
