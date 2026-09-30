/** Aligné sur `MAX_PROFILES` côté Rust / `profilesState.maxProfiles`. */
export const PROFILE_MAX_COUNT_DEFAULT = 6;

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
