# Essai interne BasicPitch (issue #169)

Script hors produit : audio → MIDI via **BasicPitch 0.4.0 / ONNX**, sans TensorFlow.

## Prérequis

- Python 3.11+ (testé 3.12)
- `ffmpeg`
- venv local (ne pas installer dans le monorepo Node)

## Installation ONNX (sans TF)

Sur Linux + Python ≥ 3.11, `pip install basic-pitch` tire TensorFlow. Pour forcer ONNX :

```bash
python3 -m venv /tmp/basicpitch-venv
source /tmp/basicpitch-venv/bin/activate
pip install -U 'pip' 'setuptools<81' wheel
pip install basic-pitch==0.4.0 --no-deps
pip install -r scripts/basicpitch-trial/requirements.txt
```

Vérifier que le modèle par défaut est `.onnx` :

```bash
python -c "from basic_pitch import ICASSP_2022_MODEL_PATH; print(ICASSP_2022_MODEL_PATH)"
```

## Lancer

Depuis la racine du dépôt :

```bash
python scripts/basicpitch-trial/run_trial.py
```

Sorties : `docs/basicpitch-trial/midi/`, `docs/basicpitch-trial/metrics.json`.  
Les WAV d’extraits ne sont plus écrits sous `docs/` (preuves A/B = mp3 + spectrogrammes).

Compte rendu : [`docs/basicpitch-trial/REPORT.md`](../../docs/basicpitch-trial/REPORT.md).

## Hors périmètre

- Pas d’UI, pas de commande Tauri, pas d’intégration produit.
- ADTOF exclu (CC BY-NC-SA) — hors essai.
- Clippy N/A (pas de Rust).
