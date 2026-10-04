export type InstrumentalRole = "bass" | "drums" | "other";
export type InstrumentalConditioning = "project_metadata" | "mix_stems";

export type ProjectInstrumentalPlan =
  | {
      ok: true;
      role: InstrumentalRole;
      displayName: string;
      styleSent: string;
      instrumentalMode: true;
      conditioning: "project_metadata";
    }
  | {
      ok: false;
      role: InstrumentalRole;
      conditioning: InstrumentalConditioning;
      messageFr: string;
    };

const ROLE_FR: Record<InstrumentalRole, string> = {
  bass: "Basse",
  drums: "Batterie",
  other: "Accompagnement",
};

const ROLE_STYLE: Record<InstrumentalRole, string> = {
  bass: "bass guitar part, groovy low end, no lead vocal",
  drums: "drum kit part, kick snare hats, no lead vocal",
  other: "instrumental accompaniment pads and keys, no lead vocal",
};

export function planProjectInstrumentalPart(input: {
  role: InstrumentalRole;
  conditioning: InstrumentalConditioning;
  style: string;
  tempoBpm?: number | null;
  key?: { tonic: string; mode: string } | null;
  hasMixOrStems: boolean;
}): ProjectInstrumentalPlan {
  if (input.conditioning === "mix_stems") {
    return {
      ok: false,
      role: input.role,
      conditioning: "mix_stems",
      messageFr:
        "YuE2 et ACE-Step ne conditionnent pas une nouvelle piste par le mix ou les stems (pas d’audio_input). " +
        "Hobby/Commercial inchangés. Choisissez le conditionnement par tempo / tonalité / style du projet, " +
        "ou attendez un moteur à entrée audio.",
    };
  }
  const styleBits = [
    input.style.trim(),
    ROLE_STYLE[input.role],
    input.tempoBpm != null ? `${input.tempoBpm} BPM` : null,
    input.key ? `key ${input.key.tonic} ${input.key.mode}` : null,
  ].filter((x): x is string => Boolean(x && x.trim()));
  return {
    ok: true,
    role: input.role,
    displayName: ROLE_FR[input.role],
    styleSent: styleBits.join(", "),
    instrumentalMode: true,
    conditioning: "project_metadata",
  };
}

export function instrumentalRoleLabel(role: InstrumentalRole): string {
  return ROLE_FR[role];
}
