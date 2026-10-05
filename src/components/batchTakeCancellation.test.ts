import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BatchTaskRow } from "./BatchGenerationPanel";
import type { BatchTask } from "../lib/api";

it("renders individual cancellation only for pending or active takes", () => {
  for (const state of ["queued", "retry_wait", "preparing", "running", "publishing", "succeeded", "failed", "interrupted", "cancelled", "cancel_requested"]) {
    const task: BatchTask = { taskId: "audit-1", songId: "audit", seed: 42, title: "Audit", variantIndex: 1, state };
    const html = renderToStaticMarkup(createElement(BatchTaskRow, {
      task, onOpen: () => {}, onCancel: async () => {},
    }));
    const cancellable = ["queued", "retry_wait", "preparing", "running", "publishing"].includes(state);
    assert.equal(html.includes("Annuler cette prise"), cancellable, state);
    if (cancellable) assert.match(html, /aria-label="Annuler la prise 1 de Audit"/);
  }
});
