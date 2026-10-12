import assert from 'node:assert/strict';
import test from 'node:test';
import { fitAbcPlan, parseAbcPlan } from '../src/plan-duration.mjs';

// 4/4 at 90 BPM: one bar lasts 8/3 s.
const header = ['X:1', 'T:', 'M:4/4', 'L:1/32', 'Q:1/4=90',
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  'V: Ins clef=treble name="Ins Melody" snm="Inst."', 'K:C'];
const phrase = (vocal, ins) => ['V: Vocal', vocal, 'V: Ins', ins];
const intro = ['% intro', ...phrase('z32|"C"z32|"F"z32|"G"z32|', 'C8E8G8c8|c32|F8A8c8f8|G32|')];
const verse = ['% verse', ...phrase('"C"c8d8e8f8|g32|"F"a8g8f8e8|d32|', 'Z4|'),
  ...phrase('"G"B8c8d8e8|f32|"C"e8d8c8B8|c32|', 'Z4|')];
const outro = ['% outro', ...phrase('"C"c32|z32|', 'c32|Z|')];
const abc = (...sections) => [...header, ...sections.flat()].join('\n') + '\n';
const bars = seconds => Math.ceil(seconds / (8 / 3));
const markers = text => text.split('\n').filter(line => line.startsWith('%'));

test('measures a YuE2 plan from its meter, tempo and bars', () => {
  const plan = parseAbcPlan(abc(intro, verse, outro));
  assert.equal(plan.bars, 14);
  assert.equal(plan.secondsPerBar, 8 / 3);
  assert.deepEqual(plan.sections.map(section => section.blocks.map(block => block.bars)), [[4], [4, 4], [2]]);
});

test('a plan shorter than the duration repeats its middle before the outro', () => {
  const fitted = fitAbcPlan(abc(intro, verse, outro), 60);
  const plan = parseAbcPlan(fitted.abc);
  assert.equal(fitted.action, 'extended');
  assert.equal(fitted.planSec, 37.3);
  assert.ok(plan.bars >= bars(62) && plan.bars <= bars(62) + 2);
  assert.deepEqual(markers(fitted.abc), ['% intro', '% verse', '% verse', '% verse', '% outro']);
  assert.equal(fitted.abc.trimEnd().split('\n').at(-1), 'c32|Z|');
});

test('a repeated phrase that would cut the outro is shortened bar by bar', () => {
  const longVerse = ['% verse', ...phrase('"C"c32|d32|e32|f32|g32|a32|b32|c\'32|', 'Z8|')];
  // 42 s + 2 s needs 17 bars; the whole 8-bar phrase would add 5 bars more,
  // which the fixed budget would cut from the outro.
  const fitted = fitAbcPlan(abc(intro, longVerse, outro), 42);
  assert.equal(parseAbcPlan(fitted.abc).bars, bars(44));
  const lines = fitted.abc.split('\n');
  const repeated = lines.lastIndexOf('% verse');
  assert.deepEqual(lines.slice(repeated, repeated + 6),
    ['% verse', 'V: Vocal', '"C"c32|d32|e32|', 'V: Ins', 'Z3|', '% outro']);
});

test('a plan longer than the duration drops middle phrases and keeps the outro', () => {
  const fitted = fitAbcPlan(abc(intro, verse, verse, verse, outro), 30);
  const plan = parseAbcPlan(fitted.abc);
  assert.equal(fitted.action, 'shortened');
  assert.equal(fitted.planSec, 80);
  assert.ok(plan.bars >= bars(32) && plan.bars <= bars(32) + 2);
  assert.deepEqual(markers(fitted.abc), ['% intro', '% verse', '% outro']);
  assert.equal(fitted.abc.trimEnd().split('\n').at(-1), 'c32|Z|');
});

test('a plan that already ends within its final phrase is left untouched', () => {
  const original = abc(intro, verse, outro);
  const fitted = fitAbcPlan(original, 34);
  assert.equal(fitted.action, 'kept');
  assert.equal(fitted.abc, original);
});

test('plans without tempo or with repeats are reported as unmeasured', () => {
  const noTempo = abc(intro, verse, outro).replace('Q:1/4=90\n', '');
  assert.equal(fitAbcPlan(noTempo, 60).action, 'unmeasured');
  assert.equal(fitAbcPlan(noTempo, 60).abc, noTempo);
  const repeated = abc(intro, ['% verse', ...phrase('|:"C"c32|d32:|', 'Z2|')], outro);
  assert.equal(fitAbcPlan(repeated, 60).action, 'unmeasured');
});
