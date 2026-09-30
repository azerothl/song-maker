import { api } from "../lib/api";
import {
  formatProfileMigrationBannerEn,
  formatProfileMigrationBannerFr,
  pickProfileMigrationBannerProfile,
} from "../lib/profileMigrationBannerCopy";
import { useAppStore } from "../store/appStore";
import { profileLocale, t } from "../ui/i18n";

export function ProfileMigrationBanner() {
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const setError = useAppStore((s) => s.setError);

  if (!profilesState?.migrationBannerVisible) return null;

  const migrated = pickProfileMigrationBannerProfile(profilesState.profiles);
  if (!migrated) return null;

  const onRename = () => {
    const typeLabel =
      migrated.kind === "commercial"
        ? t("profiles.onboarding.type.commercial")
        : t("profiles.onboarding.type.hobby");
    const next = window.prompt(
      `${t("profiles.onboarding.renameTypeImmutable", { type: typeLabel })}\n\n${t("profiles.onboarding.rename")}`,
      migrated.name,
    );
    if (!next?.trim() || next.trim() === migrated.name) return;
    void api
      .renameProfile(migrated.id, next.trim())
      .then(() => refreshProfiles())
      .catch((e) => setError(String(e)));
  };

  return (
    <div
      className="profile-migration-banner"
      role="status"
      data-testid="profile-migration-banner"
    >
      <div className="profile-migration-banner-icon" aria-hidden="true">🏠</div>
      <div className="profile-migration-banner-text">
        <strong data-testid="profile-migration-banner-title">{migrated.name}</strong>
        <p data-testid="profile-migration-banner-body">
          {(profileLocale() === "en"
            ? formatProfileMigrationBannerEn
            : formatProfileMigrationBannerFr)(
            migrated.projectCount,
            profilesState.maxProfiles,
          )}
        </p>
      </div>
      <div className="profile-migration-banner-actions">
        <button
          type="button"
          className="btn ghost profile-focusable"
          data-testid="profile-migration-rename"
          onClick={onRename}
        >
          {t("profiles.migration.rename")}
        </button>
        <button
          type="button"
          className="btn profile-focusable"
          data-testid="profile-migration-dismiss"
          onClick={() => {
            void api.dismissProfileMigrationBanner().then(() => refreshProfiles());
          }}
        >
          {t("profiles.migration.dismiss")}
        </button>
      </div>
    </div>
  );
}
