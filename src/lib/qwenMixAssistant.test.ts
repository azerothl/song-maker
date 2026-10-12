import assert from "node:assert/strict";
import { it } from "node:test";
import { applyQwenAdjustments } from "./qwenMixAssistant";
import { buildCaptureDemoMix } from "../dev/captureDemoMix";
import fr from "../ui/fr.json";
import en from "../ui/en.production.json";
it("Qwen rejects unknown IDs, duplicate IDs, non-finite and oversized gains",()=>{
  const mix=buildCaptureDemoMix(6),track=mix.tracks[0];
  const valid={trackId:track.id,gainDb:track.gainDb-2,pan:0.2};
  assert.equal(applyQwenAdjustments(mix,[valid]).tracks[0].gainDb,valid.gainDb);
  assert.equal(mix.tracks[0].gainDb,track.gainDb);
  for(const changes of [[{...valid,trackId:"unknown"}],[valid,valid],[{...valid,gainDb:NaN}],[{...valid,gainDb:track.gainDb+7}],[{...valid,pan:2}]]) {
    assert.throws(()=>applyQwenAdjustments(mix,changes),/INVALID_RESPONSE/);
  }
});
it("Qwen FR/EN keys and variables match",()=>{
  for(const key of Object.keys(fr).filter(key=>key.startsWith("qwen.mix."))) {
    assert.ok(key in en,key);
    const variables=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(variables(fr[key as keyof typeof fr]),variables(en[key as keyof typeof en]),key);
  }
});
it("Qwen mix copy omits the closed development roadmap and explains user actions",()=>{
  const copy=(locale:Record<string,string>)=>Object.entries(locale)
    .filter(([key])=>key.startsWith("qwen.mix."))
    .map(([,value])=>value)
    .join(" ");
  assert.doesNotMatch(copy(fr),/#336|Phase 2[b-c]|Phase 3|sidecar|backend HTTP|Foundry Local/i);
  assert.doesNotMatch(copy(en),/#336|Phase 2[b-c]|Phase 3|sidecar|HTTP backend|Foundry Local/i);
  assert.match(fr["qwen.mix.rbitnet.weightsNotInInstaller"],/Téléchargez-le ici/);
  assert.match(fr["qwen.mix.rbitnet.jsonQuality"],/Vérifiez-les avant de les appliquer/);
  assert.match(en["qwen.mix.rbitnet.weightsNotInInstaller"],/Download it here/);
  assert.match(en["qwen.mix.rbitnet.jsonQuality"],/Review them before applying/);
});
