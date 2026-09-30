import {
  RESERVED_BADGE_FR,
} from "./commercial-profile-i18n.js";
import {
  buildCommercialEngineList,
  isCommercialProfileAvailable,
  listProductionWiredCommercialEngines,
  type WiredCommercialEngine,
} from "./engine-licenses-201.js";

export const COMMERCIAL_CREATE_CONFIRM_TITLE_FR = "Créer un profil Commercial ?";

export const COMMERCIAL_CREATE_CONFIRM_TITLE_EN = "Create a Commercial profile?";

export const COMMERCIAL_CREATE_CONFIRM_INTRO_FR =
  "Pour les projets destinés à être diffusés ou vendus. Seuls les moteurs dont la licence des poids autorise l'usage commercial sont proposés, avec les réserves indiquées.";

export const COMMERCIAL_CREATE_CONFIRM_INTRO_EN =
  "For projects you intend to publish or sell. Only engines whose weight license allows commercial use are offered, with the stated reservations.";

/** One line per wired engine with a dated license row (from licences-moteurs-201.json). */
export function formatCommercialCreationEngineLineFr(engineLabel: string): string {
  return `Moteur proposé aujourd'hui : ${engineLabel} — ${RESERVED_BADGE_FR}.`;
}

export function formatCommercialCreationEngineLineEn(engineLabel: string): string {
  return `Engine offered today: ${engineLabel} — Available with reservation.`;
}

export type CommercialProfileCreationConfirm = {
  titleFr: string;
  titleEn: string;
  introFr: string;
  introEn: string;
  engineLinesFr: string[];
  engineLinesEn: string[];
};

/**
 * Lot futur (#209) : null tant qu'aucun moteur branché n'a une entrée datée.
 * Aucun texte moteur en dur (pas d'ACE-Step).
 */
export function buildCommercialProfileCreationConfirm(
  wired: readonly WiredCommercialEngine[] = listProductionWiredCommercialEngines(),
): CommercialProfileCreationConfirm | null {
  if (!isCommercialProfileAvailable(wired)) {
    return null;
  }
  const reserved = buildCommercialEngineList(wired).filter(
    (e) => e.availability === "reserved",
  );
  if (reserved.length === 0) {
    return null;
  }
  const engineLinesFr: string[] = [];
  const engineLinesEn: string[] = [];
  for (const entry of reserved) {
    const label =
      entry.licenseRow?.nom?.trim() || entry.engine.displayNameFr;
    const labelEn =
      entry.licenseRow?.nom?.trim() || entry.engine.displayNameEn;
    engineLinesFr.push(formatCommercialCreationEngineLineFr(label));
    engineLinesEn.push(formatCommercialCreationEngineLineEn(labelEn));
  }
  return {
    titleFr: COMMERCIAL_CREATE_CONFIRM_TITLE_FR,
    titleEn: COMMERCIAL_CREATE_CONFIRM_TITLE_EN,
    introFr: COMMERCIAL_CREATE_CONFIRM_INTRO_FR,
    introEn: COMMERCIAL_CREATE_CONFIRM_INTRO_EN,
    engineLinesFr,
    engineLinesEn,
  };
}
