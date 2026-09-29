import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildQualityTimeOptions,
  canDownloadSeparator,
  describeStemProvidersFr,
  EXCLUDED_SEPARATOR_NOTES_FR,
  formatDurationFr,
  licenseStatusLabelFr,
  recommendReasonFr,
  recommendSeparator,
  separatorLicense,
  timeLabelFr,
  type SeparationTrackFocus,
  type StemProviderId,
} from "@song-maker/stem-providers";
import { api } from "../lib/api";
import type { AppSettings, Phase3Status } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import { AnchoredPopin } from "./AnchoredPopin";
import { SeparatorLicenseBadge } from "./SeparatorLicenseBadge";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  audioDurationSec: number;
  busy: boolean;
  onConfirm: (separator: StemProviderId) => void;
};

/**
 * Pre-separation dialog (#166 + #167): recommend a model, show times,
 * typed license badges with icons, optional install gated by « J'ai lu la licence ».
 */
export function SeparationRecommendDialog({
  open,
  onClose,
  anchorRef,
  audioDurationSec,
  busy,
  onConfirm,
}: Props) {
  const titleId = useId();
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setError = useAppStore((s) => s.setError);
  const [phase3, setPhase3] = useState<Phase3Status | null>(null);
  const [focus, setFocus] = useState<SeparationTrackFocus>("mix");
  const [selected, setSelected] = useState<StemProviderId>("htdemucs");
  const [installing, setInstalling] = useState<StemProviderId | null>(null);
  const [licenseLocal, setLicenseLocal] = useState<Record<string, boolean>>({});
  const licenseDraft = useRef<Record<string, boolean>>({});

  const refresh = async () => {
    try {
      setPhase3(await api.getPhase3Status());
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const recommended = recommendSeparator(focus);
    setSelected(recommended);
  }, [open]);

  useEffect(() => {
    setSelected(recommendSeparator(focus));
  }, [focus]);

  const accepted = {
    ...(settings?.acceptedSeparatorLicenses ?? {}),
    ...(phase3?.acceptedSeparatorLicenses ?? {}),
    ...licenseLocal,
  };

  const measured = useMemo(() => {
    const raw = phase3?.separatorTimeStats ?? settings?.separatorTimeStats ?? {};
    const out: Partial<
      Record<StemProviderId, { msPerAudioSec: number; samples: number }>
    > = {};
    for (const [id, stat] of Object.entries(raw)) {
      out[id as StemProviderId] = {
        msPerAudioSec: stat.msPerAudioSec,
        samples: stat.samples,
      };
    }
    return out;
  }, [phase3?.separatorTimeStats, settings?.separatorTimeStats]);

  const providers = useMemo(
    () =>
      describeStemProvidersFr({
        bsRoFormerWeightsPresent: phase3?.bsRoformerAvailable ?? false,
        melBandRoFormerWeightsPresent:
          phase3?.melBandRoformerAvailable ?? false,
        htdemucs6sRuntimeAvailable:
          phase3?.htdemucs6sRuntimeAvailable ?? false,
      }),
    [
      phase3?.bsRoformerAvailable,
      phase3?.melBandRoformerAvailable,
      phase3?.htdemucs6sRuntimeAvailable,
    ],
  );

  const options = useMemo(
    () =>
      buildQualityTimeOptions({
        focus,
        audioDurationSec,
        measured,
        ids: providers.map((p) => p.id),
      }),
    [focus, audioDurationSec, measured, providers],
  );

  const persistLicense = async (id: StemProviderId, checked: boolean) => {
    if (!settings) return;
    licenseDraft.current[id] = checked;
    setLicenseLocal((prev) => ({ ...prev, [id]: checked }));
    const next: AppSettings = {
      ...settings,
      acceptedSeparatorLicenses: {
        ...(settings.acceptedSeparatorLicenses ?? {}),
        [id]: checked,
      },
    };
    try {
      await api.updateSettings(next);
      await refreshSettings();
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const install = async (id: StemProviderId) => {
    if (!canDownloadSeparator(id, accepted)) {
      setError(t("separate.license.blocked"));
      return;
    }
    setInstalling(id);
    try {
      if (id === "bs_roformer") await api.installBsRoFormer();
      else if (id === "mel_band_roformer") await api.installMelBandRoFormer();
      else if (id === "htdemucs_6s") await api.installHtDemucs6sRuntime();
      else if (id === "htdemucs") await api.installMixOnlyAssets();
      await refresh();
      await refreshSettings();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
    }
  };

  const recommendedId = recommendSeparator(focus);
  const recommendedLicense = separatorLicense(recommendedId);
  const recommendedUnverified =
    recommendedLicense != null && recommendedLicense.status !== "verified";

  const selectAndRun = async () => {
    if (!settings) return;
    const provider = providers.find((p) => p.id === selected);
    const selectedLicense = separatorLicense(selected);
    // Avertissement avant lancement si le modèle (recommandé ou choisi) n’est pas vérifié (#166).
    if (selectedLicense != null && selectedLicense.status !== "verified") {
      const ok = window.confirm(
        `${t("separate.recommend.unverifiedWarn")}\n\n${selectedLicense.noticeFr}`,
      );
      if (!ok) return;
    }
    if (!provider?.runnable && selected !== "htdemucs") {
      setError(t("separate.model.unavailable"));
      return;
    }
    if (selected === "htdemucs" && !(phase3?.htdemucsAvailable ?? false)) {
      setError(t("separate.model.unavailable"));
      return;
    }
    try {
      if (settings.stemSeparator !== selected) {
        await api.updateSettings({ ...settings, stemSeparator: selected });
        await refreshSettings();
      }
      onConfirm(selected);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="separation-recommend-popin"
    >
      <header className="anchored-popin-header">
        <h3 id={titleId}>{t("separate.recommend.title")}</h3>
        <p className="hint">{t("separate.recommend.intro")}</p>
      </header>

      <fieldset className="sep-focus" disabled={busy}>
        <legend>{t("separate.recommend.focus")}</legend>
        {(
          [
            ["mix", "separate.recommend.focus.mix"],
            ["vocals", "separate.recommend.focus.vocals"],
            ["drums", "separate.recommend.focus.drums"],
          ] as const
        ).map(([value, key]) => (
          <label key={value}>
            <input
              type="radio"
              name="sep-focus"
              checked={focus === value}
              onChange={() => setFocus(value)}
            />
            {t(key)}
          </label>
        ))}
      </fieldset>

      <p className="hint" role="status" data-testid="sep-recommend-reason">
        {recommendReasonFr(focus)}
      </p>

      {recommendedUnverified && recommendedLicense && (
        <p
          className="hint warn"
          role="status"
          data-testid="sep-recommend-unverified-warn"
        >
          {t("separate.recommend.unverifiedBanner", {
            model:
              providers.find((p) => p.id === recommendedId)?.displayNameFr ??
              recommendedId,
            status: licenseStatusLabelFr(recommendedLicense.status),
          })}
        </p>
      )}

      <ul
        className="sep-quality-list"
        aria-label={t("separate.recommend.options")}
      >
        {options.map((opt) => {
          const provider = providers.find((p) => p.id === opt.id);
          const license = separatorLicense(opt.id);
          const weightsPresent =
            opt.id === "htdemucs"
              ? Boolean(phase3?.htdemucsAvailable)
              : Boolean(provider?.runnable);
          const runnable =
            opt.id === "htdemucs"
              ? Boolean(phase3?.htdemucsAvailable)
              : Boolean(provider?.runnable);
          const acceptedHere = Boolean(accepted[opt.id]);
          const showAccept =
            Boolean(license?.requiresAcceptBeforeDownload) &&
            (!weightsPresent || !acceptedHere);
          const licenseCbId = `sep-rec-license-${opt.id}`;
          return (
            <li
              key={opt.id}
              className={
                opt.recommended ? "sep-quality recommended" : "sep-quality"
              }
            >
              <label className="sep-quality-main">
                <input
                  type="radio"
                  name="sep-model"
                  checked={selected === opt.id}
                  disabled={busy}
                  onChange={() => setSelected(opt.id)}
                />
                <span>
                  <strong>{provider?.displayNameFr ?? opt.id}</strong>
                  {opt.recommended && (
                    <span className="sep-badge recommended">
                      {t("separate.recommend.badge")}
                    </span>
                  )}
                  <br />
                  <span className="hint">{provider?.stemLayoutNoteFr}</span>
                  <br />
                  <span
                    className="sep-time"
                    data-testid={`sep-time-${opt.id}`}
                    data-time-kind={opt.kind}
                  >
                    {formatDurationFr(opt.estimatedMs)} ·{" "}
                    {timeLabelFr(opt.kind)}
                  </span>
                  {license && (
                    <>
                      <br />
                      <SeparatorLicenseBadge license={license} />{" "}
                      <a
                        href={license.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {license.sourceLabelFr}
                      </a>
                    </>
                  )}
                </span>
              </label>
              {license && (
                <div className="sep-install">
                  <p
                    className="hint warn"
                    data-testid={`sep-rec-notice-${opt.id}`}
                  >
                    {license.noticeFr}
                  </p>
                  {showAccept && (
                    <label className="sep-license-cb" htmlFor={licenseCbId}>
                      <input
                        id={licenseCbId}
                        type="checkbox"
                        checked={acceptedHere}
                        aria-label={t("separate.license.acceptNamed", {
                          name: provider?.displayNameFr ?? opt.id,
                        })}
                        onChange={(e) =>
                          void persistLicense(opt.id, e.target.checked)
                        }
                      />
                      {t("separate.license.acceptNamed", {
                        name: provider?.displayNameFr ?? opt.id,
                      })}
                    </label>
                  )}
                  {!runnable && (
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        busy ||
                        installing === opt.id ||
                        !canDownloadSeparator(opt.id, accepted)
                      }
                      title={
                        canDownloadSeparator(opt.id, accepted)
                          ? undefined
                          : t("separate.license.blocked")
                      }
                      onClick={() => void install(opt.id)}
                    >
                      {installing === opt.id
                        ? t("separate.install.busy")
                        : opt.id === "htdemucs"
                          ? t("separate.license.htdemucs.install")
                          : t("separate.install")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h4>{t("separate.license.exclusions")}</h4>
      <ul className="sep-license-exclusions" data-testid="sep-rec-exclusions">
        {EXCLUDED_SEPARATOR_NOTES_FR.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("separate.recommend.cancel")}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void selectAndRun()}
        >
          {t("separate.recommend.run")}
        </button>
      </div>
    </AnchoredPopin>
  );
}
