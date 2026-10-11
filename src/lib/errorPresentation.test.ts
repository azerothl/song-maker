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
    "Le modèle YuE2 est introuvable. Vérifiez son installation dans Paramètres > Modèles, puis réessayez.",
  );
  assert.match(result.details ?? "", /yue2\.model_gguf/);
});

it("explains how to recover from a YuE2 memory allocation failure", () => {
  setAppLocale("fr");
  const result = presentGlobalError(
    'HTTP 500 Internal Server Error: {"error":{"message":"failed to allocate Yue2 AR prefix-state graph"}}',
  );

  assert.equal(
    result.message,
    "YuE2 n’a pas pu réserver assez de mémoire. Fermez les autres traitements audio, réduisez la durée demandée, puis réessayez.",
  );
  assert.match(result.details ?? "", /prefix-state graph/);
});

it("keeps an existing actionable product message unchanged", () => {
  setAppLocale("fr");
  assert.deepEqual(
    presentGlobalError("La séparation n’a pas abouti. Vérifiez le moteur puis réessayez."),
    { message: "La séparation n’a pas abouti. Vérifiez le moteur puis réessayez." },
  );
});

it("keeps separation recovery guidance and exposes the original error on demand", () => {
  setAppLocale("fr");
  const result = presentGlobalError(
    "La séparation n’a pas abouti. Votre morceau d’origine est conservé. Vérifiez le moteur dans Paramètres, puis réessayez.\n\nHTTP 500: audio.cpp model unavailable",
  );

  assert.equal(
    result.message,
    "La séparation n’a pas abouti. Votre morceau d’origine est conservé. Vérifiez le moteur dans Paramètres, puis réessayez.",
  );
  assert.equal(result.details, "HTTP 500: audio.cpp model unavailable");
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
  assert.equal(
    english["error.yue2ModelUnavailable"],
    "The YuE2 model could not be found. Check its installation in Settings > Models, then try again.",
  );
  assert.equal(
    english["error.yue2MemoryAllocation"],
    "YuE2 could not reserve enough memory. Close other audio tasks, shorten the requested duration, then try again.",
  );
});
