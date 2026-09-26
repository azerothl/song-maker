#!/usr/bin/env bash
# Contrôle santé Phase 0 : GPU, VRAM, disque, hashes, GET /health si serveur lancé.
# N'effectue AUCUNE génération audio. Ne prétend PAS que CUDA a réussi sans nvidia-smi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

HOST="$(jq -r '.server.host' "$PINS_FILE")"
PORT="$(jq -r '.server.port' "$PINS_FILE")"
HEALTH_URL="http://${HOST}:${PORT}/health"

echo "=== Song Maker Phase 0 — health-check ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

OVERALL=0

echo "-- Disque --"
df -h "${CACHE_DIR}" 2>/dev/null || df -h "$HOME"
AVAIL_KB="$(df -Pk "${CACHE_DIR}" 2>/dev/null | awk 'NR==2{print $4}')"
# Besoin indicatif : Q8 (~4 Go) + VAE (~0.3) + HTDemucs + binaire Linux (~60 Mo) + marge
NEED_KB=$((8 * 1024 * 1024))
if [[ -n "${AVAIL_KB:-}" && "$AVAIL_KB" -lt "$NEED_KB" ]]; then
  echo "ATTENTION: espace libre < 8 Go (${AVAIL_KB} KiB)"
  OVERALL=1
else
  echo "OK: espace disque suffisant pour un pack Q4/Q8"
fi

echo
echo "-- GPU / CUDA --"
if report_cuda_status; then
  DRIVER_LINE="$(detect_nvidia | head -1)"
  DRIVER_VER="$(echo "$DRIVER_LINE" | awk -F',' '{print $2}' | tr -d ' ')"
  VRAM_MIB="$(echo "$DRIVER_LINE" | awk -F',' '{print $3}' | tr -d ' MiB')"
  echo "Driver: ${DRIVER_VER}"
  echo "VRAM: ${VRAM_MIB} MiB"
  LINUX_MIN="$(jq -r '.drivers.linuxCuda128ColabMin' "$PINS_FILE")"
  if [[ "$(uname -s)" == "Linux" ]]; then
    python3 - "$DRIVER_VER" "$LINUX_MIN" <<'PY'
import sys
def parse(v):
    return tuple(int(x) for x in v.split(".")[:3])
drv, minimum = sys.argv[1], sys.argv[2]
try:
    ok = parse(drv) >= parse(minimum)
except Exception:
    ok = False
print("OK: driver ≥ " + minimum if ok else "ÉCHEC: driver < " + minimum + " (archive cuda12.8-colab)")
sys.exit(0 if ok else 1)
PY
    if [[ $? -ne 0 ]]; then
      OVERALL=1
    fi
  fi
  if [[ -n "${VRAM_MIB:-}" ]]; then
    if [[ "$VRAM_MIB" -ge 12288 ]]; then
      echo "Pack suggéré: Q8 (VRAM ≥ 12 Go)"
    else
      echo "Pack suggéré: Q4 (VRAM < 12 Go)"
    fi
  fi
else
  echo "Message produit:"
  echo "  « Ce build exige NVIDIA CUDA. Driver Windows ≥ 551.61, ou Linux ≥ 570.26 pour l’archive épinglée. »"
  OVERALL=1
fi

echo
echo "-- Hashes (si fichiers présents) --"
if "${SCRIPT_DIR}/verify-hashes.sh" --pack both; then
  echo "Hashes: OK ou partiellement absents (voir ci-dessus)"
else
  echo "Hashes: au moins un fichier présent est invalide, ou modèles manquants"
  OVERALL=1
fi

echo
echo "-- Serveur audio.cpp GET /health --"
if curl -sf --max-time 3 "$HEALTH_URL" >/tmp/songmaker-health.json 2>/dev/null; then
  echo "OK: ${HEALTH_URL}"
  cat /tmp/songmaker-health.json
  echo
else
  echo "Serveur non joignable sur ${HEALTH_URL}"
  echo "  (normal si audiocpp_server n'est pas démarré — pas une génération de test)"
  echo "  Pour démarrer: voir scripts/phase0/README.md"
fi

echo
if [[ "$OVERALL" -eq 0 ]]; then
  echo "Résultat health-check: PRÊT (sous réserve que les modèles/binaires attendus soient présents)"
  exit 0
fi
echo "Résultat health-check: INCOMPLET — GPU CUDA réel ou artefacts manquants"
echo "Phase 0 CUDA non validée sur cette machine tant que nvidia-smi / chargement yue2 n'ont pas réussi."
exit 1
