import { useEffect, useState } from "react";
import { ProfileCommercialTypeOption } from "../components/ProfileCommercialTypeOption";
import { api } from "../lib/api";
import { resolveCommercialCreationState } from "../lib/profileCommercialCreation";
import type { ProfileKind, ProfileSummary } from "../lib/profilesTypes";
import { setupComplete } from "../lib/firstLaunch";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import "./ProfileOnboardingScreen.css";

export function ProfileOnboardingScreen() {
  const health = useAppStore((s) => s.health);
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);

  const [name, setName] = useState("");
  const [type, setType] = useState<ProfileKind>("hobby");
  const [busy, setBusy] = useState(false);

  const commercialState = resolveCommercialCreationState();
  const maxProfiles = profilesState?.maxProfiles ?? 6;
  const profiles = profilesState?.profiles ?? [];
  const canCreateMore = profiles.length < maxProfiles;

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const openProfile = async (id: string) => {
    setBusy(true);
    try {
      await api.activateProfile(id);
      await refreshProfiles();
      await refreshSettings();
      setScreen(setupComplete(health) ? "library" : "splash");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nom du profil requis.");
      return;
    }
    if (type === "commercial" && !commercialState.activatable) {
      return;
    }
    setBusy(true);
    try {
      const created = await api.createProfile(trimmed, type);
      await api.activateProfile(created.id);
      await refreshProfiles();
      await refreshSettings();
      setScreen(setupComplete(health) ? "library" : "splash");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const migrationProfile = profiles.find((p) =>
    p.name.includes("Profil Hobby"),
  );

  return (
    <div className="profile-onboarding" data-testid="profile-onboarding-screen">
      <header className="profile-onboarding-header">
        <p className="profile-kicker">PROFILS</p>
        <h1>{t("profiles.onboarding.title")}</h1>
        <p className="profile-onboarding-sub">{t("profiles.onboarding.subtitle")}</p>
      </header>
      <div className="profile-onboarding-grid">
        <section className="profile-onboarding-list" aria-labelledby="profile-list-title">
          <h2 id="profile-list-title">
            {t("profiles.onboarding.yours")} ({profiles.length})
          </h2>
          <ul className="profile-cards">
            {profiles.map((p: ProfileSummary) => (
              <li key={p.id} className="profile-card" data-testid={`profile-card-${p.id}`}>
                <div className="profile-card-head">
                  <span className={`profile-selector-icon ${p.kind}`} aria-hidden="true">
                    {p.kind === "commercial" ? "💼" : "🏠"}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    {p.isLastUsed ? (
                      <span className="profile-last-used">{t("profiles.onboarding.lastUsed")}</span>
                    ) : null}
                    <p className="profile-card-meta">
                      {p.kind === "commercial"
                        ? t("profiles.kind.commercial")
                        : t("profiles.kind.hobby")}
                      {" · "}
                      {p.projectCount > 0
                        ? t("profiles.projects.count", { count: p.projectCount })
                        : t("profiles.projects.none")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary profile-focusable"
                  disabled={busy}
                  data-testid={`profile-open-${p.id}`}
                  onClick={() => void openProfile(p.id)}
                >
                  {t("profiles.onboarding.open")} →
                </button>
              </li>
            ))}
          </ul>
          {migrationProfile ? (
            <p className="profile-migration-note" data-testid="profile-migration-note">
              {t("profiles.onboarding.migration", { name: migrationProfile.name })}
            </p>
          ) : null}
        </section>
        <section className="profile-onboarding-create" aria-labelledby="profile-create-title">
          <h2 id="profile-create-title">{t("profiles.onboarding.new")}</h2>
          <label className="profile-field">
            <span>{t("profiles.onboarding.name")}</span>
            <input
              className="profile-focusable"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profiles.onboarding.name.placeholder")}
              data-testid="profile-create-name"
            />
          </label>
          <div className="profile-type-radios" role="radiogroup" aria-label={t("profiles.onboarding.new")}>
            <div
              role="radio"
              aria-checked={type === "hobby"}
              tabIndex={0}
              className={`profile-type-card hobby profile-focusable${type === "hobby" ? " is-selected" : ""}`}
              data-testid="profile-type-hobby"
              onClick={() => setType("hobby")}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setType("hobby");
                }
              }}
            >
              <span className="profile-type-icon hobby" aria-hidden="true">🏠</span>
              <span className="profile-type-label">{t("profiles.onboarding.type.hobby")}</span>
              <span className="profile-type-hint">{t("profiles.onboarding.type.hobby.hint")}</span>
            </div>
            <ProfileCommercialTypeOption
              state={commercialState}
              selected={type === "commercial"}
              name={t("profiles.onboarding.type.commercial")}
              onSelect={() => {
                if (commercialState.activatable) setType("commercial");
              }}
            />
          </div>
          <button
            type="button"
            className="btn primary profile-focusable"
            disabled={busy || !canCreateMore || !name.trim() || (type === "commercial" && !commercialState.activatable)}
            data-testid="profile-create-submit"
            onClick={() => void createProfile()}
          >
            {t("profiles.onboarding.create")}
          </button>
        </section>
      </div>
    </div>
  );
}
