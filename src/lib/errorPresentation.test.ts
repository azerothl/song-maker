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

it("turns a full project disk into a clear recovery action", () => {
  setAppLocale("fr");
  const result = presentGlobalError("Espace insuffisant sur le disque. (os error 112)");

  assert.equal(
    result.message,
    "Espace disque insuffisant pour enregistrer cette modification. Libérez de l’espace sur le disque du projet, puis réessayez.",
  );
  assert.match(result.details ?? "", /os error 112/);
});

it("explains how to recover when the project database cannot be opened", () => {
  setAppLocale("fr");
  const result = presentGlobalError("unable to open database file");

  assert.equal(
    result.message,
    "Impossible d’ouvrir la bibliothèque de projets. Vérifiez l’espace disponible et l’accès au dossier des projets, puis réessayez.",
  );
  assert.equal(result.details, "unable to open database file");
});

it("explains how to recover when the local audio runtime endpoint is unavailable", () => {
  setAppLocale("fr");
  const result = presentGlobalError(
    "error sending request for url (http://127.0.0.1:8765/v1/tasks/run)",
  );

  assert.equal(
    result.message,
    "Le moteur audio local ne répond pas. Vérifiez son état dans la barre latérale. Redémarrez-le si besoin, puis réessayez.",
  );
  assert.match(result.details ?? "", /127\.0\.0\.1:8765/);

  assert.equal(
    englishCatalog()["error.audioRuntimeUnavailable"],
    "The local audio engine did not respond. Check its status in the sidebar. Restart it if needed, then try again.",
  );
});

it("keeps an existing actionable product message unchanged", () => {
  setAppLocale("fr");
  assert.deepEqual(
    presentGlobalError("La séparation n’a pas abouti. Vérifiez le moteur puis réessayez."),
    { message: "La séparation n’a pas abouti. Vérifiez le moteur puis réessayez." },
  );
});

it("keeps JavaScript runtime errors out of the primary user message", () => {
  setAppLocale("fr");
  const result = presentGlobalError(
    "TypeError: Cannot read properties of undefined (reading 'invoke')",
  );

  assert.equal(
    result.message,
    "Cette action n’a pas abouti. Réessayez. Si le problème persiste, ouvrez les détails techniques.",
  );
  assert.equal(
    result.details,
    "TypeError: Cannot read properties of undefined (reading 'invoke')",
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
  assert.equal(
    english["error.diskFull"],
    "There isn't enough disk space to save this change. Free some space on the project drive, then try again.",
  );
  assert.equal(
    english["error.projectStorageUnavailable"],
    "Song Maker couldn't open the project library. Check free disk space and access to the projects folder, then try again.",
  );
});
