import assert from "node:assert/strict";
import { it } from "node:test";
import { generationLyrics } from "./generationLyrics";

it("instrumental requests exclude retained lyrics without destroying the draft", () => {
  const form = { instrumentalMode: true, lyrics: "[Verse]\nParoles déjà écrites" };
  assert.equal(generationLyrics(form), "");
  assert.equal(form.lyrics, "[Verse]\nParoles déjà écrites");
  assert.equal(generationLyrics({ ...form, instrumentalMode: false }), form.lyrics);
});
