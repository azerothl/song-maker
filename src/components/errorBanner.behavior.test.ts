import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "node:test";
import { ErrorBanner } from "./ErrorBanner";

it("announces only the error text and keeps its actions outside the alert", () => {
  const markup = renderToStaticMarkup(
    createElement(ErrorBanner, {
      presentation: {
        message: "Cette action n’a pas abouti.",
        details: "HTTP 500: backend error",
      },
      onDismiss: () => undefined,
    }),
  );

  assert.match(markup, /<span role="alert">Cette action n’a pas abouti\.<\/span>/);
  assert.match(markup, /<details class="error-details"><summary>Détails techniques<\/summary><pre tabindex="0">HTTP 500: backend error<\/pre><\/details>/);
  assert.match(markup, /<button type="button" aria-label="Fermer le message d’erreur">×<\/button>/);
  assert.doesNotMatch(markup, /<div class="banner error" role="alert">/);
});
