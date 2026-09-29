import { useEffect, useId, useMemo, useRef, useState } from "react";
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
};

/**
 * Unified export screen (#168): format-aware options (hide unused),
 * folder vs zip always, mix + stems in one place.
 * Maquette Alphonse absente — UI alignée Production.
 */
export function ExportDialog({
  project,
  mix,
  sources,
  busy,
  onBusy,
  onError,
  initialMode = "mix",
}: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [opts, setOpts] = useState<ExportOptionsState>(() => ({
    ...defaultExportOptions(),
    mode: initialMode,
  }));
  const aiTracks = useMemo(
    () => (mix?.tracks ?? []).filter((tr) => tr.aiSeparated),
    [mix?.id, mix?.tracks],
  );
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setOpts((prev) => ({ ...prev, mode: initialMode }));
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

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onExport = async () => {
    onBusy(true);
    onError(null);
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
        if (path) window.alert(path);
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
        if (path) window.alert(path);
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
    try {
      const paths = await exportAlignedStems(project.id, mix, sources, {
        format: opts.format,
        selectedTrackIds: selected,
        includeMaster: true,
        bitDepth: opts.bitDepth,
      });
      window.alert(paths.join("\n"));
      setOpen(false);
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
        disabled={!project.activeGenerationId || busy}
        onClick={() => setOpen(true)}
      >
        {t("export.button")}
      </button>
      <AnchoredPopin
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        labelId={titleId}
        className="export-dialog-popin"
      >
        <header className="anchored-popin-header">
          <h3 id={titleId}>{t("export.dialog.title")}</h3>
          <p className="hint">{t("export.dialog.intro")}</p>
          <p className="hint mockup-note">{t("export.dialog.mockupMissing")}</p>
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
            <label id="export-format-label" htmlFor="export-format-select">
              {t("export.dialog.formatLabel")}
            </label>
            <select
              id="export-format-select"
              aria-labelledby="export-format-label"
              value={opts.format}
              data-testid="export-format"
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

        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setOpen(false)}
          >
            {t("export.tracks.cancel")}
          </button>
          {opts.mode === "mix" && mix && sources && opts.format !== "mp3" && (
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
            disabled={
              busy ||
              (opts.mode === "stems" &&
                (selected.length === 0 || aiTracks.length === 0))
            }
            aria-disabled={
              busy ||
              (opts.mode === "stems" &&
                (selected.length === 0 || aiTracks.length === 0))
            }
            aria-describedby={
              opts.mode === "stems" &&
              (selected.length === 0 || aiTracks.length === 0)
                ? "export-download-disabled-reason"
                : undefined
            }
            onClick={() => void onExport()}
          >
            {t("export.tracks.run")}
          </button>
          {opts.mode === "stems" &&
            (selected.length === 0 || aiTracks.length === 0) && (
              <p id="export-download-disabled-reason" className="hint" role="note">
                {t("export.dialog.downloadDisabled")}
              </p>
            )}
        </div>
      </AnchoredPopin>
    </>
  );
}
