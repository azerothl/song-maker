import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildQualityTimeOptions,
  canDownloadSeparator,
  describeStemProvidersFr,
  EXCLUDED_SEPARATOR_NOTES_FR,
  formatDurationFr,
  licenseStatusLabelFr,
  recommendFocusReasonFr,
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
 * Pre-separation dialog (#166 + #167 + #187): recommend a model, show times,
 * typed license badges, sticky footer, focusable blocked download.
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
  const [userPickedModel, setUserPickedModel] = useState(false);
  const [otherModelsOpen, setOtherModelsOpen] = useState(false);
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
    if (!open) {
      setUserPickedModel(false);
      setOtherModelsOpen(false);
      return;
    }
    void refresh();
    setFocus("mix");
    setSelected(recommendSeparator("mix"));
  }, [open]);

  useEffect(() => {
    if (!open || userPickedModel) return;
    setSelected(recommendSeparator(focus));
  }, [focus, open, userPickedModel]);

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
  const spotlightOption = useMemo(
    () => options.find((o) => o.id === recommendedId) ?? options.find((o) => o.recommended),
    [options, recommendedId],
  );
  const otherOptions = useMemo(
    () => options.filter((o) => o.id !== spotlightOption?.id),
    [options, spotlightOption?.id],
  );
  const recommendedLicense = separatorLicense(recommendedId);
  const recommendedUnverified =
    recommendedLicense != null && recommendedLicense.status !== "verified";
  const modelChangedManually = selected !== recommendedId;
  const runReasonId = useId();
  const exclusionsSummaryId = useId();

  const selectedRunnable = useMemo(() => {
    const provider = providers.find((p) => p.id === selected);
    if (selected === "htdemucs") {
      return Boolean(phase3?.htdemucsAvailable);
    }
    return Boolean(provider?.runnable);
  }, [selected, providers, phase3?.htdemucsAvailable]);

  const runBlockedReason = selectedRunnable
    ? null
    : t("separate.model.unavailable");

  const selectAndRun = async () => {
    if (!settings) return;
    if (!selectedRunnable) return;
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

  const pickModel = (id: StemProviderId) => {
    setUserPickedModel(true);
    setSelected(id);
  };

  const selectedInOther = otherOptions.some((o) => o.id === selected);
  const showManualPickOutside =
    userPickedModel && selectedInOther && !otherModelsOpen;

  const renderQualityOption = (
    opt: (typeof options)[number],
    showRecommendedBadge: boolean,
    layout: "default" | "spotlight" = "default",
  ) => {
    const spotlightLayout = layout === "spotlight";
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
    const downloadBlocked = !canDownloadSeparator(opt.id, accepted);
    const downloadReasonId = `sep-dl-reason-${opt.id}`;
    const installBusy = installing === opt.id;
    const blockInput = busy || installBusy;
    const suppressLicenseNotice =
      !spotlightLayout &&
      runnable &&
      opt.id === recommendedId &&
      license != null &&
      license.status !== "verified";

    const showLicenseNotice =
      license != null &&
      (spotlightLayout ||
        (!suppressLicenseNotice &&
          (!runnable || license.status !== "verified")));

    return (
      <li
        key={opt.id}
        className={
          opt.id === recommendedId ? "sep-quality recommended" : "sep-quality"
        }
        data-testid={`sep-quality-card-${opt.id}`}
      >
        <label className="sep-quality-main">
          <input
            type="radio"
            name="sep-model"
            id={`sep-model-${opt.id}`}
            checked={selected === opt.id}
            aria-busy={installBusy || undefined}
            aria-disabled={blockInput || undefined}
            onChange={() => {
              if (blockInput) return;
              pickModel(opt.id);
            }}
          />
          <span>
            <strong>{provider?.displayNameFr ?? opt.id}</strong>
            {showRecommendedBadge && opt.id === recommendedId && (
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
              {formatDurationFr(opt.estimatedMs)} · {timeLabelFr(opt.kind)}
            </span>
            {license && (
              <>
                <br />
                <SeparatorLicenseBadge license={license} />{" "}
                <a
                  className="sep-source-link"
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
        {license && (showLicenseNotice || showAccept || !runnable) && (
          <div className="sep-install">
            {showLicenseNotice && (
              <p
                className={`hint warn sep-rec-notice${spotlightLayout ? "" : ""}`}
                data-testid={`sep-rec-notice-${opt.id}`}
              >
                {license.noticeFr}
              </p>
            )}
            <div
              className={
                spotlightLayout && (showAccept || !runnable)
                  ? "sep-install-actions"
                  : undefined
              }
            >
              {showAccept && (
                <label className="sep-license-cb" htmlFor={licenseCbId}>
                  <input
                    id={licenseCbId}
                    type="checkbox"
                    checked={acceptedHere}
                    aria-busy={installBusy || undefined}
                    aria-disabled={blockInput || undefined}
                    aria-label={t("separate.license.acceptNamed", {
                      name: provider?.displayNameFr ?? opt.id,
                    })}
                    onChange={(e) => {
                      if (blockInput) return;
                      void persistLicense(opt.id, e.target.checked);
                    }}
                  />
                  {t("separate.license.acceptNamed", {
                    name: provider?.displayNameFr ?? opt.id,
                  })}
                </label>
              )}
              {!runnable && (
                <>
                  <button
                    type="button"
                    className="btn"
                    data-testid={`sep-download-${opt.id}`}
                    aria-busy={installBusy || undefined}
                    aria-disabled={
                      downloadBlocked || installBusy || busy || undefined
                    }
                    aria-describedby={
                      downloadBlocked ? downloadReasonId : undefined
                    }
                    onClick={() => {
                      if (downloadBlocked || installBusy || busy) return;
                      void install(opt.id);
                    }}
                  >
                    {installBusy
                      ? t("separate.install.busy")
                      : opt.id === "htdemucs"
                        ? t("separate.license.htdemucs.install")
                        : t("separate.install")}
                  </button>
                  {downloadBlocked && !spotlightLayout && (
                    <p
                      id={downloadReasonId}
                      className="hint sep-download-reason"
                      data-testid={`sep-download-reason-${opt.id}`}
                    >
                      {t("separate.license.blocked")}
                    </p>
                  )}
                </>
              )}
            </div>
            {downloadBlocked && spotlightLayout && !runnable && (
              <p
                id={downloadReasonId}
                className="hint sep-download-reason"
                data-testid={`sep-download-reason-${opt.id}`}
              >
                {t("separate.license.blocked")}
              </p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="separation-recommend-popin"
    >
      <div className="anchored-popin-scroll">
        <header className="anchored-popin-header">
          <h3 id={titleId}>{t("separate.recommend.title")}</h3>
          <p className="hint">{t("separate.recommend.intro")}</p>
        </header>

        <fieldset
          className="sep-focus"
          aria-busy={installing !== null ? true : undefined}
        >
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
                value={value}
                checked={focus === value}
                aria-disabled={busy || installing !== null || undefined}
                onChange={() => {
                  if (busy || installing !== null) return;
                  setFocus(value);
                }}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>

        {showManualPickOutside && (
          <p className="hint sep-manual-pick-banner" data-testid="sep-manual-pick-visible">
            {t("separate.recommend.manualPickVisible")}
          </p>
        )}

        {spotlightOption && (
          <section
            className="sep-recommended-spotlight"
            aria-label={t("separate.recommend.spotlight")}
            data-testid="sep-recommended-spotlight"
          >
            <p
              className="sep-unmeasured-rec-badge"
              data-testid="sep-unmeasured-rec-badge"
            >
              <span className="sep-unmeasured-icon" aria-hidden="true">
                !
              </span>
              {t("separate.recommend.unmeasuredBadge")}
            </p>
            <ul className="sep-quality-list">
              {renderQualityOption(spotlightOption, true, "spotlight")}
            </ul>
          </section>
        )}

        <div className="sep-status-cluster" role="status" aria-live="polite">
          <p className="hint" data-testid="sep-recommend-reason">
            {recommendFocusReasonFr(focus)}
          </p>

          {recommendedUnverified && recommendedLicense && (
            <p
              className="hint warn"
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
        </div>

        {modelChangedManually && (
          <p className="btn-row">
            <button
              type="button"
              className="btn ghost"
              data-testid="sep-revert-recommend"
              disabled={busy}
              onClick={() => {
                setUserPickedModel(false);
                setSelected(recommendedId);
                requestAnimationFrame(() => {
                  document
                    .getElementById(`sep-model-${recommendedId}`)
                    ?.focus();
                });
              }}
            >
              {t("separate.recommend.revert")}
            </button>
          </p>
        )}

        <section
          className="sep-exclusions-block"
          aria-labelledby={exclusionsSummaryId}
          data-testid="sep-exclusions-block"
        >
          <p
            id={exclusionsSummaryId}
            className="sep-exclusions-summary"
            data-testid="sep-exclusions-summary"
          >
            {t("separate.license.exclusionsSummary", {
              count: String(EXCLUDED_SEPARATOR_NOTES_FR.length),
            })}
          </p>
          <ul
            className="sep-exclusions-oneline"
            data-testid="sep-exclusions-oneline"
          >
            {EXCLUDED_SEPARATOR_NOTES_FR.map((note) => (
              <li key={note}>
                <span className="sep-exclusion-x" aria-hidden="true">
                  ✕
                </span>{" "}
                {note}
              </li>
            ))}
          </ul>
        </section>

        {otherOptions.length > 0 && (
          <details
            className="sep-other-models"
            data-testid="sep-other-models"
            open={otherModelsOpen}
            onToggle={(e) =>
              setOtherModelsOpen((e.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary>{t("separate.recommend.otherModels")}</summary>
            <ul
              className="sep-quality-list"
              aria-label={t("separate.recommend.options")}
            >
              {otherOptions.map((opt) => renderQualityOption(opt, false))}
            </ul>
          </details>
        )}
      </div>

      <div className="anchored-popin-footer" data-testid="sep-recommend-footer">
        {runBlockedReason && (
          <p
            id={runReasonId}
            className="hint sep-run-blocked-reason"
            data-testid="sep-run-blocked-reason"
          >
            {runBlockedReason}
          </p>
        )}
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("separate.recommend.cancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="sep-recommend-run"
            disabled={busy}
            aria-disabled={runBlockedReason ? true : undefined}
            aria-describedby={runBlockedReason ? runReasonId : undefined}
            onClick={() => void selectAndRun()}
          >
            {t("separate.recommend.run")}
          </button>
        </div>
      </div>
    </AnchoredPopin>
  );
}
