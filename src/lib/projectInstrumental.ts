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
      engine: "yue2";
    }
  | {
      ok: true;
      role: InstrumentalRole;
      displayName: string;
      styleSent: string;
      instrumentalMode: true;
      conditioning: "mix_stems";
      engine: "ace_step_lego";
      outputKind: "possibly_fused_mix";
      leftoverNotesFr: string;
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

export const LEGO_FUSED_MIX_NOTE_FR =
  "Le résultat peut contenir le morceau d’origine en plus de la nouvelle partie. " +
  "Vérifiez à l’écoute que les instruments existants ne sont pas doublés dans le mix.";

export function planProjectInstrumentalPart(input: {
  role: InstrumentalRole;
  conditioning: InstrumentalConditioning;
  style: string;
  tempoBpm?: number | null;
  key?: { tonic: string; mode: string } | null;
  hasMixOrStems: boolean;
  legoSidecarReady?: boolean;
  legoLicenseAccepted?: boolean;
}): ProjectInstrumentalPlan {
  if (input.conditioning === "mix_stems") {
    if (!input.hasMixOrStems) {
      return {
        ok: false,
        role: input.role,
        conditioning: "mix_stems",
        messageFr:
          "Ajoutez un morceau ou des pistes à l’arrangement pour guider la nouvelle partie.",
      };
    }
    if (!input.legoLicenseAccepted || !input.legoSidecarReady) {
      return {
        ok: false,
        role: input.role,
        conditioning: "mix_stems",
        messageFr:
          "Pour créer une partie qui suit votre morceau, installez le moteur Lego dans Paramètres → Modèle " +
          "et acceptez ses conditions d’utilisation.",
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
      conditioning: "mix_stems",
      engine: "ace_step_lego",
      outputKind: "possibly_fused_mix",
      leftoverNotesFr: LEGO_FUSED_MIX_NOTE_FR,
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
    engine: "yue2",
  };
}

export function instrumentalRoleLabel(role: InstrumentalRole): string {
  return ROLE_FR[role];
}
