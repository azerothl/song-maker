import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function ProfileMigrationBanner() {
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);

  if (!profilesState?.migrationBannerVisible) return null;

  const migrated = profilesState.profiles.find((p) => p.isLastUsed) ?? profilesState.profiles[0];
  if (!migrated) return null;

  return (
    <div
      className="profile-migration-banner"
      role="status"
      data-testid="profile-migration-banner"
    >
      <p>{t("profiles.migration.banner", { name: migrated.name })}</p>
      <button
        type="button"
        className="btn ghost profile-focusable"
        data-testid="profile-migration-dismiss"
        onClick={() => {
          void api.dismissProfileMigrationBanner().then(() => refreshProfiles());
        }}
      >
        {t("profiles.migration.dismiss")}
      </button>
    </div>
  );
}
