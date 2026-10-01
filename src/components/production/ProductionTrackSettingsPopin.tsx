import {
  useEffect,
  useId,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { t } from "../../ui/i18n";
import {
  getProductionClipSelection,
  subscribeProductionClipSelection,
} from "../../lib/productionClipSelection";
import { applyClipFadeEdit } from "../../lib/mixClipFadeEdit";
import {
  isTrackAutomationVisible,
  setTrackAutomationVisible,
} from "../../lib/productionTrackAutomationVisible";
import { isMixMsActivationKey } from "../../lib/productionMixA11y";
import type { MixDoc, MixTrack } from "../../lib/types";
import { formatMsForClipLabel } from "../../lib/productionTimeFormat";

const TIME_SNAP_MS = 50;

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  track: MixTrack;
  mix: MixDoc;
  onMixChange: (next: MixDoc, opts?: { persist?: boolean }) => void;
  onOpenFxLine: () => void;
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
}: Props) {
  const titleId = useId();
  const fadesId = useId();
  const [clipSel, setClipSel] = useState(getProductionClipSelection());
  const [fadeError, setFadeError] = useState<string | null>(null);
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
      setFadeError(e instanceof Error ? e.message : String(e));
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

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="production-track-settings-popin"
    >
      <header className="anchored-popin-header">
        <h3 id={titleId}>
          {t("production.track.popover", { track: track.name })}
        </h3>
        <button type="button" className="btn" onClick={onClose}>
          {t("production.track.close")}
        </button>
      </header>

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
                time: formatMsForClipLabel(selectedClip.startMs),
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
                onChange={(e) => applyFade("fadeOutMs", e.target.value)}
              />
            </label>
            {fadeError && (
              <p id="production-fade-err" className="error" role="alert">
                {fadeError}
              </p>
            )}
          </>
        )}
      </div>

      <button type="button" className="btn" onClick={onOpenFxLine}>
        {t("production.track.moreEq")}
      </button>

      <button
        type="button"
        className="btn production-track-auto-toggle"
        aria-pressed={autoVisible}
        onClick={toggleAuto}
      >
        {t("production.track.showAuto")}
      </button>
    </AnchoredPopin>
  );
}
