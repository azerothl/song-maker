import assert from "node:assert/strict";
import { it } from "node:test";
import enApp from "../ui/en.app.json";
import fr from "../ui/fr.json";

it("the score hint names the audio workflow without exposing its model name", () => {
  const french = fr["workspace.score.repriseHint"];
  const english = enApp["workspace.score.repriseHint"];

  assert.match(french, /transforme l’audio en partition/i);
  assert.match(french, /guider une nouvelle génération/i);
  assert.match(french, /Reprise/);
  assert.doesNotMatch(french, /SheetSage2|décodeur|inpainting|audio_input/i);
  assert.match(english, /turns audio into a score/i);
  assert.match(english, /guide a new generation/i);
  assert.match(english, /Cover/);
  assert.doesNotMatch(english, /SheetSage2|decoder|inpainting|audio_input/i);
});
