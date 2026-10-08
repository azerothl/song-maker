import assert from "node:assert/strict";
import { it } from "node:test";
import { shouldOfferTakeContinuation } from "./takeContinuation";

it("does not offer lyric continuation for an instrumental take", () => {
  assert.equal(
    shouldOfferTakeContinuation({
      instrumentalMode: true,
      semanticTruncated: true,
    }),
    false,
  );
});

it("offers continuation for a truncated sung take only", () => {
  assert.equal(
    shouldOfferTakeContinuation({
      instrumentalMode: false,
      semanticTruncated: true,
    }),
    true,
  );
  assert.equal(
    shouldOfferTakeContinuation({
      instrumentalMode: false,
      semanticTruncated: false,
    }),
    false,
  );
});
