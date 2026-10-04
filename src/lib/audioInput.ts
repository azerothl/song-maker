/** Honest audio_input / inpainting capability for pinned engines (#324). */
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
      "YuE2 et ACE-Step épinglés ne consomment pas audio_input : pas de référence waveform, pas d’inpainting d’une phrase. Une génération = un nouvel appel. La reprise SheetSage2 (audio → ABC) n’est pas une entrée audio au décodeur.",
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
