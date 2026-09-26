#!/usr/bin/env bash
# Télécharge et vérifie les GGUF YuE2 + sidecars + HTDemucs épinglés.
# Usage:
#   ./download-models.sh              # Q8 + VAE + sidecars + HTDemucs
#   ./download-models.sh --q8         # idem (explicite)
#   ./download-models.sh --q4         # Q4 à la place de Q8
#   ./download-models.sh --both-gguf  # Q8 et Q4
#   ./download-models.sh --htdemucs   # seulement HTDemucs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

PACK="q8"
HT_ONLY=0
case "${1:-}" in
  --q8) PACK="q8" ;;
  --q4) PACK="q4" ;;
  --both-gguf) PACK="both" ;;
  --htdemucs) HT_ONLY=1 ;;
  --help|-h)
    sed -n '2,9p' "$0"
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Option inconnue: $1 (voir --help)" >&2
    exit 1
    ;;
esac

echo "=== Song Maker Phase 0 — téléchargement modèles GGUF ==="
echo "YuE2: ${YUE2_DIR}"
echo "HTDemucs: ${HTDEMUCS_DIR}"
echo

if [[ "$HT_ONLY" -eq 0 ]]; then
  YUE2_BASE="$(jq -r '.yue2.baseUrl' "$PINS_FILE")"
  jq -c '.yue2.files[]' "$PINS_FILE" | while read -r row; do
    name="$(echo "$row" | jq -r '.name')"
    remote="$(echo "$row" | jq -r '.remote // .name')"
    sha="$(echo "$row" | jq -r '.sha256')"
    bytes="$(echo "$row" | jq -r '.bytes // empty')"
    sidecar="$(echo "$row" | jq -r '.sidecar // false')"

    if [[ "$name" == "yue2-3b-q8_0.gguf" && "$PACK" == "q4" ]]; then
      continue
    fi
    if [[ "$name" == "yue2-3b-q4_0.gguf" && "$PACK" == "q8" ]]; then
      continue
    fi

    url="${YUE2_BASE}/${remote}"
    # audio.cpp cherche les sidecars sous <model>/sidecars/, pas a cote du GGUF.
    if [[ "$sidecar" == "true" ]]; then
      dest="${YUE2_DIR}/${remote}"
      mkdir -p "$(dirname "$dest")"
      # Migration: anciens telechargements a plat a cote du GGUF.
      if [[ ! -f "$dest" && -f "${YUE2_DIR}/${name}" ]]; then
        mv "${YUE2_DIR}/${name}" "$dest"
      fi
      download_if_needed "$url" "$dest" "" ""
    else
      dest="${YUE2_DIR}/${name}"
      download_if_needed "$url" "$dest" "$sha" "$bytes"
    fi
  done
fi

HT_REMOTE="$(jq -r '.htdemucs.remote // .htdemucs.file' "$PINS_FILE")"
HT_URL="$(jq -r '.htdemucs.baseUrl' "$PINS_FILE")/${HT_REMOTE}"
HT_NAME="$(jq -r '.htdemucs.file' "$PINS_FILE")"
HT_SHA="$(jq -r '.htdemucs.sha256' "$PINS_FILE")"
download_if_needed "$HT_URL" "${HTDEMUCS_DIR}/${HT_NAME}" "$HT_SHA" ""

echo
echo "Terminé. Vérification:"
run_phase0 verify-hashes.sh --models-only --pack "$PACK"
