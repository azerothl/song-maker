import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQualityTimeOptions,
  licenseStatusLabelFr,
  recommendReasonFr,
  recommendSeparator,
  separatorLicense,
  timeLabelFr,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

describe("Séparation recommandée (#166)", () => {
  it("affiche la mention non mesurée et des libellés de temps honnêtes", () => {
    assert.match(recommendReasonFr("mix"), /Recommandation non mesurée/);
    assert.match(recommendReasonFr("vocals"), /Recommandation non mesurée/);
    assert.match(recommendReasonFr("drums"), /Recommandation non mesurée/);
    const opts = buildQualityTimeOptions({
      focus: "mix",
      audioDurationSec: 42,
    });
    assert.ok(opts.every((o) => o.estimatedMs === null));
    assert.equal(timeLabelFr("exemple_non_mesure"), "exemple, non mesuré");
    assert.match(timeLabelFr("mesure"), /mesuré.*chargement du modèle/i);
  });

  it("signale avant lancement si le modèle recommandé n’est pas vérifié", () => {
    const recommended = recommendSeparator("mix");
    const license = separatorLicense(recommended);
    assert.ok(license);
    assert.notEqual(license.status, "verified");
    assert.equal(licenseStatusLabelFr(license.status), "non vérifié");
    assert.match(
      t("separate.recommend.unverifiedWarn"),
      /conditions d’utilisation.*ne sont pas vérifiées/i,
    );
    assert.match(
      t("separate.recommend.unverifiedBanner", {
        model: "HTDemucs",
        status: licenseStatusLabelFr(license.status),
      }),
      /non vérifié/i,
    );
    assert.doesNotMatch(
      t("separate.recommend.intro"),
      /Maquette Alphonse/i,
    );
  });

  it("propose de revenir à la recommandation après un choix manuel (#187)", () => {
    assert.equal(
      t("separate.recommend.revert"),
      "Revenir à la recommandation",
    );
  });
});
