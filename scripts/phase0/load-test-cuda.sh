#!/usr/bin/env bash
# Test de charge CUDA Ubuntu : archive épinglée cuda12.8-colab + lazy load yue2.
# Ne lance PAS de génération. Ne ment PAS si le matériel CUDA est absent.
#
# Prérequis:
#   1. Ubuntu desktop avec driver NVIDIA ≥ 570.26
#   2. ./download-binaries.sh --linux
#   3. ./download-models.sh --q4   # ou pack Q8 si VRAM ≥ 12 Go
#
# Usage:
#   ./load-test-cuda.sh
#   ./load-test-cuda.sh --port 8766
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

PORT="$(jq -r '.server.port' "$PINS_FILE")"
HOST="$(jq -r '.server.host' "$PINS_FILE")"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) echo "Option inconnue: $1" >&2; exit 1 ;;
  esac
done

ARCHIVE_NAME="audio-v0.8.1-bin-ubuntu-x64-cuda12.8-colab.tar.gz"
ARCHIVE_PATH="${BIN_DIR}/${ARCHIVE_NAME}"
EXTRACT_DIR="${BIN_DIR}/linux-cuda12.8-colab"
CONFIG_PATH="${BIN_DIR}/audiocpp-server.phase0.json"
LOG_PATH="${BIN_DIR}/load-test-cuda.log"

echo "=== Song Maker Phase 0 — load test CUDA (Ubuntu cuda12.8-colab) ==="
echo

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Ce script cible Ubuntu/Linux. Plateforme actuelle: $(uname -s)"
  exit 1
fi

if ! report_cuda_status; then
  cat <<EOF

ÉCHEC ATTENDU SANS GPU
----------------------
Aucun GPU NVIDIA détecté (nvidia-smi absent ou vide).
Le load test CUDA n'a PAS réussi et ne doit PAS être marqué comme validé.

Procédure manuelle sur une machine équipée :
  1. Installer un driver NVIDIA ≥ 570.26
  2. cd scripts/phase0 && ./download-binaries.sh --linux
  3. ./download-models.sh --q4   # ou --both-gguf
  4. ./load-test-cuda.sh
  5. Vérifier dans le journal que le modèle yue2 charge sans erreur
  6. curl -s http://127.0.0.1:${PORT}/health

Si le chargement yue2 échoue hors Colab, Linux CUDA n'est pas livré
sur un autre binaire (Vulkan / CPU exclus — contrat §2.2 / Phase 0).
EOF
  exit 2
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive absente: ${ARCHIVE_PATH}"
  echo "Lancez: ${SCRIPT_DIR}/download-binaries.sh --linux"
  exit 1
fi

verify_file "$ARCHIVE_PATH" "$(jq -r '.audioCpp.archives[] | select(.id=="linux-cuda12.8-colab") | .sha256' "$PINS_FILE")" "$ARCHIVE_NAME"

mkdir -p "$EXTRACT_DIR"
if [[ ! -x "${EXTRACT_DIR}/audiocpp_server" && ! -x "${EXTRACT_DIR}/bin/audiocpp_server" ]]; then
  echo "Extraction de ${ARCHIVE_NAME}…"
  tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"
fi

SERVER_BIN="$(find "$EXTRACT_DIR" -type f -name 'audiocpp_server' | head -1)"
if [[ -z "$SERVER_BIN" ]]; then
  echo "audiocpp_server introuvable dans ${EXTRACT_DIR}" >&2
  find "$EXTRACT_DIR" -maxdepth 3 -type f | head -40 >&2
  exit 1
fi
chmod +x "$SERVER_BIN" || true

GGUF_Q8="${YUE2_DIR}/yue2-3b-q8_0.gguf"
GGUF_Q4="${YUE2_DIR}/yue2-3b-q4_0.gguf"
if [[ -f "$GGUF_Q8" ]]; then
  YUE2_PATH="$YUE2_DIR"
elif [[ -f "$GGUF_Q4" ]]; then
  YUE2_PATH="$YUE2_DIR"
else
  echo "Aucun GGUF YuE2. Lancez: ./download-models.sh"
  exit 1
fi

HT_PATH="${HTDEMUCS_DIR}/$(jq -r '.htdemucs.file' "$PINS_FILE")"
if [[ ! -f "$HT_PATH" ]]; then
  echo "HTDemucs manquant: ${HT_PATH}"
  exit 1
fi

python3 - "$CONFIG_PATH" "$HOST" "$PORT" "$YUE2_PATH" "$HT_PATH" <<'PY'
import json, sys
path, host, port, yue2, htd = sys.argv[1:6]
cfg = {
  "host": host,
  "port": int(port),
  "backend": "cuda",
  "device": 0,
  "lazy_load": True,
  "max_loaded_models": 1,
  "idle_unload_ms": 0,
  "busy_timeout_ms": 300000,
  "models": [
    {
      "id": "yue2",
      "family": "yue2",
      "path": yue2,
      "task": "gen",
      "mode": "offline",
      "busy_timeout_ms": 1800000,
    },
    {
      "id": "htdemucs",
      "family": "htdemucs",
      "path": htd,
      "task": "sep",
      "mode": "offline",
      "busy_timeout_ms": 600000,
    },
  ],
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("Config écrite:", path)
PY

echo "Démarrage: ${SERVER_BIN} --config ${CONFIG_PATH} --backend cuda"
echo "Journal: ${LOG_PATH}"
: > "$LOG_PATH"

"${SERVER_BIN}" --config "$CONFIG_PATH" --backend cuda >>"$LOG_PATH" 2>&1 &
SERVER_PID=$!
cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Attente GET /health (lazy_load — pas de génération)…"
OK=0
for i in $(seq 1 60); do
  if curl -sf --max-time 2 "http://${HOST}:${PORT}/health" >/tmp/songmaker-load-health.json 2>/dev/null; then
    OK=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Le serveur s'est arrêté prématurément. Journal:"
    tail -n 80 "$LOG_PATH" || true
    exit 1
  fi
  sleep 1
done

if [[ "$OK" -ne 1 ]]; then
  echo "Timeout /health. Journal:"
  tail -n 80 "$LOG_PATH" || true
  exit 1
fi

echo "GET /health OK:"
cat /tmp/songmaker-load-health.json
echo

echo "Chargement explicite du modèle yue2 (POST /v1/tasks/load_model si exposé)…"
# audio.cpp variations: try load endpoints; fall back to a no-op note
if curl -sf --max-time 600 -X POST "http://${HOST}:${PORT}/v1/tasks/load_model" \
  -H 'Content-Type: application/json' \
  -d '{"model_id":"yue2"}' >/tmp/songmaker-load-yue2.json 2>/dev/null; then
  echo "load_model yue2:"
  cat /tmp/songmaker-load-yue2.json
  echo
  echo "SUCCÈS: chargement yue2 sur archive cuda12.8-colab"
else
  echo "Endpoint load_model non disponible ou échec."
  echo "Vérifiez le journal pour un chargement lazy réussi au premier appel."
  echo "Journal (fin):"
  tail -n 40 "$LOG_PATH" || true
  if grep -qiE 'cuda error|failed to load|cannot load|out of memory' "$LOG_PATH"; then
    echo
    echo "ÉCHEC: indices d'erreur CUDA/chargement dans le journal."
    echo "Linux CUDA n'est pas livré sur un autre binaire."
    exit 1
  fi
  echo
  echo "PARTIEL: /health OK, load_model non confirmé. Inspectez ${LOG_PATH}."
  exit 3
fi
