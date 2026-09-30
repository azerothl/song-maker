import { buildCommercialProfileCreationConfirm } from "@song-maker/stem-providers";
import { useEffect, useMemo, useState } from "react";
import { ProfileCommercialCreateConfirmDialog } from "../components/ProfileCommercialCreateConfirmDialog";
import { ProfileCommercialTypeOption } from "../components/ProfileCommercialTypeOption";
import { ProfileRenameDialog } from "../components/ProfileRenameDialog";
import { api } from "../lib/api";
import { resolveCommercialCreationState } from "../lib/profileCommercialCreation";
import type { ProfileKind, ProfileSummary } from "../lib/profilesTypes";
import { setupComplete } from "../lib/firstLaunch";
import { formatProfileProjectCount } from "../lib/profileProjectCount";
import { profileSwitchBlockReason } from "../lib/profileSwitchBlock";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import "./ProfileOnboardingScreen.css";

function profileCardMeta(p: ProfileSummary): string {
  const kind =
    p.kind === "commercial"
      ? t("profiles.onboarding.type.commercial")
      : t("profiles.onboarding.type.hobby");
  const projects = formatProfileProjectCount(p.projectCount);
  const contracts =
    p.acceptedContractCount > 0
      ? t("profiles.contracts.count", { count: p.acceptedContractCount })
      : t("profiles.contracts.none");
  return `${kind} · ${projects} · ${contracts}`;
}

export function ProfileOnboardingScreen() {
  const health = useAppStore((s) => s.health);
  const job = useAppStore((s) => s.job);
  const profileOperationBusy = useAppStore((s) => s.profileOperationBusy);
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);

  const [name, setName] = useState("");
  const [type, setType] = useState<ProfileKind>("hobby");
  const [busy, setBusy] = useState(false);
  const [commercialConfirmOpen, setCommercialConfirmOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProfileSummary | null>(null);

  const commercialState = resolveCommercialCreationState();
  const commercialCreateConfirm = useMemo(
    () => buildCommercialProfileCreationConfirm(),
    [],
  );
  const maxProfiles = profilesState?.maxProfiles ?? 6;
  const profiles = profilesState?.profiles ?? [];
  const canCreateMore = profiles.length < maxProfiles;
  const switchBlock = profileSwitchBlockReason(job, profileOperationBusy);
  const switchBlockMessage =
    switchBlock.blocked && switchBlock.kind === "generation"
      ? t("profiles.switch.blocked.generation")
      : switchBlock.blocked && switchBlock.kind === "separation"
        ? t("profiles.switch.blocked.separation")
        : switchBlock.blocked && switchBlock.kind === "export"
          ? t("profiles.switch.blocked.export")
          : null;

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const openProfile = async (id: string) => {
    if (switchBlock.blocked) return;
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

  const renameProfile = (p: ProfileSummary) => {
    setRenaming(p);
  };

  const submitRename = (nextName: string) => {
    const target = renaming;
    if (!target) return;
    setRenaming(null);
    void api
      .renameProfile(target.id, nextName)
      .then(() => refreshProfiles())
      .catch((e) => setError(String(e)));
  };

  const performCreate = async () => {
    if (switchBlock.blocked) return;
    const trimmed = name.trim();
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
      setCommercialConfirmOpen(false);
    }
  };

  const createProfile = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nom du profil requis.");
      return;
    }
    if (type === "commercial" && !commercialState.activatable) {
      return;
    }
    if (type === "commercial" && commercialCreateConfirm) {
      setCommercialConfirmOpen(true);
      return;
    }
    void performCreate();
  };

  const createDisabled =
    busy ||
    switchBlock.blocked ||
    !canCreateMore ||
    !name.trim() ||
    (type === "commercial" && !commercialState.activatable);

  return (
    <div className="profile-onboarding" data-testid="profile-onboarding-screen">
      <header className="profile-onboarding-header">
        <p className="profile-kicker">PROFILS</p>
        <h1>{t("profiles.onboarding.title")}</h1>
        <p className="profile-onboarding-sub">{t("profiles.onboarding.subtitle")}</p>
        {switchBlockMessage ? (
          <div
            className="profile-switch-block-alert"
            role="alert"
            data-testid="profile-onboarding-switch-block"
          >
            {switchBlockMessage}
          </div>
        ) : null}
      </header>
      <div className="profile-onboarding-grid">
        <section className="profile-onboarding-list" aria-labelledby="profile-list-title">
          <h2 id="profile-list-title" className="profile-section-kicker">
            {t("profiles.onboarding.yours")} ({profiles.length} {t("profiles.onboarding.ofMax")}{" "}
            {maxProfiles})
          </h2>
          <ul className="profile-cards">
            {profiles.map((p: ProfileSummary) => (
              <li
                key={p.id}
                className={`profile-card${p.isLastUsed ? " is-last-used" : ""}`}
                data-testid={`profile-card-${p.id}`}
              >
                <div className="profile-card-head">
                  <span className={`profile-selector-icon ${p.kind}`} aria-hidden="true">
                    {p.kind === "commercial" ? "💼" : "🏠"}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    {p.isLastUsed ? (
                      <span className="profile-last-used">
                        ✓ {t("profiles.onboarding.lastUsed")}
                      </span>
                    ) : null}
                    <p className="profile-card-meta">{profileCardMeta(p)}</p>
                  </div>
                </div>
                <div className="profile-card-actions">
                  <button
                    type="button"
                    className="btn ghost profile-focusable profile-card-edit"
                    aria-label={t("profiles.onboarding.rename")}
                    data-testid={`profile-rename-${p.id}`}
                    disabled={busy}
                    onClick={() => renameProfile(p)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={`btn profile-focusable${p.isLastUsed ? " primary" : ""}`}
                    disabled={busy || switchBlock.blocked}
                    data-testid={`profile-open-${p.id}`}
                    onClick={() => void openProfile(p.id)}
                  >
                    {t("profiles.onboarding.open")} →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section
          className={`profile-onboarding-create${!canCreateMore ? " is-limit" : ""}`}
          aria-labelledby="profile-create-title"
        >
          <h2 id="profile-create-title" className="profile-section-kicker">
            {t("profiles.onboarding.new")} ({profiles.length} {t("profiles.onboarding.ofMax")}{" "}
            {maxProfiles})
          </h2>
          {!canCreateMore ? (
            <div
              className="profile-limit-alert"
              role="alert"
              data-testid="profile-limit-alert"
            >
              ⚠ {t("profiles.onboarding.limitReached")}
            </div>
          ) : null}
          <label className="profile-field">
            <span>{t("profiles.onboarding.name")}</span>
            <input
              className="profile-focusable"
              type="text"
              value={name}
              disabled={!canCreateMore}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profiles.onboarding.name.placeholder")}
              data-testid="profile-create-name"
            />
          </label>
          <div
            className="profile-type-radios"
            role="radiogroup"
            aria-label={t("profiles.onboarding.typeLabel")}
          >
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
          <div className="profile-create-actions">
            <button
              type="button"
              className="btn primary profile-focusable"
              disabled={createDisabled}
              data-testid="profile-create-submit"
            onClick={() => createProfile()}
          >
            {t("profiles.onboarding.create")}
          </button>
          {!canCreateMore ? (
              <p className="profile-limit-hint" data-testid="profile-limit-hint">
                {t("profiles.onboarding.limitHint")}
              </p>
            ) : null}
          </div>
        </section>
      </div>
      {commercialCreateConfirm ? (
        <ProfileCommercialCreateConfirmDialog
          open={commercialConfirmOpen}
          confirm={commercialCreateConfirm}
          onConfirm={() => void performCreate()}
          onCancel={() => setCommercialConfirmOpen(false)}
        />
      ) : null}
      {renaming ? (
        <ProfileRenameDialog
          open
          currentName={renaming.name}
          typeLabel={
            renaming.kind === "commercial"
              ? t("profiles.onboarding.type.commercial")
              : t("profiles.onboarding.type.hobby")
          }
          onConfirm={submitRename}
          onCancel={() => setRenaming(null)}
        />
      ) : null}
    </div>
  );
}
