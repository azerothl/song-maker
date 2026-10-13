"""Windows acceptance probe of the shipped isolated VST3 worker, with installed plugins.

Usage: python scripts/verify-vst3-installed.py <song-maker.exe> <output-directory>
Does not install plugins or modify their presets on disk.
"""
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

exe = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True, exist_ok=True)
rate = 48000
frames = rate * 3
samples = [0.0] * (frames * 2)
for frame in range(frames):
    value = (math.sin(frame * math.tau * 220 / rate) + math.sin(frame * math.tau * 880 / rate) * 0.35) * 0.08
    samples[frame * 2] = value
    samples[frame * 2 + 1] = value * 0.7
input_path = root / "source.pcm"
input_path.write_bytes(struct.pack(f"<{len(samples)}f", *samples))

def worker(name, plugin, operation, parameters=None):
    output = root / f"{name}.pcm"
    request = {
        "operation": operation, "pluginPath": str(plugin), "parameters": parameters or {},
        "sampleRate": rate, "peakCeilingDb": 0, "pluginStateB64": None,
        "inputPath": str(input_path) if operation == "process" else None,
        "outputPath": str(output) if operation != "inspect" else None,
        "renderFrames": frames if operation == "render_midi" else 0,
        "midiNotes": [{"startFrame": 0, "endFrame": rate, "pitch": 48, "velocity": 100},
                      {"startFrame": rate, "endFrame": rate * 2, "pitch": 52, "velocity": 90}]
                     if operation == "render_midi" else [],
    }
    req_path = root / f"{name}.request.json"
    res_path = root / f"{name}.response.json"
    req_path.write_text(json.dumps(request), encoding="utf-8")
    completed = subprocess.run([str(exe), "--vst3-host-worker", str(req_path), str(res_path)],
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                               capture_output=True, timeout=120)
    response = json.loads(res_path.read_text(encoding="utf-8")) if res_path.exists() else {}
    if completed.returncode or not response.get("ok"):
        raise RuntimeError(f"{name}: {response.get('error', completed.stderr.decode(errors='replace'))}")
    return response, output

def pcm(path):
    data = path.read_bytes()
    values = struct.unpack(f"<{len(data)//4}f", data)
    assert len(values) == frames * 2 and all(math.isfinite(value) for value in values)
    return values

effect = Path(r"C:\Program Files\Common Files\VST3\MixBox.vst3")
description, _ = worker("eq-inspect", effect, "inspect")
assert "instrument" not in description["plugin"]["category"].lower()
_, wet_path = worker("eq-default", effect, "process")
wet = pcm(wet_path)
rms = math.sqrt(sum(value * value for value in wet) / len(wet))
assert rms > 0.001, "The activated effect buses must produce audio."
parameter = next(p for p in description["plugin"]["parameters"]
                 if any(word in p["name"].lower() for word in ["gain", "volume", "output level"])
                 and not p["readOnly"] and not p["bypass"])
_, changed_path = worker("eq-changed", effect, "process", {str(parameter["id"]): 0.9})
changed = pcm(changed_path)
delta = math.sqrt(sum((a-b)**2 for a, b in zip(wet, changed)) / len(wet))
assert delta > 0.00001, "Changing the insert must change its audio output."

instrument = Path(r"C:\Program Files\Common Files\VST3\Odin2.vst3")
instrument_description, _ = worker("instrument-inspect", instrument, "inspect")
assert "instrument" in instrument_description["plugin"]["category"].lower()
_, instrument_path = worker("instrument-midi", instrument, "render_midi")
instrument_pcm = pcm(instrument_path)
instrument_rms = math.sqrt(sum(value * value for value in instrument_pcm) / len(instrument_pcm))
assert instrument_rms > 0.0001, "The VST3 instrument must render audible MIDI."
report = {"effect": description["plugin"]["name"], "effectRms": rms, "parameter": parameter["name"],
          "parameterDeltaRms": delta, "instrument": instrument_description["plugin"]["name"],
          "instrumentRms": instrument_rms, "sampleRate": rate, "seconds": 3}
(root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
