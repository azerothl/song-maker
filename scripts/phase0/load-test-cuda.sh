#!/usr/bin/env bash
# Load test CUDA Phase 0 : archive épinglée de la plateforme + lazy load yue2.
# Ne lance PAS de génération. Ne ment PAS si le matériel CUDA est absent.
#
# Prérequis:
#   Linux:  driver ≥ 570.26, ./download-binaries.sh --linux
#   Windows: driver ≥ 551.61, ./download-binaries.sh --windows (+ cudart)
#   Modèles: ./download-models.sh --q4   # ou pack Q8 si VRAM ≥ 12 Go
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

CONFIG_PATH="${BIN_DIR}/audiocpp-server.phase0.json"
LOG_PATH="${BIN_DIR}/load-test-cuda.log"

# Convertit un chemin bash → chemin natif pour audiocpp_server(.exe) sous Windows.
native_path() {
  local p="$1"
  if [[ "$HOST_OS" == "windows" ]] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  else
    echo "$p"
  fi
}

case "$HOST_OS" in
  linux)
    ARCHIVE_ID="linux-cuda12.8-colab"
    ARCHIVE_NAME="audio-v0.8.2-bin-ubuntu-x64-cuda12.8-colab.tar.gz"
    EXTRACT_DIR="${BIN_DIR}/linux-cuda12.8-colab"
    SERVER_NAMES=("audiocpp_server")
    DOWNLOAD_HINT="--linux"
    DRIVER_MIN="$(jq -r '.drivers.linuxCuda128ColabMin' "$PINS_FILE")"
    LABEL="Ubuntu cuda12.8-colab"
    ;;
  windows)
    ARCHIVE_ID="windows-cuda12.4"
    ARCHIVE_NAME="audio-v0.8.2-bin-windows-x64-cuda12.4.zip"
    CUDART_NAME="audio-v0.8.2-cudart-windows-x64-cuda12.4.zip"
    EXTRACT_DIR="${BIN_DIR}/windows-cuda12.4"
    SERVER_NAMES=("audiocpp_server.exe" "audiocpp_server")
    DOWNLOAD_HINT="--windows"
    DRIVER_MIN="$(jq -r '.drivers.windowsMin' "$PINS_FILE")"
    LABEL="Windows cuda12.4"
    ;;
  *)
    echo "Plateforme non supportée pour le load test CUDA: ${HOST_OS}"
    echo "Supporté: linux, windows."
    exit 1
    ;;
esac

ARCHIVE_PATH="${BIN_DIR}/${ARCHIVE_NAME}"

echo "=== Song Maker Phase 0 — load test CUDA (${LABEL}) ==="
echo "OS: ${HOST_OS}  Cache: ${CACHE_DIR}"
echo

if ! report_cuda_status; then
  cat <<EOF

ÉCHEC ATTENDU SANS GPU
----------------------
Aucun GPU NVIDIA détecté (nvidia-smi absent ou vide).
Le load test CUDA n'a PAS réussi et ne doit PAS être marqué comme validé.

Procédure manuelle sur une machine équipée :
  1. Installer un driver NVIDIA ≥ ${DRIVER_MIN}
  2. cd scripts/phase0 && ./download-binaries.sh ${DOWNLOAD_HINT}
  3. ./download-models.sh --q4   # ou --both-gguf / --q8
  4. ./load-test-cuda.sh
  5. Vérifier dans le journal que le modèle yue2 charge sans erreur
  6. curl -s http://127.0.0.1:${PORT}/health
EOF
  exit 2
fi

# Contrôle version driver (indicatif ; ne bloque pas si le parse échoue).
DRIVER_LINE="$(detect_nvidia | head -1)"
DRIVER_VER="$(echo "$DRIVER_LINE" | awk -F',' '{print $2}' | tr -d ' ')"
if [[ -n "$DRIVER_VER" && -n "$DRIVER_MIN" ]]; then
  set +e
  "$PYTHON_BIN" - "$DRIVER_VER" "$DRIVER_MIN" <<'PY'
import sys
def parse(v):
    return tuple(int(x) for x in v.replace("+", "").split(".")[:3])
drv, minimum = sys.argv[1], sys.argv[2]
try:
    ok = parse(drv) >= parse(minimum)
except Exception:
    ok = True
sys.stdout.reconfigure(encoding="utf-8", errors="replace") if hasattr(sys.stdout, "reconfigure") else None
print(("OK: driver >= " + minimum) if ok else ("FAIL: driver < " + minimum))
sys.exit(0 if ok else 1)
PY
  drv_rc=$?
  set -e
  if [[ "$drv_rc" -ne 0 ]]; then
    echo "Driver trop ancien pour ${LABEL}. Minimum: ${DRIVER_MIN} (detecte: ${DRIVER_VER})"
    exit 1
  fi
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive absente: ${ARCHIVE_PATH}"
  echo "Lancez: ${SCRIPT_DIR}/download-binaries.sh ${DOWNLOAD_HINT}"
  exit 1
fi

verify_file "$ARCHIVE_PATH" \
  "$(jq -r --arg id "$ARCHIVE_ID" '.audioCpp.archives[] | select(.id==$id) | .sha256' "$PINS_FILE")" \
  "$ARCHIVE_NAME"

find_server_bin() {
  local name
  for name in "${SERVER_NAMES[@]}"; do
    local found
    found="$(find "$EXTRACT_DIR" -type f -name "$name" 2>/dev/null | head -1)"
    if [[ -n "$found" ]]; then
      echo "$found"
      return 0
    fi
  done
  return 1
}

mkdir -p "$EXTRACT_DIR"
SERVER_BIN="$(find_server_bin || true)"
if [[ -z "${SERVER_BIN:-}" ]]; then
  echo "Extraction de ${ARCHIVE_NAME}…"
  case "$HOST_OS" in
    linux)
      tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"
      ;;
    windows)
      need_cmd unzip
      unzip -qo "$ARCHIVE_PATH" -d "$EXTRACT_DIR"
      CUDART_PATH="${BIN_DIR}/${CUDART_NAME}"
      if [[ ! -f "$CUDART_PATH" ]]; then
        echo "Runtime CUDA absent: ${CUDART_PATH}"
        echo "Lancez: ${SCRIPT_DIR}/download-binaries.sh --windows"
        exit 1
      fi
      verify_file "$CUDART_PATH" \
        "$(jq -r '.audioCpp.archives[] | select(.id=="windows-cudart-12.4") | .sha256' "$PINS_FILE")" \
        "$CUDART_NAME"
      echo "Extraction de ${CUDART_NAME} (DLL à côté du binaire)…"
      unzip -qo "$CUDART_PATH" -d "$EXTRACT_DIR"
      ;;
  esac
  SERVER_BIN="$(find_server_bin || true)"
fi

if [[ -z "${SERVER_BIN:-}" ]]; then
  echo "audiocpp_server introuvable dans ${EXTRACT_DIR}" >&2
  find "$EXTRACT_DIR" -maxdepth 3 -type f | head -40 >&2
  exit 1
fi
chmod +x "$SERVER_BIN" || true

# Sous Windows, s'assurer que cudart est bien à côté du .exe (re-extrait si manquant).
if [[ "$HOST_OS" == "windows" ]]; then
  SERVER_DIR="$(dirname "$SERVER_BIN")"
  if [[ ! -f "${SERVER_DIR}/cudart64_12.dll" ]]; then
    CUDART_PATH="${BIN_DIR}/${CUDART_NAME}"
    if [[ ! -f "$CUDART_PATH" ]]; then
      echo "Runtime CUDA absent: ${CUDART_PATH}"
      echo "Lancez: ${SCRIPT_DIR}/download-binaries.sh --windows"
      exit 1
    fi
    echo "Extraction de ${CUDART_NAME} dans ${SERVER_DIR}…"
    unzip -qo "$CUDART_PATH" -d "$SERVER_DIR"
  fi
fi

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

YUE2_NATIVE="$(native_path "$YUE2_PATH")"
HT_NATIVE="$(native_path "$HT_PATH")"
CONFIG_NATIVE="$(native_path "$CONFIG_PATH")"

"$PYTHON_BIN" - "$CONFIG_PATH" "$HOST" "$PORT" "$YUE2_NATIVE" "$HT_NATIVE" <<'PY'
import json, sys
path, host, port, yue2, htd = sys.argv[1:6]
# lazy_load=false: charge yue2 au demarrage (load_model API souvent absente /
# "dynamic model management is disabled" sur les builds audicpp epingles).
cfg = {
  "host": host,
  "port": int(port),
  "backend": "cuda",
  "device": 0,
  "lazy_load": False,
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
print("Config ecrite:", path)
print("  yue2:", yue2)
print("  htdemucs:", htd)
PY

echo "Démarrage: ${SERVER_BIN} --config ${CONFIG_NATIVE} --backend cuda"
echo "Journal: ${LOG_PATH}"
: > "$LOG_PATH"

# Lancer depuis le dossier du binaire pour que les DLL Windows (cudart, ggml) se résolvent.
SERVER_DIR="$(dirname "$SERVER_BIN")"
SERVER_BASE="$(basename "$SERVER_BIN")"
(
  cd "$SERVER_DIR"
  # exec: le PID du job = le serveur (nécessaire pour kill / taskkill sous Git Bash).
  exec "./${SERVER_BASE}" --config "$CONFIG_NATIVE" --backend cuda >>"$LOG_PATH" 2>&1
) &
SERVER_PID=$!
cleanup() {
  if [[ "$HOST_OS" == "windows" ]]; then
    # Git Bash PID != PID Windows du .exe : tuer par nom d'image.
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //IM audiocpp_server.exe //T >/dev/null 2>&1 || true
    fi
    kill -9 "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    return 0
  fi
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

LOAD_HEALTH_JSON="${PHASE0_TMP}/songmaker-load-health.json"

echo "Attente GET /health (chargement CUDA yue2 au demarrage, pas de generation)…"
OK=0
for i in $(seq 1 180); do
  if curl -sf --max-time 2 "http://${HOST}:${PORT}/health" >"$LOAD_HEALTH_JSON" 2>/dev/null; then
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
cat "$LOAD_HEALTH_JSON"
echo

MODELS_JSON="${PHASE0_TMP}/songmaker-models.json"
echo "Verification GET /v1/models (yue2 enregistre, chargement CUDA)…"
LOADED=0
for i in $(seq 1 180); do
  if curl -sf --max-time 5 "http://${HOST}:${PORT}/v1/models" >"$MODELS_JSON" 2>/dev/null; then
    if "$PYTHON_BIN" - "$MODELS_JSON" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
models = data.get("data") or data.get("models") or []
yue2 = next((m for m in models if m.get("id") == "yue2" or m.get("family") == "yue2"), None)
if not yue2:
    print("yue2 absent de /v1/models")
    sys.exit(2)
loaded = bool(yue2.get("loaded"))
print("yue2 path:", yue2.get("path"))
print("yue2 loaded:", loaded)
sys.exit(0 if loaded else 1)
PY
    then
      LOADED=1
      break
    fi
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Le serveur s'est arrêté pendant le chargement. Journal:"
    tail -n 80 "$LOG_PATH" || true
    exit 1
  fi
  if grep -qiE 'cuda error|failed to load|cannot load|out of memory' "$LOG_PATH" 2>/dev/null; then
    echo "ÉCHEC: indices d'erreur CUDA/chargement dans le journal."
    tail -n 80 "$LOG_PATH" || true
    exit 1
  fi
  sleep 2
done

if [[ "$LOADED" -eq 1 ]]; then
  echo "SUCCES: yue2 charge sur archive ${LABEL} (CUDA, sans generation)"
  cat "$MODELS_JSON"
  echo
  exit 0
fi

echo "Endpoint load_model non utilise (souvent desactive)."
echo "yue2 n'est pas passe a loaded=true dans le delai. Journal (fin):"
tail -n 60 "$LOG_PATH" || true
if grep -qiE 'cuda error|failed to load|cannot load|out of memory' "$LOG_PATH"; then
  echo
  echo "ÉCHEC: indices d'erreur CUDA/chargement dans le journal."
  exit 1
fi
echo
echo "PARTIEL: /health OK, chargement yue2 non confirme. Inspectez ${LOG_PATH}."
exit 3
