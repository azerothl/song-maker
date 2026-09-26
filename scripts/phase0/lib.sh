#!/usr/bin/env bash
# Shared helpers for Phase 0 scripts. No CUDA claimed without evidence.
set -euo pipefail

PHASE0_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PINS_FILE="${PHASE0_DIR}/pins.json"
ROOT_DIR="$(cd "${PHASE0_DIR}/../.." && pwd)"

default_cache_dir() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "${HOME}/Library/Caches/SongMaker"
  else
    echo "${HOME}/.cache/song-maker"
  fi
}

CACHE_DIR="${SONG_MAKER_CACHE:-$(default_cache_dir)}"
BIN_DIR="${CACHE_DIR}/binaries/v0.8.1"
MODELS_DIR="${CACHE_DIR}/models"
YUE2_DIR="${MODELS_DIR}/Yue2-3B-GGUF"
HTDEMUCS_DIR="${MODELS_DIR}/htdemucs"

need_cmd() {
  local c="$1"
  if ! command -v "$c" >/dev/null 2>&1; then
    echo "ERREUR: commande requise absente: $c" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd sha256sum
need_cmd jq
need_cmd python3

mkdir -p "${BIN_DIR}" "${YUE2_DIR}" "${HTDEMUCS_DIR}"

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
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
    size="$(wc -c < "$tmp" | tr -d ' ')"
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
