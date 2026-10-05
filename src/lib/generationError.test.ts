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

    setAppLocale("en");
    assert.match(
      generationErrorMessage("GENERATION_DURATION_MISMATCH|360000|75278"),
      /75.3 s instead of 360 s/,
    );
  } finally {
    setAppLocale(originalLocale);
    if (originalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalStorage);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
