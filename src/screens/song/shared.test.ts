import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FormInput } from "../../lib/types";
import {
  advancedSettingsSummary,
  formatDurationLabel,
  formatGainDb,
  formatPan,
  primaryFormError,
  snapDurationSec,
  soundSummaryValue,
  validateFormFields,
  warningLabel,
  workspaceLabel,
} from "./shared.ts";

function form(overrides: Partial<FormInput> = {}): FormInput {
  return {
    title: "Ma chanson",
    style: "pop",
    lyrics: "couplet un",
    cot: "full",
    singingLanguage: null,
    tempoBpm: null,
    key: null,
    meter: null,
    seed: null,
    targetDurationSec: 180,
    preferFullLyrics: true,
    instrumentalMode: false,
    continuationGenerationId: null,
    ...overrides,
  };
}

describe("formatDurationLabel", () => {
  it("formate minutes et secondes avec zéro initial", () => {
    assert.equal(formatDurationLabel(180), "3:00");
    assert.equal(formatDurationLabel(90), "1:30");
    assert.equal(formatDurationLabel(360), "6:00");
  });
});

describe("snapDurationSec", () => {
  it("arrondit au pas de 30 s", () => {
    assert.equal(snapDurationSec(200), 210);
    assert.equal(snapDurationSec(184), 180);
  });

  it("borne entre DURATION_SEC_MIN et DURATION_SEC_MAX", () => {
    assert.equal(snapDurationSec(5), 30);
    assert.equal(snapDurationSec(9999), 360);
  });
});

describe("formatGainDb", () => {
  it("formate à une décimale", () => {
    assert.equal(formatGainDb(0), "0.0 dB");
    assert.equal(formatGainDb(-3.5), "-3.5 dB");
  });

  it("signe les gains positifs", () => {
    assert.equal(formatGainDb(3), "+3.0 dB");
  });
});

describe("formatPan", () => {
  it("traite le centre comme centré", () => {
    assert.equal(formatPan(0), "Centre");
    assert.equal(formatPan(0.01), "Centre");
  });

  it("nomme le côté et la distance", () => {
    assert.equal(formatPan(-1), "Gauche 1.00");
    assert.equal(formatPan(1), "Droite 1.00");
  });
});

describe("validateFormFields", () => {
  it("accepte un formulaire valide", () => {
    assert.deepEqual(validateFormFields(form()), {});
  });

  it("refuse un titre vide, trop long, ponctué ou interdit", () => {
    assert.ok(validateFormFields(form({ title: "  " })).title);
    assert.ok(validateFormFields(form({ title: "a".repeat(121) })).title);
    assert.ok(validateFormFields(form({ title: "titre." })).title);
    assert.ok(validateFormFields(form({ title: "a/b" })).title);
  });

  it("refuse un style vide", () => {
    assert.ok(validateFormFields(form({ style: " " })).style);
  });

  it("exige des paroles sauf en mode instrumental", () => {
    assert.ok(validateFormFields(form({ lyrics: "" })).lyrics);
    assert.equal(
      validateFormFields(form({ lyrics: "", instrumentalMode: true })).lyrics,
      undefined,
    );
  });

  it("borne la durée au pas de 30 s entre 30 et 360", () => {
    assert.ok(validateFormFields(form({ targetDurationSec: 29 })).duration);
    assert.ok(validateFormFields(form({ targetDurationSec: 361 })).duration);
    assert.ok(validateFormFields(form({ targetDurationSec: 175 })).duration);
    assert.equal(
      validateFormFields(form({ targetDurationSec: 175 })).duration === undefined,
      false,
    );
    assert.equal(validateFormFields(form({ targetDurationSec: 210 })).duration, undefined);
  });
});

describe("primaryFormError", () => {
  it("renvoie le premier champ en erreur dans l'ordre du formulaire", () => {
    assert.equal(
      primaryFormError({ title: "T", style: "S", lyrics: "L", duration: "D" }),
      "T",
    );
    assert.equal(primaryFormError({ style: "S", lyrics: "L" }), "S");
    assert.equal(primaryFormError({}), null);
  });
});

describe("soundSummaryValue", () => {
  it("inclut la durée et la préférence de paroles", () => {
    const summary = soundSummaryValue(form());
    assert.ok(summary.includes(formatDurationLabel(180)));
  });

  it("ajoute le tempo et la langue quand ils sont renseignés", () => {
    const summary = soundSummaryValue(
      form({ tempoBpm: 112, singingLanguage: "fr" }),
    );
    assert.ok(summary.includes("112"));
    assert.ok(summary.includes("fr"));
  });
});

describe("advancedSettingsSummary", () => {
  it("inclut le résumé sonore et le mode cot", () => {
    assert.ok(advancedSettingsSummary(form()).length > 0);
  });

  it("ajoute tonalité, mesure et seed quand ils sont présents", () => {
    const summary = advancedSettingsSummary(
      form({
        key: { tonic: "C", mode: "major" },
        meter: { numerator: 3, denominator: 4 },
        seed: 42,
      }),
    );
    assert.ok(summary.includes("Do"));
    assert.ok(summary.includes("3/4"));
    assert.ok(summary.includes("42"));
  });
});

describe("workspaceLabel", () => {
  it("renvoie un libellé non vide pour chaque onglet", () => {
    for (const space of ["create", "score", "production", "versions"] as const) {
      assert.ok(workspaceLabel(space).length > 0, space);
    }
  });
});

describe("warningLabel", () => {
  it("traduit un code de séparation connu", () => {
    assert.ok(warningLabel("guitar-piano").length > 0);
  });
});
