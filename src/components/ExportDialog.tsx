import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { MixDoc, PlaybackSources, ProjectDoc } from "../lib/types";
import { api } from "../lib/api";
import {
  exportAlignedStems,
  exportProjectAudio,
} from "../lib/exportMix";
import {
  defaultExportOptions,
  visibleExportControls,
  type ExportFormat,
  type ExportMode,
  type ExportOptionsState,
  type ExportPack,
} from "../lib/exportOptions";
import { t } from "../ui/i18n";
import { AnchoredPopin } from "./AnchoredPopin";

type Props = {
  project: ProjectDoc;
  mix: MixDoc | null;
  sources: PlaybackSources | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  /** Open directly on stems mode (absorbs « Exporter les pistes »). */
  initialMode?: ExportMode;
  /** Ancre externe (tiroir production, harness capture). */
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

/**
 * Unified export screen (#168 / #187): format-aware options, sticky footer,
 * sole audio export UI — portable package stays on the Tools panel.
 */
export function ExportDialog({
  project,
  mix,
  sources,
  busy,
  onBusy,
  onError,
  initialMode = "mix",
  triggerRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const internalAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef = triggerRef ?? internalAnchorRef;
  const titleId = useId();
  const formatId = useId();
  const formatLiveId = useId();
  const exportDisabledId = useId();
  const triggerDisabledId = useId();
  const [opts, setOpts] = useState<ExportOptionsState>(() => ({
    ...defaultExportOptions(),
    mode: initialMode,
  }));
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const aiTracks = useMemo(
    () => (mix?.tracks ?? []).filter((tr) => tr.aiSeparated),
    [mix?.id, mix?.tracks],
  );
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setOpts((prev) => ({ ...prev, mode: initialMode }));
      setResultMessage(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    setSelected(
      opts.mode === "stems"
        ? aiTracks.map((tr) => tr.id)
        : (mix?.tracks ?? []).map((tr) => tr.id),
    );
  }, [mix?.id, opts.mode, aiTracks]);

  const controls = visibleExportControls(opts.format);
  const hasExportAudio = Boolean(project.activeGenerationId) || Boolean(
    project.activeMixId && mix?.tracks.some(track =>
      track.clips.some(clip => clip.sourcePath && Number.isFinite(clip.durationMs) && clip.durationMs > 0)),
  );
  const triggerDisabledReason = !hasExportAudio
    ? t("export.button.disabledNoAudio")
    : busy ? t("export.button.disabledBusy") : null;

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const stemsExportBlocked =
    opts.mode === "stems" &&
    (selected.length === 0 || aiTracks.length === 0);
  const exportDisabledReason = useMemo(() => {
    if (opts.mode !== "stems") return null;
    if (aiTracks.length === 0) return t("export.tracks.disabledNoStems");
    if (selected.length === 0) return t("export.tracks.disabledNoneSelected");
    return null;
  }, [opts.mode, aiTracks.length, selected.length]);
  const exportBlockedNotBusy = Boolean(exportDisabledReason) && !busy;
  const showAlignedStems =
    opts.mode === "mix" && mix && sources && opts.format !== "mp3";

  const onExport = async () => {
    if (stemsExportBlocked) return;
    onBusy(true);
    onError(null);
    setResultMessage(null);
    try {
      if (opts.mode === "stems") {
        if (!mix || selected.length === 0) {
          onError(t("export.tracks.disabledNoStems"));
          return;
        }
        const path = await api.exportSeparationStems(project.id, {
          trackIds: selected,
          pack: opts.pack,
          destination: null,
        });
        if (path) {
          setResultMessage(t("export.dialog.result", { path }));
          return;
        }
      } else {
        const path = await exportProjectAudio(
          project.id,
          opts.format,
          mix,
          sources,
          {
            bitDepth: controls.showBitDepth ? opts.bitDepth : undefined,
            bitrateKbps: controls.showBitrate ? opts.bitrateKbps : undefined,
            pack: opts.pack,
          },
        );
        if (path) {
          setResultMessage(t("export.dialog.result", { path }));
          return;
        }
      }
      setOpen(false);
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  const onExportAligned = async () => {
    if (!mix || !sources || selected.length === 0) return;
    if (opts.format === "mp3") {
      onError(t("export.stems.mp3Unsupported"));
      return;
    }
    onBusy(true);
    onError(null);
    setResultMessage(null);
    try {
      const paths = await exportAlignedStems(project.id, mix, sources, {
        format: opts.format,
        selectedTrackIds: selected,
        includeMaster: true,
        bitDepth: opts.bitDepth,
      });
      setResultMessage(
        t("export.dialog.result", { path: paths.join("\n") }),
      );
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  const trackList = opts.mode === "stems" ? aiTracks : (mix?.tracks ?? []);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn primary"
        data-capture-export-trigger="1"
        disabled={!hasExportAudio || busy}
        aria-describedby={triggerDisabledReason ? triggerDisabledId : undefined}
        title={triggerDisabledReason ?? undefined}
        onClick={() => setOpen(true)}
      >
        {t("export.button")}
      </button>
      {triggerDisabledReason && <span id={triggerDisabledId} className="sr-only">{triggerDisabledReason}</span>}
      <AnchoredPopin
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        labelId={titleId}
        className="export-dialog-popin"
      >
        <div className="anchored-popin-scroll">
          <header className="anchored-popin-header">
            <h3 id={titleId}>{t("export.dialog.title")}</h3>
            <p className="hint">{t("export.dialog.intro")}</p>
          </header>

          <fieldset disabled={busy}>
            <legend>{t("export.dialog.mode")}</legend>
            <label>
              <input
                type="radio"
                name="export-mode"
                checked={opts.mode === "mix"}
                onChange={() => setOpts((o) => ({ ...o, mode: "mix" }))}
              />
              {t("export.dialog.mode.mix")}
            </label>
            <label>
              <input
                type="radio"
                name="export-mode"
                checked={opts.mode === "stems"}
                onChange={() => setOpts((o) => ({ ...o, mode: "stems" }))}
              />
              {t("export.dialog.mode.stems")}
            </label>
          </fieldset>

          {opts.mode === "mix" && (
            <fieldset disabled={busy} data-testid="export-format-family">
              <legend>{t("export.stems.format")}</legend>
              <label htmlFor={formatId}>
                {t("export.dialog.formatLabel")}
                <select
                  id={formatId}
                  value={opts.format}
                  data-testid="export-format"
                  aria-describedby={formatLiveId}
                  onChange={(e) =>
                    setOpts((o) => ({
                      ...o,
                      format: e.target.value as ExportFormat,
                    }))
                  }
                >
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                  <option value="mp3">MP3</option>
                </select>
              </label>
              <p
                id={formatLiveId}
                className="sr-only"
                role="status"
                aria-live="polite"
                data-testid="export-format-live"
              >
                {t("export.dialog.formatLive", {
                  format: opts.format.toUpperCase(),
                })}
              </p>
              {controls.showBitDepth && (
                <label data-testid="export-bit-depth">
                  {t("export.dialog.bitDepth")}
                  <select
                    value={opts.bitDepth}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        bitDepth: Number(e.target.value) as 16 | 24,
                      }))
                    }
                  >
                    <option value={16}>16 bits</option>
                    <option value={24}>24 bits</option>
                  </select>
                </label>
              )}
              {controls.showBitrate && (
                <label data-testid="export-bitrate">
                  {t("export.dialog.bitrate")}
                  <select
                    value={opts.bitrateKbps}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        bitrateKbps: Number(e.target.value) as 128 | 192 | 320,
                      }))
                    }
                  >
                    <option value={128}>128 kb/s</option>
                    <option value={192}>192 kb/s</option>
                    <option value={320}>320 kb/s</option>
                  </select>
                </label>
              )}
              {!controls.showBitDepth && (
                <span data-testid="export-bit-depth-hidden" hidden />
              )}
              {!controls.showBitrate && (
                <span data-testid="export-bitrate-hidden" hidden />
              )}
            </fieldset>
          )}

          {opts.mode === "stems" && (
            <>
              <p className="hint">{t("export.tracks.hint")}</p>
              <ul className="export-stem-list">
                {trackList.map((tr) => (
                  <li key={tr.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(tr.id)}
                        onChange={() => toggle(tr.id)}
                      />
                      {tr.name} ({tr.role})
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <label data-testid="export-pack">
            {t("export.tracks.pack")}
            <select
              value={opts.pack}
              onChange={(e) =>
                setOpts((o) => ({
                  ...o,
                  pack: e.target.value as ExportPack,
                }))
              }
            >
              <option value="folder">{t("export.tracks.packFolder")}</option>
              <option value="zip">{t("export.tracks.packZip")}</option>
            </select>
          </label>
        </div>

        <div className="anchored-popin-footer" data-testid="export-dialog-footer">
          {exportDisabledReason && (
            <p
              id={exportDisabledId}
              className="hint export-dialog-disabled-reason"
              role="status"
              data-testid="export-disabled-reason"
            >
              {exportDisabledReason}
            </p>
          )}
          {resultMessage && (
            <p
              className="export-dialog-result"
              role="status"
              data-testid="export-result"
            >
              {resultMessage}
            </p>
          )}
          <div className="export-dialog-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setOpen(false)}
            >
              {t("export.tracks.cancel")}
            </button>
            <div className="export-dialog-actions-end">
              {showAlignedStems && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onExportAligned()}
                >
                  {t("export.stems.run")}
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                data-testid="export-run"
                disabled={busy}
                aria-disabled={exportBlockedNotBusy || undefined}
                aria-describedby={
                  exportDisabledReason ? exportDisabledId : undefined
                }
                onClick={() => {
                  if (exportBlockedNotBusy || stemsExportBlocked) return;
                  void onExport();
                }}
              >
                {t("export.tracks.run")}
              </button>
            </div>
          </div>
        </div>
      </AnchoredPopin>
    </>
  );
}
