/** User-facing limits for using imported audio during generation (#324). */
export type AudioInputCapability = {
  supported: boolean;
  engine: string;
  messageFr: string;
};

export function audioInputCapability(
  engine: string | null | undefined,
): AudioInputCapability {
  const id = (engine ?? "yue2").trim() || "yue2";
  return {
    supported: false,
    engine: id,
    messageFr:
      "Vous ne pouvez pas encore modifier une seule partie d’un morceau importé. Pour analyser l’audio et créer une nouvelle version, ouvrez Partition, puis Reprise.",
  };
}

export function wantsAudioInput(form: {
  audioInputPath?: string | null;
  inpaintStartMs?: number | null;
  inpaintEndMs?: number | null;
}): boolean {
  const path = form.audioInputPath?.trim();
  return Boolean(path) || form.inpaintStartMs != null || form.inpaintEndMs != null;
}
