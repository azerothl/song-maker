import { useState } from "react";
import type { ProjectDoc } from "../lib/types";
import {
  exportPortablePackage,
  formatBytes,
  planPortablePackage,
} from "../lib/exportMix";
import type { PortablePackagePlan } from "../lib/projectPackage";
import { t } from "../ui/i18n";

type Props = {
  project: ProjectDoc;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
};

/**
 * Portable project package only (#99). Mix / stems export lives in ExportDialog (#168)
 * so there is no second export screen.
 */
export function ExportWizard({ project, busy, onBusy, onError }: Props) {
  const [plan, setPlan] = useState<PortablePackagePlan | null>(null);
  const [resultPaths, setResultPaths] = useState<string[]>([]);

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
    <section
      className="export-wizard"
      aria-label={t("export.package.title")}
      data-testid="portable-package-panel"
    >
      <header>
        <h3>{t("export.package.title")}</h3>
        <p className="hint">{t("export.package.hint")}</p>
      </header>

      <fieldset disabled={busy}>
        <legend className="sr-only">{t("export.package.title")}</legend>
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
