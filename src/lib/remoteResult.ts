export type ParsedRemoteGenerationResult = {
  audioSha256: string;
  scoreSha256: string | null;
};

export type RemoteGenerationResultCheck =
  | { ok: true; value: ParsedRemoteGenerationResult }
  | { ok: false; error: string };

const invalidResult =
  "Le worker n’a pas fourni un résultat de génération complet. Vérifiez sa configuration.";

/** Contract-test fixtures must never become an active musical take. */
export function parseRemoteGenerationResult(
  bytes: Uint8Array,
): RemoteGenerationResultCheck {
  let result: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: invalidResult };
    }
    result = parsed as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: "Le résultat du worker est illisible. Cette prise n’est pas importée.",
    };
  }

  if (
    result.schema !== "songmaker.generation.result" ||
    result.schemaVersion !== 1 ||
    result.state !== "generated"
  ) {
    return { ok: false, error: invalidResult };
  }

  const provenance = result.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return { ok: false, error: invalidResult };
  }
  const provider = (provenance as Record<string, unknown>).provider;
  if (provider === "simulate") {
    return {
      ok: false,
      error:
        "Le worker est en mode démonstration : aucune musique n’a été générée. Configurez son moteur audio ou désactivez le worker distant pour générer sur cet ordinateur.",
    };
  }
  if (typeof provider !== "string" || !provider.trim()) {
    return { ok: false, error: invalidResult };
  }

  const audio = result.audio;
  if (!audio || typeof audio !== "object" || Array.isArray(audio)) {
    return { ok: false, error: invalidResult };
  }
  const manifest = audio as Record<string, unknown>;
  if (
    manifest.path !== "audio.wav" ||
    typeof manifest.durationMs !== "number" ||
    !Number.isFinite(manifest.durationMs) ||
    manifest.durationMs <= 0 ||
    !Number.isInteger(manifest.sampleRate) ||
    (manifest.sampleRate as number) <= 0 ||
    !Number.isInteger(manifest.channels) ||
    (manifest.channels as number) <= 0 ||
    typeof manifest.sha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(manifest.sha256)
  ) {
    return { ok: false, error: invalidResult };
  }

  let scoreSha256: string | null = null;
  if (result.score !== null) {
    if (!result.score || typeof result.score !== "object" || Array.isArray(result.score)) {
      return { ok: false, error: invalidResult };
    }
    const score = result.score as Record<string, unknown>;
    if (
      score.path !== "score.abc" ||
      typeof score.sha256 !== "string" ||
      !/^[a-f\d]{64}$/i.test(score.sha256)
    ) {
      return { ok: false, error: invalidResult };
    }
    scoreSha256 = score.sha256.toLowerCase();
  }

  return {
    ok: true,
    value: { audioSha256: manifest.sha256.toLowerCase(), scoreSha256 },
  };
}

export function isSha256(value: string): boolean {
  return /^[a-f\d]{64}$/i.test(value);
}
