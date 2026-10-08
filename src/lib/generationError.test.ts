import assert from "node:assert/strict";
import { it } from "node:test";
import { generationErrorMessage } from "./generationError";
import { profileLocale, setAppLocale } from "../ui/i18n";

it("explains a rejected duration in the selected language", () => {
  const originalLocale = profileLocale();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let storedLocale = "fr";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => storedLocale,
      setItem: (_key: string, value: string) => {
        storedLocale = value;
      },
    },
  });
  try {
    setAppLocale("fr");
    assert.match(
      generationErrorMessage("GENERATION_DURATION_MISMATCH|360000|75278"),
      /75,3 s au lieu de 360 s/,
    );
    const legoFailure = 'Sidecar Lego a refusé la tâche : {"ok": false, "error": "<urlopen error [WinError 10061]>"}';
    assert.equal(generationErrorMessage(legoFailure),
      "La création de la nouvelle partie a échoué. Votre morceau est conservé. Réessayez ; si le problème persiste, relancez Song Maker.");
    assert.equal(generationErrorMessage("Séparateur manquant"), "Séparateur manquant");

    setAppLocale("en");
    assert.match(
      generationErrorMessage("GENERATION_DURATION_MISMATCH|360000|75278"),
      /75.3 s instead of 360 s/,
    );
    assert.equal(generationErrorMessage(new Error(legoFailure)),
      "The new part could not be created. Your song is preserved. Try again; if the problem persists, restart Song Maker.");
  } finally {
    setAppLocale(originalLocale);
    if (originalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalStorage);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
