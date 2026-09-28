import { useEffect, useMemo, useState } from "react";
import type { MixDoc, PlaybackSources, ProjectDoc } from "../lib/types";
import {
  exportAlignedStems,
  exportPortablePackage,
  formatBytes,
  planPortablePackage,
} from "../lib/exportMix";
import type { PortablePackagePlan } from "../lib/projectPackage";
import { estimatePcmByteSize } from "@song-maker/mix-production";
import { t } from "../ui/i18n";

type Props = {
  project: ProjectDoc;
  mix: MixDoc | null;
  sources: PlaybackSources | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
};

/**
 * Stem batch export + portable package wizard (#99).
 */
export function ExportWizard({
  project,
  mix,
  sources,
  busy,
  onBusy,
  onError,
}: Props) {
  const tracks = mix?.tracks ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<"wav" | "flac">("wav");
  const [includeMaster, setIncludeMaster] = useState(true);
  const [plan, setPlan] = useState<PortablePackagePlan | null>(null);
  const [resultPaths, setResultPaths] = useState<string[]>([]);

  useEffect(() => {
    setSelected(tracks.map((tr) => tr.id));
  }, [mix?.id]);

  const durationSec = useMemo(() => {
    if (!mix || !sources?.stems?.length) return 0;
    // Rough: use sampleRate and a placeholder; UI estimate only.
    return Math.max(1, project.targetDurationSec ?? 180);
  }, [mix, sources, project.targetDurationSec]);

  const estimate = useMemo(() => {
    const sr = mix?.sampleRate || 48000;
    const frames = Math.round(durationSec * sr);
    const perStem = estimatePcmByteSize(frames, 2, 24);
    const count = selected.length + (includeMaster ? 1 : 0);
    return perStem * count;
  }, [durationSec, mix?.sampleRate, selected.length, includeMaster]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onExportStems = async () => {
    if (!mix || !sources) return;
    onBusy(true);
    onError(null);
    setResultPaths([]);
    try {
      const paths = await exportAlignedStems(project.id, mix, sources, {
        format,
        selectedTrackIds: selected,
        includeMaster,
      });
      setResultPaths(paths);
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  const onPlanPackage = async () => {
    onBusy(true);
    onError(null);
    try {
      const next = await planPortablePackage(project);
      setPlan(next);
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  const onExportPackage = async () => {
    onBusy(true);
    onError(null);
    try {
      const { path, plan: next } = await exportPortablePackage(project.id);
      setPlan(next);
      setResultPaths([path]);
    } catch (e) {
      onError(String(e));
    } finally {
      onBusy(false);
    }
  };

  return (
    <section className="export-wizard" aria-label={t("export.wizard.title")}>
      <header>
        <h3>{t("export.wizard.title")}</h3>
        <p className="hint">{t("export.wizard.intro")}</p>
      </header>

      <fieldset disabled={busy || !mix}>
        <legend>{t("export.stems.title")}</legend>
        <p className="hint">{t("export.stems.hint")}</p>
        <ul className="export-stem-list">
          {tracks.map((tr) => (
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
          {t("export.stems.format")}
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "wav" | "flac")}
          >
            <option value="wav">WAV 24 bits · {mix?.sampleRate || 48000} Hz</option>
            <option value="flac">FLAC 24 bits · {mix?.sampleRate || 48000} Hz</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeMaster}
            onChange={(e) => setIncludeMaster(e.target.checked)}
          />
          {t("export.stems.includeMaster")}
        </label>
        <p className="hint">
          {t("export.stems.estimate", { size: formatBytes(estimate) })}
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={busy || selected.length === 0 || !sources}
          onClick={() => void onExportStems()}
        >
          {t("export.stems.run")}
        </button>
      </fieldset>

      <fieldset disabled={busy}>
        <legend>{t("export.package.title")}</legend>
        <p className="hint">{t("export.package.hint")}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void onPlanPackage()}
          >
            {t("export.package.plan")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void onExportPackage()}
          >
            {t("export.package.run")}
          </button>
        </div>
        {plan && (
          <div className="export-package-summary">
            <p>
              {t("export.package.summary", {
                files: String(plan.artifacts.filter((a) => a.included).length),
                size: formatBytes(plan.estimatedBytes),
                excluded: formatBytes(plan.excludedBytes),
              })}
            </p>
            {plan.missing.length > 0 && (
              <p className="hint" role="status">
                {t("export.package.missing", {
                  count: String(plan.missing.length),
                })}
              </p>
            )}
            <ul>
              {plan.licenses.map((lic) => (
                <li key={lic.id}>
                  <strong>{lic.label}</strong> — {lic.summary}
                </li>
              ))}
            </ul>
            <ul className="hint">
              {plan.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      {resultPaths.length > 0 && (
        <div className="export-results" role="status">
          <p>{t("export.wizard.done")}</p>
          <ul>
            {resultPaths.map((p) => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
