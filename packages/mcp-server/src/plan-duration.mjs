// YuE2 writes an ABC plan before it samples audio tokens. audio.cpp masks the
// stop token until semantic_min_tokens, so a plan shorter than the requested
// duration is followed by near-silence until the token budget is spent.

const INTRO = /intro/i;
const OUTRO = /outro|ending|coda|\bend\b/i;

function headerValue(header, key) {
  return header.find(line => line.startsWith(`${key}:`))?.slice(key.length + 1).trim() || null;
}

function fraction(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value || '');
  return match && Number(match[2]) ? Number(match[1]) / Number(match[2]) : null;
}

function barSeconds(header) {
  const meterField = headerValue(header, 'M');
  const meter = ['C', 'C|'].includes(meterField) ? 1 : fraction(meterField);
  const unit = fraction(headerValue(header, 'L'));
  const tempo = /^(?:(\d+\/\d+)\s*=\s*)?(\d+(?:\.\d+)?)$/.exec(headerValue(header, 'Q') || '');
  if (!meter || !tempo) return null;
  const beat = tempo[1] ? fraction(tempo[1]) : unit;
  const bpm = Number(tempo[2]);
  if (!beat || !(bpm > 0)) return null;
  return meter / beat * 60 / bpm;
}

function segmentBars(segment) {
  const token = segment.replace(/"[^"]*"/g, '').replace(/[\]\[]/g, '').trim();
  if (!token) return 0;
  const multiRest = /^Z(\d*)$/.exec(token);
  return multiRest ? Number(multiRest[1] || 1) : 1;
}

function countBars(line) {
  return line.split(/\|+/).reduce((sum, segment) => sum + segmentBars(segment), 0);
}

// Keeps the first `keep` bars of every voice in a phrase.
function trimBlock(block, keep) {
  const remaining = {};
  let voice = '';
  const lines = block.lines.map(line => {
    const voiceSwitch = /^V:\s*(\S+)/.exec(line);
    if (voiceSwitch) {
      voice = voiceSwitch[1];
      return line;
    }
    if (/^[A-Za-z]:/.test(line)) return line;
    remaining[voice] ??= keep;
    const kept = [];
    for (const segment of line.split(/\|+/)) {
      const bars = segmentBars(segment);
      if (!bars || remaining[voice] <= 0) continue;
      const take = Math.min(bars, remaining[voice]);
      kept.push(take < bars ? (take === 1 ? 'Z' : `Z${take}`) : segment);
      remaining[voice] -= take;
    }
    return kept.length ? `${kept.join('|')}|` : null;
  }).filter(line => line !== null);
  return { ...block, lines, bars: keep };
}

export function parseAbcPlan(abc) {
  const lines = String(abc || '').replace(/\r\n?/g, '\n').split('\n');
  const keyLine = lines.findIndex(line => /^K:/.test(line.trim()));
  if (keyLine < 0) return null;
  const header = lines.slice(0, keyLine + 1).map(line => line.trim());
  const secondsPerBar = barSeconds(header);
  if (!secondsPerBar) return null;

  const sections = [];
  let section = null;
  let block = null;
  let voice = null;
  const startSection = (marker, name) => {
    section = { marker, name, blocks: [] };
    sections.push(section);
    block = null;
  };
  for (const raw of lines.slice(keyLine + 1)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%')) {
      startSection(line, line.slice(1).trim());
      continue;
    }
    // Timing changes and repeats would make the bar count wrong.
    if (/\[[LMQ]:|^[LMQ]:|\|:|:\||::|\[\d/.test(line)) return null;
    if (!section) startSection(null, '');
    const voiceSwitch = /^V:\s*(\S+)/.exec(line);
    if (voiceSwitch) {
      voice = voiceSwitch[1];
      if (!block || voice in block.voices) {
        block = { lines: [], voices: {} };
        section.blocks.push(block);
      }
      block.voices[voice] = 0;
      block.lines.push(line);
      continue;
    }
    if (!block) {
      block = { lines: [], voices: {} };
      section.blocks.push(block);
    }
    if (!/^[A-Za-z]:/.test(line)) {
      const name = voice ?? '';
      block.voices[name] = (block.voices[name] || 0) + countBars(line);
    }
    block.lines.push(line);
  }
  for (const item of sections.flatMap(entry => entry.blocks)) item.bars = Math.max(0, ...Object.values(item.voices));
  const bars = sections.reduce((sum, entry) => sum + entry.blocks.reduce((total, item) => total + item.bars, 0), 0);
  if (!bars) return null;
  return { header, sections, secondsPerBar, bars, durationSec: bars * secondsPerBar };
}

function serialize(plan, sections) {
  const body = sections.flatMap(section => [
    ...(section.marker && section.blocks.length ? [section.marker] : []),
    ...section.blocks.flatMap(block => block.lines),
  ]);
  return [...plan.header, ...body].join('\n') + '\n';
}

function round(value) {
  return Math.round(value * 10) / 10;
}

// Repeats or removes phrases between the intro and the outro so the plan ends
// just after the requested duration. The outro stays last: the fixed token
// budget then stops during its final phrase instead of cutting a section or
// sampling past the plan. Whole phrases are preferred; one phrase is shortened
// only when the overshoot would cut more than that final phrase.
export function fitAbcPlan(abc, targetSec, { tailSec = 2 } = {}) {
  const plan = parseAbcPlan(abc);
  if (!plan) return { abc, action: 'unmeasured', planSec: null, fittedSec: null };
  const requiredBars = Math.ceil((targetSec + tailSec) / plan.secondsPerBar);
  const allBlocks = plan.sections.flatMap(section => section.blocks);
  const slackBars = allBlocks.findLast(block => block.bars > 0)?.bars || 0;
  const sections = plan.sections.map(section => ({ ...section, blocks: [...section.blocks] }));
  const first = sections.length > 1 && INTRO.test(sections[0].name) ? 1 : 0;
  const last = sections.length - first > 1 && OUTRO.test(sections.at(-1).name) ? sections.length - 1 : sections.length;
  const middle = sections.slice(first, last);
  const hasBars = section => section.blocks.some(block => block.bars > 0);
  const result = (fitted, bars, action) => ({
    abc: action === 'kept' ? abc : serialize(plan, fitted), action,
    planSec: round(plan.durationSec), fittedSec: round(bars * plan.secondsPerBar),
  });
  let bars = plan.bars;

  if (bars < requiredBars) {
    const source = middle.some(hasBars) ? middle.filter(hasBars) : sections.filter(hasBars);
    const added = [];
    for (let index = 0; bars < requiredBars; index++) {
      const original = source[index % source.length];
      const copy = { ...original, blocks: [] };
      added.push(copy);
      for (const block of original.blocks) {
        if (bars >= requiredBars) break;
        const keep = bars + block.bars <= requiredBars + slackBars ? block.bars : requiredBars - bars;
        copy.blocks.push(keep < block.bars ? trimBlock(block, keep) : block);
        bars += keep;
      }
    }
    return result([...sections.slice(0, last), ...added, ...sections.slice(last)], bars, 'extended');
  }
  if (bars <= requiredBars + slackBars || !middle.some(hasBars)) return result(sections, bars, 'kept');

  for (let index = middle.length - 1; index >= 0 && bars > requiredBars; index--) {
    const blocks = middle[index].blocks;
    while (blocks.length && bars - blocks.at(-1).bars >= requiredBars) bars -= blocks.pop().bars;
    if (blocks.length && bars > requiredBars + slackBars) {
      const block = blocks.pop();
      blocks.push(trimBlock(block, block.bars - (bars - requiredBars)));
      bars = requiredBars;
    }
    if (blocks.length) break;
  }
  return result(sections, bars, 'shortened');
}
