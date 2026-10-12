#!/usr/bin/env bash
# Install the pinned audio.cpp runtime and YuE2/HTDemucs models for macOS/Linux.
set -euo pipefail

TAG="v0.9.1"
RELEASE="https://github.com/0xShug0/audio.cpp/releases/download/${TAG}"
YUE2="https://huggingface.co/audio-cpp/Yue2-3B-GGUF/resolve/eb116220931de5f373d024d48800338178c7de51"
HTDEMUCS="https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main"
PACK="${1:-q4}"
if [[ "$PACK" != "q4" && "$PACK" != "q8" ]]; then
  echo "Usage: $0 [q4|q8] (default: q4)" >&2
  exit 2
fi

case "$(uname -s)" in
  Darwin)
    ARCH="$(uname -m)"
    if [[ "$ARCH" == "arm64" ]]; then
      PLATFORM="macos-arm64-metal"
      ARCHIVE="audio-v0.9.1-bin-macos-arm64-metal.tar.gz"
      ARCHIVE_SHA="960436787b84bf137a70ea1713ac460207ef2ac7b2617380fb7a1f4650d1100d"
    elif [[ "$ARCH" == "x86_64" ]]; then
      PLATFORM="macos-x64-metal"
      ARCHIVE="audio-v0.9.1-bin-macos-x64-metal.tar.gz"
      ARCHIVE_SHA="e8987115a6150330c4a3ba6a00494b0a1f28db8c5553d1f457ba2279a15f9ff1"
    else
      echo "Architecture macOS non prise en charge : $ARCH" >&2; exit 1
    fi
    CACHE="${SONG_MAKER_CACHE:-${HOME}/Library/Caches/song-maker}"
    ;;
  Linux)
    PLATFORM="linux-cuda12.8-colab"
    ARCHIVE="audio-v0.9.1-bin-ubuntu-x64-cuda12.8-colab.tar.gz"
    ARCHIVE_SHA="de068e8a22eb8f9c229c8ecaf77e12b6340be4d7d91606604fae7ccc48c174b6"
    CACHE="${SONG_MAKER_CACHE:-${HOME}/.cache/song-maker}"
    if [[ "$(uname -m)" != "x86_64" ]]; then
      echo "La release Linux demande actuellement un PC x86_64." >&2; exit 1
    fi
    ;;
  *) echo "Ce script fonctionne sur macOS et Linux." >&2; exit 1 ;;
esac

if [[ "$PLATFORM" == linux-* ]]; then
  echo "Linux utilise NVIDIA CUDA. Vérifiez le pilote NVIDIA 570.26 ou supérieur."
fi
echo "Les modèles YuE2 sont publiés sous CC BY-NC 4.0, avec restriction d’usage commercial."
if ! read -r -p "Acceptez-vous cette licence pour télécharger les modèles ? [y/N] " LICENSE_OK < /dev/tty; then
  echo "Impossible de lire la confirmation dans ce terminal." >&2
  exit 1
fi
if [[ ! "$LICENSE_OK" =~ ^[Yy]$ ]]; then echo "Téléchargement annulé."; exit 1; fi

BIN_DIR="${CACHE}/binaries/${TAG}"
MODEL_DIR="${CACHE}/models/Yue2-3B-GGUF"
HT_DIR="${CACHE}/models/htdemucs"
mkdir -p "$BIN_DIR/$PLATFORM" "$MODEL_DIR/sidecars" "$HT_DIR"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
download() {
  local url="$1" dest="$2" expected="${3:-}"
  mkdir -p "$(dirname "$dest")"
  echo "Téléchargement : $(basename "$dest")"
  curl --fail --location --retry 3 --continue-at - "$url" --output "$dest"
  if [[ -n "$expected" ]]; then
    local actual
    actual="$(sha256 "$dest")"
    if [[ "$actual" != "$expected" ]]; then
      rm -f "$dest"
      echo "SHA-256 incorrect pour $(basename "$dest"). Relancez le script." >&2
      exit 1
    fi
  fi
}

ARCHIVE_PATH="${BIN_DIR}/${ARCHIVE}"
download "${RELEASE}/${ARCHIVE}" "$ARCHIVE_PATH" "$ARCHIVE_SHA"
tar -xzf "$ARCHIVE_PATH" -C "${BIN_DIR}/${PLATFORM}"
SERVER="$(find "${BIN_DIR}/${PLATFORM}" -type f -name audiocpp_server -print -quit)"
if [[ -z "$SERVER" ]]; then echo "audiocpp_server absent de l’archive." >&2; exit 1; fi
chmod +x "$SERVER"

if [[ "$PACK" == q4 ]]; then
  YUE2_FILE="yue2-3b-q4_0.gguf"
  YUE2_SHA="97af67d7f800b362faee6e6bec806bddfcccb93f25fd3f9a1012724d95af6f4a"
else
  YUE2_FILE="yue2-3b-q8_0.gguf"
  YUE2_SHA="f3a9e3b197bfd05aa4ae6ab2d4b93f6d57c8cc0ea39a4af7d151f58697c7cfb6"
fi
download "${YUE2}/${YUE2_FILE}" "${MODEL_DIR}/${YUE2_FILE}" "$YUE2_SHA"
download "${YUE2}/yue2-vae-f16.gguf" "${MODEL_DIR}/yue2-vae-f16.gguf" "d4f4a05d8f291ae820cd1e43609da3fa91b56465810091a2b08c3350b751719d"

for sidecar in yue2-model-config.json yue2-generation-config.json yue2-qwen.tiktoken yue2-vae-config.json; do
  download "${YUE2}/sidecars/${sidecar}" "${MODEL_DIR}/sidecars/${sidecar}"
done

download "${HTDEMUCS}/HTDemucs-GGUF/htdemucs-q8_0.gguf" \
  "${HT_DIR}/htdemucs-q8_0.gguf" \
  "b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388"
echo
echo "Configuration terminée. Vous pouvez ouvrir Song Maker."
