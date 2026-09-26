#!/usr/bin/env bash
# Vérifie les SHA-256 épinglés des archives et GGUF déjà présents en cache.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

CHECK_BINARIES=1
CHECK_MODELS=1
PACK="both"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --binaries-only) CHECK_MODELS=0; shift ;;
    --models-only) CHECK_BINARIES=0; shift ;;
    --pack) PACK="$2"; shift 2 ;;
    *) echo "Option inconnue: $1" >&2; exit 1 ;;
  esac
done

FAIL=0

echo "=== Vérification des hashes Song Maker (v0.8.1) ==="

if [[ "$CHECK_BINARIES" -eq 1 ]]; then
  echo
  echo "-- Binaires audio.cpp --"
  jq -c '.audioCpp.archives[]' "$PINS_FILE" | while read -r row; do
    name="$(echo "$row" | jq -r '.name')"
    sha="$(echo "$row" | jq -r '.sha256')"
    path="${BIN_DIR}/${name}"
    if [[ -f "$path" ]]; then
      verify_file "$path" "$sha" "$name" || FAIL=1
    else
      echo "ABSENT (non bloquant pour --models-only): ${name}"
    fi
  done
fi

if [[ "$CHECK_MODELS" -eq 1 ]]; then
  echo
  echo "-- YuE2 GGUF + sidecars --"
  jq -c '.yue2.files[]' "$PINS_FILE" | while read -r row; do
    name="$(echo "$row" | jq -r '.name')"
    sha="$(echo "$row" | jq -r '.sha256')"
    sidecar="$(echo "$row" | jq -r '.sidecar // false')"
    if [[ "$name" == "yue2-3b-q8_0.gguf" && "$PACK" == "q4" ]]; then
      continue
    fi
    if [[ "$name" == "yue2-3b-q4_0.gguf" && "$PACK" == "q8" ]]; then
      continue
    fi
    path="${YUE2_DIR}/${name}"
    if [[ ! -f "$path" ]]; then
      echo "MANQUANT: ${name}" >&2
      FAIL=1
      continue
    fi
    if [[ "$sidecar" == "true" ]]; then
      echo "OK (sidecar présent): ${name}"
    else
      verify_file "$path" "$sha" "$name" || FAIL=1
    fi
  done

  echo
  echo "-- HTDemucs --"
  HT_NAME="$(jq -r '.htdemucs.file' "$PINS_FILE")"
  HT_SHA="$(jq -r '.htdemucs.sha256' "$PINS_FILE")"
  if [[ -f "${HTDEMUCS_DIR}/${HT_NAME}" ]]; then
    verify_file "${HTDEMUCS_DIR}/${HT_NAME}" "$HT_SHA" "$HT_NAME" || FAIL=1
  else
    echo "MANQUANT: ${HT_NAME}" >&2
    FAIL=1
  fi
fi

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "Résultat: ÉCHEC"
  exit 1
fi
echo "Résultat: OK (fichiers présents vérifiés)"
