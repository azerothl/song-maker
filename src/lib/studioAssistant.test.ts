import assert from "node:assert/strict";
import test from "node:test";
import type { MixDoc } from "./types";
import {
  detectStudioAssistantIntent,
  makePianoFollowVoice,
  makeRegularBeatVoice,
  validateStudioAssistantMidiAction,
  usableMelodyVoices,
  assistantStateFingerprint,
  placeTranscribedMelody,
} from "./studioAssistant";
import type { ScoreVoice } from "@song-maker/score-engine";
import { createEmptyScoreDocument } from "./score";

test("manual MIDI and accompaniment are usable melodies; a drum beat is not", () => {
  const score = createEmptyScoreDocument({ tempoBpm: 120 });
  const drum = makeRegularBeatVoice("Beat");
  const melody = { ...makePianoFollowVoice(drum, "Manual"), role: "other" as const };
  score.voices = [drum, melody];
  assert.deepEqual(usableMelodyVoices(score).map(voice => voice.name), ["Manual"]);
});

test("transcribed melody follows trimmed, shifted and transposed audio clips", () => {
  const score = createEmptyScoreDocument({ tempoBpm: 120 });
  const source: ScoreVoice = { id: "source", name: "Melody", role: "melody", notes: [
    { id: "a", startTick: 960, durationTick: 960, pitch: 60, velocity: 90 },
    { id: "b", startTick: 2880, durationTick: 960, pitch: 64, velocity: 90 },
  ] };
  const track = { clips: [{ sourcePath: "melody.wav", offsetMs: 750, startMs: 2000, durationMs: 1000, pitchSemitones: 2 }] } as unknown as import("./types").MixTrack;
  const result = placeTranscribedMelody(source, score, score, track);
  assert.deepEqual(result.notes.map(note => [note.startTick, note.durationTick, note.pitch]), [[3840, 480, 62], [5280, 480, 66]]);
});

test("durable undo ignores saved version ids but detects manual note and gain edits", () => {
  const score = createEmptyScoreDocument({ tempoBpm: 120 });
  score.voices = [makeRegularBeatVoice("Beat")];
  const fingerprint = assistantStateFingerprint(emptyMix, score);
  assert.equal(assistantStateFingerprint({ ...emptyMix, id: "mix-v002" }, { ...score, id: "score-v002", version: 8 }), fingerprint);
  const edited = structuredClone(score);
  edited.voices[0].notes[0].pitch = 40;
  assert.notEqual(assistantStateFingerprint(emptyMix, edited), fingerprint);
  assert.notEqual(assistantStateFingerprint({ ...emptyMix, masterGainDb: -2 }, score), fingerprint);
  const history = JSON.parse(JSON.stringify({ messages: [], undoRecords: [{ beforeMix: emptyMix, beforeScore: score, afterFingerprint: fingerprint }] }));
  assert.equal(history.undoRecords[0].afterFingerprint, fingerprint);
});

const emptyMix = { tracks: [] } as unknown as MixDoc;

test("assistant recognizes the requested French MIDI actions", () => {
  assert.equal(detectStudioAssistantIntent("Ajoute une piste MIDI avec un beat régulier"), "beat");
  assert.equal(detectStudioAssistantIntent("Ajoute une piste avec une ligne de piano qui suit la mélodie"), "piano");
});

test("assistant beat builds editable, regular MIDI for the project meter", () => {
  const beat = makeRegularBeatVoice("Beat", { numerator: 4, denominator: 4 });
  assert.equal(beat.instrumentProgram, "drums");
  assert.equal(beat.notes.length, 48);
  assert.deepEqual(beat.notes.slice(0, 4).map((note) => [note.startTick, note.pitch]), [
    [0, 36], [0, 42], [480, 42], [960, 38],
  ]);
  validateStudioAssistantMidiAction({ type: "addMidiTrack", voice: beat }, emptyMix);

  const threeFour = makeRegularBeatVoice("Beat 3/4", { numerator: 3, denominator: 4 });
  assert.equal(threeFour.notes.length, 36);
  assert.equal(threeFour.notes.at(-1)?.startTick, 4 * 3 * 960 - 480);
});

test("assistant piano copies a selected melody as editable notes", () => {
  const source: ScoreVoice = {
    id: "melody-1",
    name: "Melody",
    role: "melody",
    notes: [
      { id: "n1", startTick: 120, durationTick: 240, pitch: 60, velocity: 100 },
      { id: "n2", startTick: 480, durationTick: 120, pitch: 64, velocity: 80 },
    ],
  };
  const piano = makePianoFollowVoice(source, "Piano follow");
  assert.equal(piano.instrumentProgram, "piano");
  assert.equal(piano.notes.length, source.notes.length);
  assert.deepEqual(piano.notes.map((note) => [note.startTick, note.durationTick, note.pitch]), [
    [120, 240, 60],
    [480, 120, 64],
  ]);
  validateStudioAssistantMidiAction({ type: "addMidiTrack", voice: piano }, emptyMix);
});

test("assistant refuses unsafe MIDI actions", () => {
  const invalid = makeRegularBeatVoice("Bad beat");
  invalid.notes[0] = { ...invalid.notes[0]!, pitch: 140 };
  assert.throws(
    () => validateStudioAssistantMidiAction({ type: "addMidiTrack", voice: invalid }, emptyMix),
    /hors limites/,
  );
});
