import { useId, useMemo, useRef, useState } from "react";
import type {
  GenerationSummary,
  ProjectDoc,
  SeparationVersionSummary,
} from "../lib/types";
import {
  buildTimeline,
  formatTakeDetails,
  renamedTakeTooltip,
  type VersionEventSource,
} from "../lib/versionHistory";
import { t } from "../ui/i18n";

type Props = {
  generations: GenerationSummary[];
  separations: SeparationVersionSummary[];
  scores?: VersionEventSource[];
  mixes?: VersionEventSource[];
  project: ProjectDoc;
  busy: boolean;
  onListen: (genId: string) => void;
  onActivateTake: (genId: string) => Promise<void>;
  onRetryTake?: (genId: string) => void;
  onActivateSeparation?: (separationId: string) => void;
  onRenameTake?: (genId: string, name: string) => Promise<void>;
  onSaveMixVersion?: () => void;
  onRevertSeparation?: () => void;
};

type RestoreUndo = {
  previousId: string;
};

export function VersionHistory({
  generations,
  separations,
  scores = [],
  mixes = [],
  project,
  busy,
  onListen,
  onActivateTake,
  onRetryTake,
  onActivateSeparation,
  onRenameTake,
  onSaveMixVersion,
  onRevertSeparation,
}: Props) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [restoreUndo, setRestoreUndo] = useState<RestoreUndo | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const listId = useId();
  const genById = useMemo(
    () => new Map(generations.map((g) => [g.id, g])),
    [generations],
  );

  const groups = useMemo(
    () =>
      buildTimeline({
        generations,
        separations,
        scores,
        mixes,
        activeGenerationId: project.activeGenerationId,
        style: project.style,
        customNames: project.generationNames,
        labels: {
          fromParent: (parentTitle) =>
            t("versions.fromParent", { parent: parentTitle }),
          separation: t("versions.event.separation"),
          separationAgain: t("versions.event.separationAgain"),
          mix: t("versions.event.mix"),
          score: t("versions.event.score"),
        },
      }),
    [
      generations,
      separations,
      scores,
      mixes,
      project.activeGenerationId,
      project.style,
      project.generationNames,
    ],
  );

  function focusTake(id: string) {
    setHighlightId(id);
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.focus();
  }

  async function commitRename(genId: string) {
    if (!onRenameTake) {
      setRenamingId(null);
      return;
    }
    await onRenameTake(genId, renameDraft.trim());
    setRenamingId(null);
  }

  function cancelRename() {
    setRenamingId(null);
  }

  async function handleRestore(genId: string) {
    const previousId = project.activeGenerationId;
    if (!previousId || previousId === genId) return;
    await onActivateTake(genId);
    setRestoreUndo({ previousId });
  }

  async function undoRestore() {
    if (!restoreUndo) return;
    await onActivateTake(restoreUndo.previousId);
    setRestoreUndo(null);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  if (generations.length === 0 && separations.length === 0) {
    return (
      <div className="version-history-panel">
        <p className="hint">{t("versions.empty")}</p>
      </div>
    );
  }

  return (
    <div className="version-history-panel">
      <p className="hint">{t("versions.hint")}</p>

      {restoreUndo && (
        <div className="version-restore-undo" role="status">
          <span>{t("versions.restoreUndo")}</span>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void undoRestore()}
          >
            {t("versions.restoreUndoAction")}
          </button>
        </div>
      )}

      {(onSaveMixVersion || onRevertSeparation) && (
        <div className="version-history-actions" role="group">
          {onRevertSeparation && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onRevertSeparation}
            >
              {t("separation.revert.action")}
            </button>
          )}
          {onSaveMixVersion && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy || !project.activeMixId}
              onClick={onSaveMixVersion}
            >
              {t("versions.saveMix")}
            </button>
          )}
        </div>
      )}

      {groups.map((group) => (
        <section
          key={group.dayKey}
          className="version-day"
          aria-labelledby={`${listId}-${group.dayKey}`}
        >
          <h2 className="version-day-label" id={`${listId}-${group.dayKey}`}>
            {group.dayLabel}
          </h2>
          <ol className="version-timeline">
            {group.items.map((item) => {
              if (item.type === "event") {
                const { event } = item;
                return (
                  <li
                    key={event.id}
                    className={`version-between version-between-global${event.isActive ? " active" : ""}`}
                    data-global-event={event.isGlobal ? "true" : undefined}
                    aria-label={
                      event.isGlobal
                        ? t("versions.event.separationGlobal")
                        : undefined
                    }
                  >
                    <div className="version-between-rail" aria-hidden="true">
                      <span className="version-between-dot" />
                    </div>
                    <div className="version-between-card">
                      <div className="version-event-main">
                        <strong>{event.title}</strong>
                        {event.when && (
                          <span className="version-when">{event.when}</span>
                        )}
                        {event.isActive && (
                          <span className="version-badge">
                            {t("versions.separations.active")}
                          </span>
                        )}
                      </div>
                      <div className="version-row-actions">
                        {event.kind === "separation" &&
                          event.isRepeatSeparation &&
                          onRevertSeparation && (
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busy}
                              onClick={onRevertSeparation}
                            >
                              {t("versions.separationRevert")}
                            </button>
                          )}
                        {event.kind === "separation" &&
                          event.activationId &&
                          onActivateSeparation &&
                          !event.isActive &&
                          !event.isRepeatSeparation && (
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busy}
                              onClick={() =>
                                onActivateSeparation(event.activationId!)
                              }
                            >
                              {t("versions.restore")}
                            </button>
                          )}
                        <DetailsDisclosure
                          label={t("versions.details")}
                          technicalId={event.technicalId}
                          onCopy={() => void copyText(event.technicalId)}
                        />
                      </div>
                    </div>
                  </li>
                );
              }

              const { take } = item;
              const highlighted = highlightId === take.id;
              const gen = genById.get(take.id);
              const titleTooltip = renamedTakeTooltip(take, (defaultName) =>
                t("versions.defaultNameTooltip", { name: defaultName }),
              );
              const detailsText = formatTakeDetails(take, gen, {
                defaultNameLabel: t("versions.details.defaultName"),
              });
              const listenLabel = t("generations.listen");
              const restoreLabel = t("versions.restoreTake", {
                title: take.title,
              });

              return (
                <li
                  key={take.id}
                  className={`version-take-row${take.isActive ? " active" : ""}${
                    take.isInterrupted ? " interrupted" : ""
                  }${highlighted ? " highlight" : ""}`}
                >
                  <article
                    aria-labelledby={`${listId}-take-${take.id}`}
                    className="version-take"
                    ref={(el) => {
                      if (el) rowRefs.current.set(take.id, el);
                      else rowRefs.current.delete(take.id);
                    }}
                    tabIndex={-1}
                  >
                    <div className="version-take-rail" aria-hidden="true">
                      <span className="version-take-dot">
                        {take.isInterrupted ? "!" : take.isActive ? "✓" : ""}
                      </span>
                    </div>
                    <div className="version-take-card">
                      <header className="version-take-header">
                        <div className="version-take-main">
                          {renamingId === take.id ? (
                            <div className="version-rename">
                              <label>
                                <span className="sr-only">
                                  {t("versions.renameLabel")}
                                </span>
                                <input
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(e) =>
                                    setRenameDraft(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void commitRename(take.id);
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void commitRename(take.id)}
                              >
                                {t("versions.renameSave")}
                              </button>
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={cancelRename}
                              >
                                {t("versions.renameCancel")}
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3
                                id={`${listId}-take-${take.id}`}
                                title={titleTooltip}
                              >
                                {take.title}
                              </h3>
                              {take.when && (
                                <span className="version-when">{take.when}</span>
                              )}
                            </>
                          )}
                          {take.styleSummary && (
                            <p className="version-style">{take.styleSummary}</p>
                          )}
                          {take.fromParent && take.parentId && (
                            <button
                              type="button"
                              className="version-from-parent"
                              onClick={() => focusTake(take.parentId!)}
                            >
                              {take.fromParent}
                            </button>
                          )}
                        </div>
                        <div className="version-take-actions">
                          {take.isActive ? (
                            <span className="version-active-badge">
                              <span aria-hidden="true">✓</span>
                              {t("versions.activeBadge")}
                            </span>
                          ) : take.isInterrupted ? (
                            onRetryTake && (
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => onRetryTake(take.id)}
                              >
                                {t("versions.interrupted.retry")}
                              </button>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || !take.hasAudio}
                                onClick={() => onListen(take.id)}
                              >
                                {listenLabel}
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void handleRestore(take.id)}
                              >
                                {restoreLabel}
                              </button>
                            </>
                          )}
                        </div>
                      </header>

                      {take.isInterrupted && (
                        <p className="version-interrupted-msg" role="status">
                          <span className="version-interrupted-icon" aria-hidden="true">
                            !
                          </span>
                          {t("versions.interrupted.title")}
                        </p>
                      )}

                      <ul className="version-content-pills" aria-label={t("versions.pills.label")}>
                        <ContentPill
                          label={t("versions.pill.music")}
                          present={take.hasMusic}
                        />
                        <ContentPill
                          label={t("versions.pill.score")}
                          present={take.hasScore}
                        />
                        <ContentPill
                          label={t("versions.pill.mix")}
                          present={take.hasMix}
                        />
                      </ul>

                      {take.inlineEvents.length > 0 && (
                        <ul className="version-inline-events">
                          {take.inlineEvents.map((ev) => (
                            <li key={ev.id}>
                              <span className="version-inline-icon" aria-hidden="true">
                                ·
                              </span>
                              <strong>{ev.title}</strong>
                              {ev.when && (
                                <span className="version-when">{ev.when}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      <footer className="version-take-footer">
                        {onRenameTake && renamingId !== take.id && (
                          <button
                            type="button"
                            className="btn ghost version-rename-btn"
                            disabled={busy}
                            aria-label={t("versions.renameTake", {
                              title: take.title,
                            })}
                            onClick={() => {
                              setRenamingId(take.id);
                              setRenameDraft(take.title);
                            }}
                          >
                            {t("versions.rename")}
                          </button>
                        )}
                        <DetailsDisclosure
                          label={t("versions.details")}
                          technicalId={detailsText}
                          onCopy={() => void copyText(detailsText)}
                        />
                      </footer>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ContentPill({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  const stateLabel = present
    ? t("versions.pill.present")
    : t("versions.pill.absent");
  return (
    <li
      className={`version-pill${present ? "" : " missing"}`}
      aria-label={`${label}, ${stateLabel}`}
    >
      <span aria-hidden="true">{present ? "✓" : "–"}</span>
      {label}
    </li>
  );
}

function DetailsDisclosure({
  label,
  technicalId,
  onCopy,
}: {
  label: string;
  technicalId: string;
  onCopy: () => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="version-details-wrap">
      <button
        type="button"
        className="version-details-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="version-details-chevron" aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
        {label}
      </button>
      {open && (
        <div className="version-details-panel" id={panelId}>
          <pre className="mono hint">{technicalId}</pre>
          <button type="button" className="btn ghost" onClick={onCopy}>
            {t("versions.copyDetails")}
          </button>
        </div>
      )}
    </div>
  );
}
