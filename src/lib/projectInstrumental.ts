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
  "ACE-Step 1.5 Base Lego n’affirme pas un stem dry : le fichier peut déjà être un mix fusionné. " +
  "Il est importé à t = 0 sans follow_project_tempo. Un stem MIT sur un mix YuE2 reste CC BY-NC.";

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
          "Aucun mix ni stems dans l’arrangement ouvert. Séparez ou importez des pistes d’abord.",
      };
    }
    if (!input.legoLicenseAccepted || !input.legoSidecarReady) {
      return {
        ok: false,
        role: input.role,
        conditioning: "mix_stems",
        messageFr:
          "Le conditionnement mix/stems passe par ACE-Step 1.5 Base Lego (sidecar Python, ≥12 Go VRAM conseillés), " +
          "pas par YuE2 ni le GGUF Turbo. YuE2 refuse audio_input. Installez Lego (opt-in) dans Paramètres → Modèle.",
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
