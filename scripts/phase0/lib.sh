#!/usr/bin/env bash
# Shared helpers for Phase 0 scripts. No CUDA claimed without evidence.
# Portable under Linux, macOS, and Git Bash on Windows (prefer .cmd wrappers).
set -euo pipefail

PHASE0_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PINS_FILE="${PHASE0_DIR}/pins.json"
ROOT_DIR="$(cd "${PHASE0_DIR}/../.." && pwd)"

host_os() {
  local s
  s="$(uname -s 2>/dev/null || echo unknown)"
  case "$s" in
    Linux*) echo linux ;;
    Darwin*) echo darwin ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT*) echo windows ;;
    *) echo "$s" ;;
  esac
}

HOST_OS="$(host_os)"

default_cache_dir() {
  case "$HOST_OS" in
    darwin)
      echo "${HOME}/Library/Caches/song-maker"
      ;;
    windows)
      # Align with dirs::cache_dir() + "song-maker" in the Tauri app.
      local base="${LOCALAPPDATA:-}"
      if [[ -z "$base" && -n "${USERPROFILE:-}" ]]; then
        base="${USERPROFILE}/AppData/Local"
      fi
      if [[ -z "$base" ]]; then
        base="${HOME}/AppData/Local"
      fi
      # Git Bash may expose a Windows path; normalize to a bash path when possible.
      if command -v cygpath >/dev/null 2>&1; then
        base="$(cygpath -u "$base")"
      else
        base="${base//\\//}"
      fi
      echo "${base}/song-maker"
      ;;
    *)
      echo "${HOME}/.cache/song-maker"
      ;;
  esac
}

CACHE_DIR="${SONG_MAKER_CACHE:-$(default_cache_dir)}"
BIN_DIR="${CACHE_DIR}/binaries/v0.8.2"
MODELS_DIR="${CACHE_DIR}/models"
YUE2_DIR="${MODELS_DIR}/Yue2-3B-GGUF"
HTDEMUCS_DIR="${MODELS_DIR}/htdemucs"

# One-time hint if Windows users still have artefacts under the old Linux-style cache.
if [[ "$HOST_OS" == "windows" && -z "${SONG_MAKER_CACHE:-}" ]]; then
  _legacy_cache="${HOME}/.cache/song-maker"
  if [[ -d "$_legacy_cache" && "$_legacy_cache" != "$CACHE_DIR" ]]; then
    if [[ ! -d "${CACHE_DIR}/binaries" && ! -d "${CACHE_DIR}/models" ]]; then
      if command -v cygpath >/dev/null 2>&1; then
        _legacy_win="$(cygpath -w "$_legacy_cache" 2>/dev/null || echo "$_legacy_cache")"
        _cache_win="$(cygpath -w "$CACHE_DIR" 2>/dev/null || echo "$CACHE_DIR")"
      else
        _legacy_win="$_legacy_cache"
        _cache_win="$CACHE_DIR"
      fi
      echo "INFO: ancien cache détecté: ${_legacy_win}" >&2
      echo "      Cache Windows aligné sur l'app: ${_cache_win}" >&2
      echo "      Déplacez ou recopiez binaries/ et models/, ou: set SONG_MAKER_CACHE=${_legacy_win}" >&2
    fi
  fi
fi

# Prefer OS temp; avoid hardcoded /tmp (missing or awkward on some Windows setups).
PHASE0_TMP="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
if command -v cygpath >/dev/null 2>&1; then
  case "$PHASE0_TMP" in
    [A-Za-z]:*|[\\/][\\/]*) PHASE0_TMP="$(cygpath -u "$PHASE0_TMP")" ;;
  esac
fi
mkdir -p "$PHASE0_TMP"

need_cmd() {
  local c="$1"
  if ! command -v "$c" >/dev/null 2>&1; then
    echo "ERREUR: commande requise absente: $c" >&2
    exit 1
  fi
}

# Windows often ships `python` but not `python3`.
resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    # Windows Store stub can exist without a real interpreter.
    if python3 -c "import sys" >/dev/null 2>&1; then
      echo python3
      return 0
    fi
  fi
  if command -v python >/dev/null 2>&1; then
    if python -c "import sys" >/dev/null 2>&1; then
      echo python
      return 0
    fi
  fi
  echo "ERREUR: Python requis (python3 ou python)" >&2
  exit 1
}

PYTHON_BIN="$(resolve_python)"

# sha256sum is standard on Linux/Git Bash; fall back to shasum (macOS) or openssl.
sha256_file() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$f" | awk '{print $NF}'
  else
    echo "ERREUR: aucune commande SHA-256 (sha256sum / shasum / openssl)" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd jq
if ! command -v sha256sum >/dev/null 2>&1 \
  && ! command -v shasum >/dev/null 2>&1 \
  && ! command -v openssl >/dev/null 2>&1; then
  echo "ERREUR: aucune commande SHA-256 (sha256sum / shasum / openssl)" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}" "${YUE2_DIR}" "${HTDEMUCS_DIR}"

run_phase0() {
  # Invoke sibling scripts via bash so execute bits / PATHEXT are not required.
  local script="$1"
  shift
  bash "${PHASE0_DIR}/${script}" "$@"
}

verify_file() {
  local path="$1"
  local expected="$2"
  local label="${3:-$path}"

  if [[ ! -f "$path" ]]; then
    echo "MANQUANT: ${label}" >&2
    return 1
  fi
  if [[ -z "$expected" || "$expected" == "null" ]]; then
    echo "OK (pas de hash épinglé): ${label}"
    return 0
  fi
  local got
  got="$(sha256_file "$path")"
  if [[ "$got" != "$expected" ]]; then
    echo "HASH INVALIDE: ${label}" >&2
    echo "  attendu: ${expected}" >&2
    echo "  obtenu:  ${got}" >&2
    echo "  chemin:  ${path}" >&2
    return 1
  fi
  echo "OK: ${label}"
  return 0
}

download_if_needed() {
  local url="$1"
  local dest="$2"
  local expected_sha="${3:-}"
  local expected_bytes="${4:-}"

  if [[ -f "$dest" && -n "$expected_sha" && "$expected_sha" != "null" ]]; then
    local got
    got="$(sha256_file "$dest")"
    if [[ "$got" == "$expected_sha" ]]; then
      echo "Déjà présent et vérifié: $(basename "$dest")"
      return 0
    fi
    echo "Fichier présent mais hash incorrect, retéléchargement: $(basename "$dest")"
    rm -f "$dest"
  fi

  echo "Téléchargement: $(basename "$dest")"
  echo "  → ${url}"
  mkdir -p "$(dirname "$dest")"
  local tmp="${dest}.partial"
  curl -fL --retry 3 --retry-delay 4 -o "$tmp" "$url"
  if [[ -n "$expected_bytes" && "$expected_bytes" != "null" ]]; then
    local size
    size="$(wc -c < "$tmp" | tr -d '[:space:]')"
    if [[ "$size" != "$expected_bytes" ]]; then
      echo "TAILLE INVALIDE: attendu ${expected_bytes}, obtenu ${size}" >&2
      rm -f "$tmp"
      return 1
    fi
  fi
  if [[ -n "$expected_sha" && "$expected_sha" != "null" ]]; then
    verify_file "$tmp" "$expected_sha" "$(basename "$dest")" || {
      rm -f "$tmp"
      return 1
    }
  fi
  mv "$tmp" "$dest"
}

detect_nvidia() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null || true
  else
    echo ""
  fi
}

cuda_available() {
  [[ -n "$(detect_nvidia)" ]]
}

report_cuda_status() {
  local info
  info="$(detect_nvidia)"
  if [[ -z "$info" ]]; then
    cat <<EOF
CUDA: NON DISPONIBLE sur cette machine
  - nvidia-smi absent ou sans GPU
  - Aucun test de chargement yue2 n'a réussi ici
  - Ne pas prétendre que la phase 0 CUDA est validée sans matériel NVIDIA
EOF
    return 1
  fi
  echo "CUDA: GPU détecté"
  echo "  ${info}"
  return 0
}
