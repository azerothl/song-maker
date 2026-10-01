import type { RulerMark } from "./musicalTime";

/** Display density only: snapping continues to use the complete musical grid. */
export function rulerDisplayMarks(marks: RulerMark[], durationMs: number, width: number): RulerMark[] {
  if (!(durationMs > 0) || !(width > 0)) return marks.filter(mark=>mark.ms===0);
  const result:RulerMark[]=[];
  let lastTick=-Infinity;
  let lastLabel=-Infinity;
  let lastLabelWidth=0;
  for(const mark of [...marks].sort((a,b)=>a.ms-b.ms)) {
    const x=mark.ms/durationMs*width;
    const labelWidth=mark.label.length*8+12;
    const label=mark.label && x-lastLabel>=Math.max(40,(lastLabelWidth+labelWidth)/2)
      ?mark.label:"";
    if(!label && x-lastTick<6)continue;
    result.push({...mark,label});
    lastTick=x;
    if(label){lastLabel=x;lastLabelWidth=labelWidth;}
  }
  return result;
}
