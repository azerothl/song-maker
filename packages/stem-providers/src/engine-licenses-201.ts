import rawEntries from "./data/licences-moteurs-201.json" with { type: "json" };
import { extractPrimaryLicenseSourceUrl } from "./license-source-url.js";

/** Licence row from Gabriel's 201 dataset (not legal advice). */
export type EngineLicenseRow201 = {
  id: string;
  nom: string;
  licence_poids: string;
  citation: string;
  source_url: string;
  licence_code: string;
  donnees_entrainement: string;
  restriction_sorties: string;
  statut: string;
  date_verification: string;
  raison_grise_fr: string;
};

export const ENGINE_LICENSE_ROWS_201: readonly EngineLicenseRow201[] =
  rawEntries as EngineLicenseRow201[];

export type CommercialGrayReasonId =
  | "non_commercial"
  | "weights_unverified"
  | "origin_undocumented";

export type AppEngineCategory = "generation" | "separation" | "transcription";

/** Engines exposed in Song Maker product surfaces (#201). */
export type AppEngineId =
  | "yue2_3b"
  | "htdemucs"
  | "htdemucs_6s"
  | "bs_roformer"
  | "mel_band_roformer"
  | "sheetsage2"
  | "basicpitch"
  | "adtof";

export type AppEngineDescriptor = {
  id: AppEngineId;
  licenseDataId: string | null;
  category: AppEngineCategory;
  displayNameFr: string;
  displayNameEn: string;
  grayReason: CommercialGrayReasonId;
};

const LICENSE_BY_ID = new Map(
  ENGINE_LICENSE_ROWS_201.map((row) => [row.id, row] as const),
);

/** Catalog of engines the app can surface (no ACE-Step — not wired on main). */
export const APP_ENGINE_CATALOG: readonly AppEngineDescriptor[] = [
  {
    id: "yue2_3b",
    licenseDataId: "yue2_3b",
    category: "generation",
    displayNameFr: "YuE2-3B",
    displayNameEn: "YuE2-3B",
    grayReason: "non_commercial",
  },
  {
    id: "htdemucs",
    licenseDataId: "htdemucs",
    category: "separation",
    displayNameFr: "HTDemucs (4 stems)",
    displayNameEn: "HTDemucs (4 stems)",
    grayReason: "weights_unverified",
  },
  {
    id: "htdemucs_6s",
    licenseDataId: "htdemucs_6s",
    category: "separation",
    displayNameFr: "HTDemucs (6 stems)",
    displayNameEn: "HTDemucs (6 stems)",
    grayReason: "weights_unverified",
  },
  {
    id: "bs_roformer",
    licenseDataId: "bs_roformer_ep368",
    category: "separation",
    displayNameFr: "BS-RoFormer ep368",
    displayNameEn: "BS-RoFormer ep368",
    grayReason: "weights_unverified",
  },
  {
    id: "mel_band_roformer",
    licenseDataId: "mel_band_roformer_kimberley",
    category: "separation",
    displayNameFr: "Mel-Band RoFormer « Kim Vocal 2 »",
    displayNameEn: "Mel-Band RoFormer « Kim Vocal 2 »",
    grayReason: "origin_undocumented",
  },
  {
    id: "sheetsage2",
    licenseDataId: "sheetsage2",
    category: "transcription",
    displayNameFr: "SheetSage2",
    displayNameEn: "SheetSage2",
    grayReason: "non_commercial",
  },
  {
    id: "basicpitch",
    licenseDataId: "basic_pitch",
    category: "transcription",
    displayNameFr: "BasicPitch",
    displayNameEn: "BasicPitch",
    grayReason: "weights_unverified",
  },
  {
    id: "adtof",
    licenseDataId: "adtof",
    category: "transcription",
    displayNameFr: "ADTOF",
    displayNameEn: "ADTOF",
    grayReason: "non_commercial",
  },
];

export function licenseRowForEngine(
  engine: AppEngineDescriptor,
): EngineLicenseRow201 | null {
  if (!engine.licenseDataId) return null;
  return LICENSE_BY_ID.get(engine.licenseDataId) ?? null;
}

export function licenseRowByDataId(id: string): EngineLicenseRow201 | null {
  return LICENSE_BY_ID.get(id) ?? null;
}

export type WiredCommercialEngine = {
  /** App engine id (must match provider wiring). */
  engineId: AppEngineId;
  /** Row id in licences-moteurs-201.json for the weights actually loaded. */
  licenseDataId: string;
};

/**
 * Production wiring for Commercial « disponible avec réserve ».
 * Empty on main until a provider is integrated (#201).
 */
/** Engines integrated in the app (license row id when present). */
export function listProductionWiredCommercialEngines(): readonly WiredCommercialEngine[] {
  return APP_ENGINE_CATALOG.filter((e) => e.licenseDataId != null).map((e) => ({
    engineId: e.id,
    licenseDataId: e.licenseDataId!,
  }));
}

export const COMMERCIAL_RESERVED_STATUT_FR = "disponible avec réserve";

export function normalizeLicenseStatut(statut: string): string {
  return statut.trim().toLowerCase();
}

export function isCommercialReservedStatut(statut: string | undefined | null): boolean {
  if (!statut?.trim()) return false;
  return normalizeLicenseStatut(statut) === COMMERCIAL_RESERVED_STATUT_FR;
}

export function licenseRowQualifiesForCommercialReserved(
  row: EngineLicenseRow201 | null | undefined,
): boolean {
  if (!row) return false;
  return (
    Boolean(row.date_verification?.trim()) &&
    isCommercialReservedStatut(row.statut)
  );
}

/**
 * Presentation fallback only: hide the Commercial tile vs show it greyed out.
 * Does not control whether Commercial is activatable (see `resolveCommercialCreationState`).
 */
export const COMMERCIAL_CREATION_UI_MODE: "hidden" | "disabled" = "disabled";

/** True when the license dataset has a non-empty verification date for this row id. */
export function hasDatedLicenseEntry(
  licenseDataId: string,
  rows: ReadonlyMap<string, EngineLicenseRow201> = LICENSE_BY_ID,
): boolean {
  const row = rows.get(licenseDataId);
  return Boolean(row?.date_verification?.trim());
}

/**
 * Commercial profile creation / activation is allowed when at least one engine
 * actually wired in the app has a dated row in licences-moteurs-201.json.
 */
export function isCommercialProfileAvailable(
  wired: readonly WiredCommercialEngine[] = listProductionWiredCommercialEngines(),
  rows: ReadonlyMap<string, EngineLicenseRow201> = LICENSE_BY_ID,
): boolean {
  return wired.some((entry) => {
    const row = rows.get(entry.licenseDataId);
    return licenseRowQualifiesForCommercialReserved(row);
  });
}

export type CommercialCreationState = {
  /** User can select Commercial (data: wired + dated license row). */
  activatable: boolean;
  /** Show Commercial tile at all (presentation fallback). */
  showCommercialOption: boolean;
  /** Show fixed unavailable copy on screen (data: option visible but not activatable). */
  showUnavailableReason: boolean;
};

export function resolveCommercialCreationState(
  wired: readonly WiredCommercialEngine[] = listProductionWiredCommercialEngines(),
  rows: ReadonlyMap<string, EngineLicenseRow201> = LICENSE_BY_ID,
): CommercialCreationState {
  const activatable = isCommercialProfileAvailable(wired, rows);
  const showCommercialOption = COMMERCIAL_CREATION_UI_MODE !== "hidden";
  return {
    activatable,
    showCommercialOption,
    showUnavailableReason: showCommercialOption && !activatable,
  };
}

export type CommercialEngineListEntry = {
  engine: AppEngineDescriptor;
  availability: "reserved" | "grayed";
  licenseRow: EngineLicenseRow201 | null;
  grayReason: CommercialGrayReasonId;
};

/** Hobby profile: engines offered with optional NC usage line (not legal advice). */
export const HOBBY_NON_COMMERCIAL_USAGE_FR = "Usage non commercial";

export type HobbyEngineOffer = {
  engine: AppEngineDescriptor;
  usageNoticeFr: string | null;
};

export function hobbyUsageNoticeFr(engineId: AppEngineId): string | null {
  const engine = APP_ENGINE_CATALOG.find((e) => e.id === engineId);
  if (!engine) return null;
  if (engine.grayReason === "non_commercial") {
    return HOBBY_NON_COMMERCIAL_USAGE_FR;
  }
  const row = licenseRowForEngine(engine);
  if (row?.statut?.toLowerCase().includes("non commercial")) {
    return HOBBY_NON_COMMERCIAL_USAGE_FR;
  }
  return null;
}

export function buildHobbyEngineOffers(): HobbyEngineOffer[] {
  return APP_ENGINE_CATALOG.map((engine) => ({
    engine,
    usageNoticeFr: hobbyUsageNoticeFr(engine.id),
  }));
}

export function buildCommercialEngineList(
  wired: readonly WiredCommercialEngine[] = listProductionWiredCommercialEngines(),
  rows: ReadonlyMap<string, EngineLicenseRow201> = LICENSE_BY_ID,
): CommercialEngineListEntry[] {
  const wiredByEngine = new Map(wired.map((w) => [w.engineId, w] as const));
  return APP_ENGINE_CATALOG.map((engine) => {
    const wire = wiredByEngine.get(engine.id);
    const licenseRow = wire
      ? rows.get(wire.licenseDataId) ?? null
      : licenseRowForEngine(engine);
    const reserved =
      Boolean(wire) && licenseRowQualifiesForCommercialReserved(licenseRow);
    const grayReason: CommercialGrayReasonId = engine.grayReason;
    return {
      engine,
      availability: reserved ? "reserved" : "grayed",
      licenseRow: licenseRow ?? null,
      grayReason,
    };
  });
}

export function primarySourceUrlForLicenseRow(
  row: EngineLicenseRow201 | null | undefined,
): string | null {
  if (!row?.source_url?.trim()) return null;
  const url = extractPrimaryLicenseSourceUrl(row.source_url);
  if (!url) return null;
  return url;
}

/** SHA-256 hex of UTF-8 text (contract fingerprint). */
export async function sha256HexUtf8(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type EngineContractTemplate = {
  engineId: string;
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  quoteEn: string;
  checkboxFr: string;
  checkboxEn: string;
  version: string;
};

export async function engineContractFingerprint(
  template: EngineContractTemplate,
): Promise<string> {
  const payload = [
    template.version,
    template.titleFr,
    template.titleEn,
    template.bodyFr,
    template.bodyEn,
    template.quoteEn,
    template.checkboxFr,
    template.checkboxEn,
  ].join("\n");
  return sha256HexUtf8(payload);
}
