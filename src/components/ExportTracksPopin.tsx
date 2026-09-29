import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MixDoc } from "../lib/types";
import { api } from "../lib/api";
import { t } from "../ui/i18n";
import { AnchoredPopin } from "./AnchoredPopin";

type Props = {
  projectId: string;
  mix: MixDoc | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
};

export function ExportTracksPopin({
  projectId,
  mix,
  busy,
  onBusy,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const aiTracks = useMemo(
    () => (mix?.tracks ?? []).filter((tr) => tr.aiSeparated),
    [mix?.id, mix?.tracks],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [pack, setPack] = useState<"folder" | "zip">("folder");

  useEffect(() => {
    setSelected(aiTracks.map((tr) => tr.id));
  }, [mix?.id, aiTracks]);

  const disabledReason =
    !mix || aiTracks.length === 0
      ? t("export.tracks.disabledNoStems")
      : null;

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onExport = async () => {
    if (!mix || selected.length === 0) return;
    onBusy(true);
    onError(null);
    try {
      const path = await api.exportSeparationStems(projectId, {
        trackIds: selected,
        pack,
        destination: null,
      });
      if (path) window.alert(path);
      setOpen(false);
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn"
        disabled={!!disabledReason || busy}
        title={disabledReason ?? undefined}
        aria-disabled={!!disabledReason}
        onClick={() => setOpen(true)}
      >
        {t("export.tracks.button")}
      </button>
      {disabledReason && (
        <span className="hint export-tracks-disabled-reason" role="status">
          {disabledReason}
        </span>
      )}
      <AnchoredPopin
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        labelId={titleId}
        className="export-tracks-popin"
      >
        <header className="anchored-popin-header">
          <h3 id={titleId}>{t("export.tracks.title")}</h3>
          <p className="hint">{t("export.tracks.hint")}</p>
        </header>
        <fieldset disabled={busy || !mix}>
          <legend className="sr-only">{t("export.tracks.title")}</legend>
          <p className="hint">{t("export.tracks.selection")}</p>
          <ul className="export-stem-list">
            {aiTracks.map((tr) => (
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
          <label>
            {t("export.tracks.pack")}
            <select
              value={pack}
              onChange={(e) => setPack(e.target.value as "folder" | "zip")}
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
            <button
              type="button"
              className="btn primary"
              disabled={selected.length === 0}
              onClick={() => void onExport()}
            >
              {t("export.tracks.run")}
            </button>
          </div>
        </fieldset>
      </AnchoredPopin>
    </>
  );
}
