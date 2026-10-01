import assert from "node:assert/strict";
import { it } from "node:test";
import { buildRulerMarks } from "./musicalTime";
import { rulerDisplayMarks } from "./rulerDisplayMarks";

for(const mode of ["musical","time"] as const) {
  it(`${mode}: long ruler labels stay separated and zoom reveals more labels`,()=>{
    const duration=414000;
    const marks=buildRulerMarks(duration,mode,[{startMs:0,quarterBpm:120}],[{startMs:0,numerator:4,denominator:4}],4);
    const original=structuredClone(marks);
    const display=rulerDisplayMarks(marks,duration,1200);
    const labels=display.filter(mark=>mark.label);
    assert.ok(labels.length>2);
    for(let i=1;i<labels.length;i++)assert.ok((labels[i].ms-labels[i-1].ms)/duration*1200>=40);
    assert.ok(rulerDisplayMarks(marks,duration,2400).filter(mark=>mark.label).length>labels.length);
    assert.deepEqual(marks,original);
    assert.ok(display.every(mark=>marks.some(source=>source.ms===mark.ms)));
    for(let i=1;i<display.length;i++)assert.ok(display[i].ms>display[i-1].ms);
  });
}
