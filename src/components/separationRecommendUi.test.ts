import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQualityTimeOptions,
  recommendReasonFr,
  timeLabelFr,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

describe("Séparation recommandée (#166)", () => {
  it("affiche la mention non mesurée et des libellés de temps honnêtes", () => {
    assert.match(recommendReasonFr("mix"), /Recommandation non mesurée/);
    const opts = buildQualityTimeOptions({
      focus: "mix",
      audioDurationSec: 42,
    });
    assert.ok(opts.every((o) => o.estimatedMs === null));
    assert.equal(timeLabelFr("exemple_non_mesure"), "exemple, non mesuré");
    assert.match(
      timeLabelFr("mesure"),
      /mesuré.*chargement du modèle/i,
    );
    assert.match(t("separate.recommend.unverifiedWarn"), /licence vérifiée/i);
  });
});
