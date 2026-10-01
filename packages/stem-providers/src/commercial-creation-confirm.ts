import {
  buildCommercialEngineList,
  formatCommercialReservedBadge,
  isCommercialProfileAvailable,
  listProductionWiredCommercialEngines,
  type EngineLicenseRow201,
  type WiredCommercialEngine,
} from "./engine-licenses-201.js";

export const COMMERCIAL_CREATE_CONFIRM_TITLE_FR = "Créer un profil Commercial ?";

export const COMMERCIAL_CREATE_CONFIRM_TITLE_EN = "Create a Commercial profile?";

export const COMMERCIAL_CREATE_CONFIRM_INTRO_FR =
  "Pour les projets destinés à être diffusés ou vendus. Seuls les moteurs proposés avec réserve le sont ici, avec les réserves indiquées dans les licences des poids.";

export const COMMERCIAL_CREATE_CONFIRM_INTRO_EN =
  "For projects you intend to publish or sell. Only engines offered here with reservation are listed, with the reservations stated in the weight licenses.";

/** One line per wired engine with a dated license row (badge from row.statut). */
export function formatCommercialCreationEngineLineFr(
  engineLabel: string,
  statut: string,
): string {
  const badge = formatCommercialReservedBadge(statut, "fr");
  return `Moteur proposé aujourd'hui : ${engineLabel} — ${badge}.`;
}

export function formatCommercialCreationEngineLineEn(
  engineLabel: string,
  statut: string,
): string {
  const badge = formatCommercialReservedBadge(statut, "en");
  return `Engine offered today: ${engineLabel} — ${badge}.`;
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
  rows?: ReadonlyMap<string, EngineLicenseRow201>,
): CommercialProfileCreationConfirm | null {
  if (!isCommercialProfileAvailable(wired, rows)) {
    return null;
  }
  const reserved = buildCommercialEngineList(wired, rows).filter(
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
    const statut = entry.licenseRow?.statut ?? "";
    engineLinesFr.push(formatCommercialCreationEngineLineFr(label, statut));
    engineLinesEn.push(formatCommercialCreationEngineLineEn(labelEn, statut));
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
