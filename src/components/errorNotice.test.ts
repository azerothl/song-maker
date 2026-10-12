import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "node:test";
import { ErrorNotice } from "./ErrorNotice";

it("keeps technical details collapsed below the recovery message", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorNotice, {
      message: "HTTP 500 Internal Server Error: {\"error\":{\"message\":\"failed\"}}",
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /This action|Cette action/);
  assert.match(html, /<details class="error-details">/);
  assert.match(html, /Technical details|Détails techniques/);
  assert.match(html, /<pre tabindex="0">/);
  assert.match(html, /&quot;error&quot;/);
  const alertContent = html.match(/<span role="alert">([\s\S]*?)<\/span>/)?.[1] ?? "";
  assert.match(alertContent, /This action|Cette action/);
  assert.doesNotMatch(alertContent, /<details|<summary|<pre/);
});
