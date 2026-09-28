import { startTransition, useDeferredValue, useMemo, useState } from "react";
import {
  alignAbcHeaders,
  formatKeyLabel,
  formatMeterLabel,
  parseModelMetaComment,
  type AbcAlignRequest,
} from "../lib/abcMetadata";
import { t } from "../ui/i18n";

/** Cap in-DOM text so WebView2 does not freeze on expand (#107). */
export const ABC_PREVIEW_MAX_LINES = 200;

function truncateLines(text: string, maxLines: number): {
  preview: string;
  truncated: boolean;
  totalLines: number;
} {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { preview: text, truncated: false, totalLines: lines.length };
  }
  return {
    preview: lines.slice(0, maxLines).join("\n"),
    truncated: true,
    totalLines: lines.length,
  };
}

/** Truncated raw ABC block with copy-full (editor / preview surfaces). */
export function AbcRawPreview({
  abc,
  className = "score score-abc-raw",
}: {
  abc: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const deferred = useDeferredValue(abc);
  const display = useMemo(
    () => truncateLines(deferred, ABC_PREVIEW_MAX_LINES),
    [deferred],
  );

  async function copyFull() {
    try {
      await navigator.clipboard.writeText(abc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="abc-take-preview">
      <pre className={className}>{display.preview}</pre>
      <div className="btn-row abc-take-actions">
        {display.truncated && (
          <span className="hint">
            {t("score.abcPreview.truncated", {
              shown: ABC_PREVIEW_MAX_LINES,
              total: display.totalLines,
            })}
          </span>
        )}
        <button type="button" className="btn" onClick={() => void copyFull()}>
          {copied ? t("score.abcPreview.copied") : t("score.abcPreview.copy")}
        </button>
      </div>
    </div>
  );
}

type Props = {
  abc: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: AbcAlignRequest;
};

/**
 * Lazy ABC take preview: mount body only when open, truncate long dumps,
 * align header metadata with the form request when present.
 */
export function AbcTakePreview({ abc, open, onOpenChange, request }: Props) {
  const [copied, setCopied] = useState(false);
  const deferredAbc = useDeferredValue(abc);
  const tempoBpm = request?.tempoBpm ?? null;
  const keyTonic = request?.key?.tonic ?? null;
  const keyMode = request?.key?.mode ?? null;
  const meterNum = request?.meter?.numerator ?? null;
  const meterDen = request?.meter?.denominator ?? null;

  const aligned = useMemo(() => {
    if (!deferredAbc) return null;
    const req: AbcAlignRequest = {
      tempoBpm,
      key:
        keyTonic && keyMode
          ? { tonic: keyTonic, mode: keyMode }
          : null,
      meter:
        meterNum != null && meterDen != null
          ? { numerator: meterNum, denominator: meterDen }
          : null,
    };
    return alignAbcHeaders(deferredAbc, req);
  }, [deferredAbc, tempoBpm, keyTonic, keyMode, meterNum, meterDen]);

  const display = useMemo(() => {
    if (!open || !aligned) return null;
    return truncateLines(aligned.abc, ABC_PREVIEW_MAX_LINES);
  }, [open, aligned]);

  const modelMeta = useMemo(() => {
    if (!aligned) return null;
    if (aligned.drifted.length > 0) {
      return aligned.before;
    }
    return parseModelMetaComment(aligned.abc);
  }, [aligned]);

  async function copyFull() {
    if (!aligned) return;
    try {
      await navigator.clipboard.writeText(aligned.abc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const driftNote = (() => {
    if (!modelMeta || !request) return null;
    const parts: string[] = [];
    if (
      request.tempoBpm != null &&
      modelMeta.tempoBpm != null &&
      request.tempoBpm !== modelMeta.tempoBpm
    ) {
      parts.push(
        t("score.abcMeta.tempoDrift", {
          requested: request.tempoBpm,
          actual: modelMeta.tempoBpm,
        }),
      );
    }
    if (request.key && modelMeta.key) {
      const reqLabel = formatKeyLabel(request.key);
      const gotLabel = formatKeyLabel(modelMeta.key);
      if (reqLabel !== gotLabel) {
        parts.push(
          t("score.abcMeta.keyDrift", {
            requested: reqLabel,
            actual: gotLabel,
          }),
        );
      }
    }
    if (request.meter && modelMeta.meter) {
      const reqLabel = formatMeterLabel(request.meter);
      const gotLabel = formatMeterLabel(modelMeta.meter);
      if (reqLabel !== gotLabel) {
        parts.push(
          t("score.abcMeta.meterDrift", {
            requested: reqLabel,
            actual: gotLabel,
          }),
        );
      }
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  return (
    <details
      open={open}
      onToggle={(e) => {
        const next = (e.target as HTMLDetailsElement).open;
        startTransition(() => onOpenChange(next));
      }}
    >
      <summary>{t("score.toggle")}</summary>
      {open && (
        <div className="abc-take-preview">
          {driftNote && (
            <p className="banner warn score-abc-meta" role="status">
              {t("score.abcMeta.aligned", { detail: driftNote })}
            </p>
          )}
          {!deferredAbc && <pre className="score">{t("score.empty")}</pre>}
          {deferredAbc && display && (
            <>
              <pre className="score">{display.preview}</pre>
              <div className="btn-row abc-take-actions">
                {display.truncated && (
                  <span className="hint">
                    {t("score.abcPreview.truncated", {
                      shown: ABC_PREVIEW_MAX_LINES,
                      total: display.totalLines,
                    })}
                  </span>
                )}
                <button type="button" className="btn" onClick={() => void copyFull()}>
                  {copied ? t("score.abcPreview.copied") : t("score.abcPreview.copy")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}
