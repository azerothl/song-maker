import {
  useEffect,
  useId,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { MixSlider } from "../MixSlider";
import { PopinCloseButton } from "../PopinCloseButton";
import { t } from "../../ui/i18n";
import {
  getProductionClipSelection,
  subscribeProductionClipSelection,
} from "../../lib/productionClipSelection";
import { clipFadeErrorMessage } from "../../lib/clipFadeErrorMessage";
import { applyClipFadeEdit } from "../../lib/mixClipFadeEdit";
import {
  applyClipGainEdit,
  CLIP_GAIN_DB_MAX,
  CLIP_GAIN_DB_MIN,
  CLIP_GAIN_DB_STEP,
} from "../../lib/mixClipGainEdit";
import {
  isTrackAutomationVisible,
  setTrackAutomationVisible,
} from "../../lib/productionTrackAutomationVisible";
import { isMixMsActivationKey } from "../../lib/productionMixA11y";
import type { MixDoc, MixTrack } from "../../lib/types";
import { formatMs } from "../../lib/productionTimeFormat";
import {
  basicPitchQualityKey,
  trackHasAudioClip,
} from "../../lib/basicPitchProduct";
import {
  formatGainDb,
  parseGainDb,
} from "../../screens/song/shared";

const TIME_SNAP_MS = 50;

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  track: MixTrack;
  mix: MixDoc;
  onMixChange: (next: MixDoc, opts?: { persist?: boolean }) => void;
  onOpenFxLine: () => void;
  onTranscribeBasicPitch?: () => void;
  transcribing?: boolean;
  /** When true, render body only (parent owns the AnchoredPopin shell / tabs). */
  embedded?: boolean;
};

function parseFadeMsInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, ".").replace(/\s/g, "");
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

export function ProductionTrackSettingsPopin({
  open,
  onClose,
  anchorRef,
  track,
  mix,
  onMixChange,
  onOpenFxLine,
  onTranscribeBasicPitch,
  transcribing = false,
  embedded = false,
}: Props) {
  const titleId = useId();
  const fadesId = useId();
  const [clipSel, setClipSel] = useState(getProductionClipSelection());
  const [fadeError, setFadeError] = useState<string | null>(null);
  const [gainStatus, setGainStatus] = useState("");
  const [autoVisible, setAutoVisible] = useState(() =>
    isTrackAutomationVisible(track.id),
  );

  useEffect(() => subscribeProductionClipSelection(() => {
    setClipSel(getProductionClipSelection());
  }), []);

  useEffect(() => {
    if (!open) return;
    setAutoVisible(isTrackAutomationVisible(track.id));
    setFadeError(null);
    setGainStatus("");
  }, [open, track.id]);

  const selectedClip = useMemo(() => {
    if (!clipSel || clipSel.trackId !== track.id) return null;
    return track.clips.find((c) => c.id === clipSel.clipId) ?? null;
  }, [clipSel, track]);

  const clipIndex =
    selectedClip != null
      ? track.clips.findIndex((c) => c.id === selectedClip.id) + 1
      : 0;

  const applyFade = (field: "fadeInMs" | "fadeOutMs", raw: string) => {
    if (!selectedClip) return;
    const parsed = parseFadeMsInput(raw);
    if (parsed == null) {
      setFadeError(t("production.strip.invalid"));
      return;
    }
    const snapped = Math.round(parsed / TIME_SNAP_MS) * TIME_SNAP_MS;
    try {
      const next = applyClipFadeEdit(mix, track.id, selectedClip.id, {
        [field]: snapped,
      });
      onMixChange(next);
      setFadeError(null);
    } catch (e) {
      setFadeError(clipFadeErrorMessage(e));
    }
  };

  const applyGain = (gainDb: number, persist: boolean) => {
    if (!selectedClip) return;
    const next = applyClipGainEdit(mix, track.id, selectedClip.id, gainDb);
    onMixChange(next, { persist });
    if (persist) {
      const applied =
        next.tracks
          .find((tr) => tr.id === track.id)
          ?.clips.find((c) => c.id === selectedClip.id)?.gainDb ?? gainDb;
      setGainStatus(
        t("production.status.clipGain", { value: formatGainDb(applied) }),
      );
    }
  };

  const toggleMute = () => {
    onMixChange({
      ...mix,
      tracks: mix.tracks.map((tr) =>
        tr.id === track.id ? { ...tr, mute: !tr.mute } : tr,
      ),
    });
  };

  const toggleSolo = () => {
    onMixChange({
      ...mix,
      tracks: mix.tracks.map((tr) =>
        tr.id === track.id ? { ...tr, solo: !tr.solo } : tr,
      ),
    });
  };

  const toggleAuto = () => {
    const next = !autoVisible;
    setAutoVisible(next);
    setTrackAutomationVisible(track.id, next);
  };

  const body = (
    <>
      {!embedded && (
      <header className="anchored-popin-header">
        <h3 id={titleId}>
          {t("production.track.popover", { track: track.name })}
        </h3>
        <PopinCloseButton
          label={t("production.track.close")}
          onClick={onClose}
        />
      </header>
      )}

      <div
        className="production-track-settings-ms"
        role="group"
        aria-label={t("production.track.muteSolo", { track: track.name })}
      >
        <button
          type="button"
          className={
            track.mute
              ? "btn track-ms-btn track-ms-btn-m pressed"
              : "btn track-ms-btn track-ms-btn-m"
          }
          aria-pressed={track.mute}
          aria-label={t("production.track.mute", { track: track.name })}
          onClick={toggleMute}
          onKeyDown={(e) => {
            if (isMixMsActivationKey(e.key)) {
              e.preventDefault();
              toggleMute();
            }
          }}
        >
          {t("mix.mute")}
        </button>
        <button
          type="button"
          className={
            track.solo
              ? "btn track-ms-btn track-ms-btn-s pressed"
              : "btn track-ms-btn track-ms-btn-s"
          }
          aria-pressed={track.solo}
          aria-label={t("production.track.solo", { track: track.name })}
          onClick={toggleSolo}
          onKeyDown={(e) => {
            if (isMixMsActivationKey(e.key)) {
              e.preventDefault();
              toggleSolo();
            }
          }}
        >
          {t("mix.solo")}
        </button>
      </div>

      <div className="production-track-settings-fades" aria-labelledby={fadesId}>
        <p id={fadesId} className="production-track-settings-subhead">
          {t("production.track.fades")}
        </p>
        {!selectedClip ? (
          <p className="hint">{t("production.track.clipNone")}</p>
        ) : (
          <>
            <p className="hint">
              {t("production.track.clipSel", {
                n: clipIndex,
                time: formatMs(selectedClip.startMs),
              })}
            </p>
            <label className="phase3-field">
              <span>{t("clips.fadeIn")}</span>
              <input
                type="number"
                step={TIME_SNAP_MS}
                min={0}
                value={selectedClip.fadeInMs}
                aria-invalid={fadeError ? true : undefined}
                aria-describedby={fadeError ? "production-fade-err" : undefined}
                onChange={(e) => applyFade("fadeInMs", e.target.value)}
              />
            </label>
            <label className="phase3-field">
              <span>{t("clips.fadeOut")}</span>
              <input
                type="number"
                step={TIME_SNAP_MS}
                min={0}
                value={selectedClip.fadeOutMs}
                aria-invalid={fadeError ? true : undefined}
                aria-describedby={fadeError ? "production-fade-err" : undefined}
                onChange={(e) => applyFade("fadeOutMs", e.target.value)}
              />
            </label>
            {fadeError && (
              <p id="production-fade-err" className="error" role="alert">
                {fadeError}
              </p>
            )}
            <div className="production-track-settings-clip-gain">
              <p className="production-track-settings-subhead">
                {t("production.clip.gain")}
              </p>
              <MixSlider
                className="track-gain-slider"
                value={selectedClip.gainDb}
                min={CLIP_GAIN_DB_MIN}
                max={CLIP_GAIN_DB_MAX}
                step={CLIP_GAIN_DB_STEP}
                defaultValue={0}
                ariaLabel={t("production.clip.gainNamed", {
                  track: track.name,
                  n: clipIndex,
                })}
                valueText={formatGainDb(selectedClip.gainDb)}
                displayValue={formatGainDb(selectedClip.gainDb)}
                parseDisplay={parseGainDb}
                onChange={(gainDb) => applyGain(gainDb, false)}
                onCommit={(gainDb) => applyGain(gainDb, true)}
              />
            </div>
            <p
              className={gainStatus ? "hint" : "sr-only"}
              role="status"
              aria-live="polite"
            >
              {gainStatus}
            </p>
          </>
        )}
      </div>

      {!embedded && (
        <>
      <button type="button" className="btn" onClick={onOpenFxLine}>
        {t("production.track.moreEq")}
      </button>

      <button
        type="button"
        className="btn production-track-auto-toggle"
        aria-pressed={autoVisible}
        aria-expanded={autoVisible}
        aria-controls={`production-auto-${encodeURIComponent(track.id)}`}
        disabled={track.locked}
        title={track.locked?t("production.auto.locked"):undefined}
        onClick={toggleAuto}
      >
          {t("production.track.showAuto")}
        </button>
        {track.locked && <p className="hint">{t("production.auto.locked")}</p>}
        </>
      )}
        {onTranscribeBasicPitch ? (
          <div className="production-track-settings-basicpitch">
            <button
              type="button"
              className="btn"
              disabled={transcribing || track.locked || !trackHasAudioClip(track)}
              onClick={onTranscribeBasicPitch}
            >
              {transcribing ? t("basicPitch.busy") : t("basicPitch.action")}
            </button>
            <p className="hint">{t("basicPitch.hint")}</p>
            <p className="hint">{t(basicPitchQualityKey(track.role))}</p>
            {!trackHasAudioClip(track) ? (
              <p className="hint">{t("basicPitch.noAudio")}</p>
            ) : null}
          </div>
        ) : null}
    </>
  );

  if (embedded) {
    if (!open) return null;
    return <div className="production-track-settings-embedded">{body}</div>;
  }

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="production-track-settings-popin"
    >
      {body}
    </AnchoredPopin>
  );
}
