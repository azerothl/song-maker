import { useId, useMemo, useRef, useState } from "react";
import type {
  GenerationSummary,
  ProjectDoc,
  SeparationVersionSummary,
} from "../lib/types";
import {
  buildTimeline,
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
  onRestore: (genId: string) => void;
  onActivateSeparation?: (separationId: string) => void;
  onRenameTake?: (genId: string, name: string) => Promise<void>;
  onSaveMixVersion?: () => void;
  onRevertSeparation?: () => void;
};

export function VersionHistory({
  generations,
  separations,
  scores = [],
  mixes = [],
  project,
  busy,
  onListen,
  onRestore,
  onActivateSeparation,
  onRenameTake,
  onSaveMixVersion,
  onRevertSeparation,
}: Props) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const listId = useId();

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
          <h4 className="version-day-label" id={`${listId}-${group.dayKey}`}>
            {group.dayLabel}
          </h4>
          <ul className="version-timeline">
            {group.items.map((item) => {
              if (item.type === "event") {
                const { event } = item;
                return (
                  <li
                    key={event.id}
                    className={`version-event${event.isActive ? " active" : ""}`}
                  >
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
                        event.activationId &&
                        onActivateSeparation &&
                        !event.isActive && (
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
                      <details className="version-details">
                        <summary>{t("versions.details")}</summary>
                        <p className="mono hint">{event.technicalId}</p>
                      </details>
                    </div>
                  </li>
                );
              }

              const { take } = item;
              const highlighted = highlightId === take.id;
              return (
                <li
                  key={take.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(take.id, el);
                    else rowRefs.current.delete(take.id);
                  }}
                  tabIndex={-1}
                  className={`version-take${take.isActive ? " active" : ""}${
                    highlighted ? " highlight" : ""
                  }`}
                >
                  <div className="version-take-main">
                    {renamingId === take.id ? (
                      <label className="version-rename">
                        <span className="sr-only">
                          {t("versions.renameLabel")}
                        </span>
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitRename(take.id);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={() => void commitRename(take.id)}
                        />
                      </label>
                    ) : (
                      <strong>{take.title}</strong>
                    )}
                    {take.when && (
                      <span className="version-when">{take.when}</span>
                    )}
                    {take.styleSummary && (
                      <span className="version-style">{take.styleSummary}</span>
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
                    {take.isActive && (
                      <span className="version-badge">
                        {t("generations.playing")}
                      </span>
                    )}
                  </div>
                  <div className="version-row-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy || !take.hasAudio}
                      onClick={() => onListen(take.id)}
                    >
                      {t("generations.listen")}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || take.isActive}
                      onClick={() => onRestore(take.id)}
                    >
                      {take.isActive
                        ? t("generations.playing")
                        : t("versions.restore")}
                    </button>
                    {onRenameTake && renamingId !== take.id && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => {
                          setRenamingId(take.id);
                          setRenameDraft(take.title);
                        }}
                      >
                        {t("versions.rename")}
                      </button>
                    )}
                    <details className="version-details">
                      <summary>{t("versions.details")}</summary>
                      <p className="mono hint">{take.id}</p>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
