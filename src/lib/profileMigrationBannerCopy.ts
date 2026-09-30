import type { ProfileSummary } from "./profilesTypes.ts";

/** Aligné sur `MAX_PROFILES` côté Rust / `profilesState.maxProfiles`. */
export const PROFILE_MAX_COUNT_DEFAULT = 6;

/**
 * Nom du profil créé à la migration (aligné sur Rust `MIGRATION_DEFAULT_NAME`).
 * Comparaison exacte — pas de `name.includes("Profil Hobby")`.
 */
export const MIGRATION_DEFAULT_PROFILE_NAME =
  "Profil Hobby (vos projets existants)";

/** Titre affiché du bandeau : nom du profil migré. */
export function pickProfileMigrationBannerProfile(
  profiles: ProfileSummary[],
): ProfileSummary | null {
  if (profiles.length === 0) return null;
  return (
    profiles.find((p) => p.name === MIGRATION_DEFAULT_PROFILE_NAME) ??
    profiles.find((p) => p.isLastUsed) ??
    profiles[0]
  );
}

const TAIL_FR = (maxProfiles: number) =>
  ` Vous pouvez le renommer ou en créer d'autres (${maxProfiles} au maximum).`;

const TAIL_EN = (maxProfiles: number) =>
  ` You can rename it or create others (up to ${maxProfiles}).`;

export function formatProfileMigrationBannerFr(
  projectCount: number,
  maxProfiles: number = PROFILE_MAX_COUNT_DEFAULT,
): string {
  const tail = TAIL_FR(maxProfiles);
  if (projectCount === 0) {
    return `Vos contrats déjà acceptés sont conservés dans ce profil.${tail}`;
  }
  if (projectCount === 1) {
    return `Votre morceau et vos contrats déjà acceptés sont conservés dans ce profil.${tail}`;
  }
  return `Vos ${projectCount} morceaux et vos contrats déjà acceptés sont conservés dans ce profil.${tail}`;
}

export function formatProfileMigrationBannerEn(
  projectCount: number,
  maxProfiles: number = PROFILE_MAX_COUNT_DEFAULT,
): string {
  const tail = TAIL_EN(maxProfiles);
  if (projectCount === 0) {
    return `Your previously accepted agreements are kept in this profile.${tail}`;
  }
  if (projectCount === 1) {
    return `Your song and your previously accepted agreements are kept in this profile.${tail}`;
  }
  return `Your ${projectCount} songs and your previously accepted agreements are kept in this profile.${tail}`;
}
