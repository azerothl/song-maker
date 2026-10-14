#!/usr/bin/env python3
"""Product transcribe: audio → MIDI via BasicPitch 0.4.0 ONNX (no TensorFlow)."""

from __future__ import annotations

import json
import sys
from contextlib import redirect_stdout
from pathlib import Path


def render_arrangement(request: dict):
    """Analyze exactly the active clip regions, before track/master effects."""
    import librosa
    import numpy as np

    rate = 22050
    clips = request["clips"]
    end_seconds = max((c["startMs"] + c["durationMs"]) / 1000 for c in clips)
    if end_seconds <= 0 or end_seconds > 3600:
        raise ValueError("Choisissez une piste ou un clip de moins d’une heure.")
    arranged = np.zeros(int(np.ceil(end_seconds * rate)), dtype=np.float32)
    sources = {}
    for clip in clips:
        path = clip["audioPath"]
        if path not in sources:
            sources[path], _ = librosa.load(path, sr=rate, mono=True)
        source = sources[path]
        ratio = clip["stretchRatio"]
        offset = max(0, round(clip["offsetMs"] / 1000 * rate))
        length = max(1, round(clip["durationMs"] / 1000 * rate))
        region = source[offset:offset + max(1, round(length / ratio))].copy()
        if not len(region):
            continue
        if abs(ratio - 1) > 0.0001:
            region = librosa.effects.time_stretch(region, rate=1 / ratio)
        if abs(clip["pitchSemitones"]) > 0.0001:
            region = librosa.effects.pitch_shift(region, sr=rate, n_steps=clip["pitchSemitones"])
        region = np.pad(region[:length], (0, max(0, length - len(region))))
        fade_in = min(length, max(0, round(clip["fadeInMs"] / 1000 * rate)))
        fade_out = min(length - fade_in, max(0, round(clip["fadeOutMs"] / 1000 * rate)))
        if fade_in:
            region[:fade_in] *= np.arange(fade_in, dtype=np.float32) / fade_in
        if fade_out:
            region[-fade_out:] *= np.arange(fade_out, 0, -1, dtype=np.float32) / fade_out
        region *= 10 ** (clip["gainDb"] / 20)
        start = max(0, round(clip["startMs"] / 1000 * rate))
        count = min(len(region), len(arranged) - start)
        arranged[start:start + count] += region[:count]
    # Prevent clipping in the audition file without changing pitches or timing.
    peak = float(np.max(np.abs(arranged)))
    if peak > 0.98:
        arranged *= 0.98 / peak
    return arranged, rate


def melodic_events(events: list, minimum_ms: float, mode: str) -> list:
    """Choose a continuous single line among detected notes; never invent pitches.

    Segment boundaries are the detected starts/ends. A dynamic program balances
    activation strength against rapid pitch changes. Chord mode bypasses this.
    """
    if not events or mode == "polyphonic":
        return events
    changes = {}
    for index, event in enumerate(events):
        changes.setdefault(event[0], [[], []])[0].append(index)
        changes.setdefault(event[1], [[], []])[1].append(index)
    times = sorted(changes)
    active = set()
    history = []
    previous = {None: 0.0}
    for left, right in zip(times, times[1:]):
        starts, ends = changes[left]
        active.difference_update(ends)
        active.update(starts)
        by_pitch = {}
        for index in active:
            event = events[index]
            pitch = event[2]
            if pitch not in by_pitch or event[3] > events[by_pitch[pitch]][3]:
                by_pitch[pitch] = index
        candidates = by_pitch or {None: None}
        scores, parents = {}, {}
        for pitch, index in candidates.items():
            strength = events[index][3] if index is not None else 0.0
            def transition(old):
                if old is None or pitch is None or old == pitch:
                    return 0.0
                return 0.025 * min(abs(old - pitch) / 12, 2)
            parent = max(previous, key=lambda old: previous[old] - transition(old))
            scores[pitch] = previous[parent] - transition(parent) + strength * (right - left)
            parents[pitch] = parent
        history.append((left, right, by_pitch, parents))
        # Renormalization keeps long tracks numerically stable.
        best = max(scores.values())
        previous = {pitch: value - best for pitch, value in scores.items()}
    pitch = max(previous, key=previous.get)
    selected = []
    for left, right, by_pitch, parents in reversed(history):
        if pitch is not None:
            selected.append((left, right, by_pitch[pitch]))
        pitch = parents[pitch]
    selected.reverse()
    merged = []
    for start, end, index in selected:
        original = events[index]
        # Preserve repeated attacks: merge only fragments of the same event.
        if merged and merged[-1][5] == index and abs(merged[-1][1] - start) < 1e-6:
            merged[-1][1] = end
        else:
            merged.append([start, end, original[2], original[3], None, index])
    return [tuple(event[:5]) for event in merged if (event[1] - event[0]) * 1000 >= minimum_ms]


def clip_events(events: list, clips: list, minimum_ms: float) -> list:
    """Discard neural activation tails outside audible arrangement regions."""
    intervals = []
    for clip in sorted(clips, key=lambda item: item["startMs"]):
        start = clip["startMs"] / 1000
        end = start + clip["durationMs"] / 1000
        if intervals and start <= intervals[-1][1]:
            intervals[-1][1] = max(intervals[-1][1], end)
        else:
            intervals.append([start, end])
    cropped = []
    for event in events:
        for left, right in intervals:
            start, end = max(event[0], left), min(event[1], right)
            if (end - start) * 1000 >= minimum_ms:
                cropped.append((start, end, *event[2:]))
    return cropped


def main() -> int:
    # BasicPitch prints Unicode status markers. Windows can otherwise choose
    # the legacy CP1252 code page for redirected stdout/stderr and fail after
    # inference has completed but before the MIDI is published.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="backslashreplace")

    if len(sys.argv) not in (3, 4):
        print("usage: transcribe.py <input-audio|request.json> <output.mid> [preview.wav]", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    dest = Path(sys.argv[2])
    if not src.is_file():
        print(json.dumps({"error": f"audio missing: {src}"}), file=sys.stderr)
        return 1
    try:
        import onnxruntime  # noqa: F401
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "onnxruntime missing — install basic-pitch==0.4.0 --no-deps and onnxruntime"
                }
            ),
            file=sys.stderr,
        )
        return 1
    from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
    from basic_pitch.inference import Model, predict

    model_path = build_icassp_2022_model_path(FilenameSuffix.onnx)
    if model_path.suffix != ".onnx":
        print(
            json.dumps({"error": f"default model is not ONNX: {model_path}"}),
            file=sys.stderr,
        )
        return 1
    import importlib.util

    out_dir = dest.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    # stdout is the machine-readable result. Avoid unused WAV/CSV side products
    # and filename collisions when detecting the same source more than once.
    request = None
    preview = None
    if len(sys.argv) == 4:
        import soundfile as sf
        request = json.loads(src.read_text(encoding="utf-8"))
        preview = Path(sys.argv[3])
        arranged, rate = render_arrangement(request)
        sf.write(str(preview), arranged, rate, subtype="PCM_16")
    options = request["options"] if request else {}
    sensitivity = options.get("sensitivity", "balanced")
    onset, frame = {"conservative": (0.65, 0.4), "balanced": (0.5, 0.3), "detailed": (0.4, 0.25)}[sensitivity]
    import librosa
    minimum_ms = options.get("minimumNoteMs", 127.7)
    with redirect_stdout(sys.stderr):
        _, midi, events = predict(
            str(preview or src), Model(model_path),
            onset_threshold=onset, frame_threshold=frame,
            minimum_note_length=minimum_ms,
            minimum_frequency=librosa.midi_to_hz(options.get("minimumPitch", 21)),
            # BasicPitch's frequency upper bound is exclusive.
            maximum_frequency=librosa.midi_to_hz(options.get("maximumPitch", 108) + 1),
            midi_tempo=request.get("tempoBpm", 120) if request else 120,
        )
    if request:
        events = clip_events(events, request["clips"], minimum_ms)
    events = melodic_events(events, minimum_ms, options.get("mode", "polyphonic"))
    if request or options.get("mode", "polyphonic") != "polyphonic":
        import pretty_midi
        instrument = pretty_midi.Instrument(program=32 if options["mode"] == "bass" else 0)
        instrument.notes = [pretty_midi.Note(
            velocity=max(1, min(127, round(float(amplitude) * 127))),
            pitch=int(pitch), start=float(start), end=float(end),
        ) for start, end, pitch, amplitude, _ in events]
        midi.instruments = [instrument]
    midi.write(str(dest))
    print(
        json.dumps(
            {
                "midiPath": str(dest),
                "model": str(model_path),
                "backend": "onnx",
                "tensorflowInstalled": importlib.util.find_spec("tensorflow") is not None,
                "notes": [
                    {"startSeconds": float(start), "endSeconds": float(end), "pitch": int(pitch),
                     "velocity": max(1, min(127, round(float(amplitude) * 127)))}
                    for start, end, pitch, amplitude, _ in events
                ],
                "durationSeconds": len(arranged) / rate if request else max((event[1] for event in events), default=0),
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
