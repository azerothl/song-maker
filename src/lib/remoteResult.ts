/** Contract-test fixtures must never become an active musical take. */
export function remoteResultError(bytes: Uint8Array): string | null {
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (result?.schema !== "songmaker.generation.result" || result?.state !== "generated") {
      return "Le worker n’a pas fourni un résultat de génération valide. Vérifiez sa configuration.";
    }
    if (result?.provenance?.provider === "simulate") {
      return "Le worker est en mode démonstration : aucune musique n’a été générée. Configurez son moteur audio ou désactivez le worker distant pour générer sur cet ordinateur.";
    }
    return null;
  } catch {
    return "Le résultat du worker est illisible. Cette prise n’est pas importée.";
  }
}
