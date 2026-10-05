/** Keep the remote YuE2 request consistent with the desktop token budget. */
export function generationContract(request: Record<string, unknown>, fallbackLyrics = "") {
  const requested = request.targetDurationSec ?? 180;
  if (typeof requested !== "number" || !Number.isInteger(requested) || requested < 30 || requested > 360) {
    throw new Error("Choisissez une durée entre 30 et 360 secondes.");
  }
  const durationSec = Math.round(requested / 30) * 30;
  const instrumental = request.instrumentalMode === true;
  const lyrics = instrumental ? "" : typeof request.lyrics === "string" ? request.lyrics : fallbackLyrics;
  const fixedDuration = instrumental || request.preferFullLyrics === false;
  const minimum = durationSec * 25;
  const words = lyrics.split(/\r?\n/).filter(line => !line.trim().startsWith("["))
    .join(" ").trim().split(/\s+/).filter(Boolean).length;
  const maximumSec = Math.ceil(Math.min(900, Math.max(words + 30, durationSec + Math.max(durationSec / 4, 30))) / 30) * 30;
  return { lyrics, durationSec, fixedDuration, minimum, maximum: fixedDuration ? minimum : maximumSec * 25 };
}

export function wavMetadata(wav: Buffer) {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Le moteur distant n’a pas fourni un fichier WAV valide.");
  }
  const end = wav.readUInt32LE(4) + 8;
  if (end > wav.length || end < 12) throw new Error("Fichier WAV distant incomplet.");
  let sampleRate = 0, channels = 0, blockAlign = 0, dataBytes = 0;
  for (let offset = 12; offset + 8 <= end;) {
    const name = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > end) throw new Error("Fichier WAV distant incomplet.");
    if (name === "fmt ") {
      if (size < 16 || ![1, 3, 65534].includes(wav.readUInt16LE(start))) throw new Error("Format WAV distant non pris en charge.");
      channels = wav.readUInt16LE(start + 2);
      sampleRate = wav.readUInt32LE(start + 4);
      blockAlign = wav.readUInt16LE(start + 12);
    } else if (name === "data") dataBytes += size;
    offset = start + size + (size % 2);
  }
  if (!sampleRate || !channels || !blockAlign || !dataBytes || dataBytes % blockAlign) {
    throw new Error("Données audio du WAV distant invalides.");
  }
  return { sampleRate, channels, durationMs: Math.round(dataBytes / blockAlign / sampleRate * 1000) };
}

/** Resample / HTDemucs alignment only — not a YuE2 wall-clock contract. */
export function checkRemoteDuration(actualMs: number, expectedMs: number) {
  if (actualMs <= 0 || Math.abs(actualMs - expectedMs) > 250) {
    throw new Error(
      `Le retrait des voix a changé la durée (${Math.round(actualMs / 1000)} s au lieu de ${expectedMs / 1000} s). L’original est conservé.`,
    );
  }
  return { expectedMs, actualMs, toleranceMs: 250, matches: true };
}
