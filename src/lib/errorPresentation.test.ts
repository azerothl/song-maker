import assert from "node:assert/strict";
import { it } from "node:test";
import { presentGlobalError } from "./errorPresentation";
import { englishCatalog, setAppLocale } from "../ui/i18n";

it("presents backend error codes as a localized action with opt-in details", () => {
  setAppLocale("fr");
  const result = presentGlobalError(
    'HTTP 500 Internal Server Error: {"error":{"message":"yue2.model_gguf must be relative to the Yue2 model root"}}',
  );

  assert.equal(
    result.message,
    "Cette action n’a pas abouti. Réessayez. Si le problème persiste, ouvrez les détails techniques.",
  );
  assert.match(result.details ?? "", /yue2\.model_gguf/);
});

it("keeps an existing actionable product message unchanged", () => {
  setAppLocale("fr");
  assert.deepEqual(
    presentGlobalError("La séparation n’a pas abouti. Vérifiez le moteur puis réessayez."),
    { message: "La séparation n’a pas abouti. Vérifiez le moteur puis réessayez." },
  );
});

it("bounds the length of expandable technical details", () => {
  setAppLocale("fr");
  const result = presentGlobalError(`HTTP 500 ${"x".repeat(5000)}`);

  assert.equal(result.details?.length, 4002);
  assert.equal(result.details?.endsWith("\n…"), true);
});

it("includes the same recovery guidance in English", () => {
  const english = englishCatalog();

  assert.equal(
    english["error.actionFailed"],
    "This action could not be completed. Try again. If the problem persists, open the technical details.",
  );
  assert.equal(english["error.technicalDetails"], "Technical details");
});
