#!/usr/bin/env bash
# Télécharge et vérifie les archives audio.cpp épinglées (v0.8.1).
# Usage:
#   ./download-binaries.sh              # archive de la plateforme courante (+ runtime Windows)
#   ./download-binaries.sh --all        # toutes les archives épinglées
#   ./download-binaries.sh --linux      # seulement cuda12.8-colab
#   ./download-binaries.sh --windows    # binaire + cudart Windows
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

MODE="platform"
case "${1:-}" in
  --all) MODE="all" ;;
  --linux) MODE="linux" ;;
  --windows) MODE="windows" ;;
  --help|-h)
    sed -n '2,8p' "$0"
    exit 0
    ;;
esac

BASE_URL="$(jq -r '.audioCpp.baseUrl' "$PINS_FILE")"
HOST="$(uname -s)"

want() {
  local platform="$1"
  case "$MODE" in
    all) return 0 ;;
    linux) [[ "$platform" == "linux" ]] ;;
    windows) [[ "$platform" == "windows" ]] ;;
    platform)
      if [[ "$HOST" == "Linux" ]]; then
        [[ "$platform" == "linux" ]]
      else
        [[ "$platform" == "windows" ]]
      fi
      ;;
    *) return 1 ;;
  esac
}

echo "=== Song Maker Phase 0 — téléchargement binaires audio.cpp v0.8.1 ==="
echo "Cache: ${BIN_DIR}"
echo

jq -c '.audioCpp.archives[]' "$PINS_FILE" | while read -r row; do
  platform="$(echo "$row" | jq -r '.platform')"
  if ! want "$platform"; then
    continue
  fi
  name="$(echo "$row" | jq -r '.name')"
  sha="$(echo "$row" | jq -r '.sha256')"
  bytes="$(echo "$row" | jq -r '.bytes')"
  url="${BASE_URL}/${name}"
  dest="${BIN_DIR}/${name}"
  download_if_needed "$url" "$dest" "$sha" "$bytes"
done

echo
echo "Terminé. Vérification:"
"${SCRIPT_DIR}/verify-hashes.sh" --binaries-only
