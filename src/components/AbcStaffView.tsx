import { useEffect, useRef, useState } from "react";
import * as abcjs from "abcjs";
import type { NoteTimingEvent, TimingCallbacks } from "abcjs";
import { t } from "../ui/i18n";

const SCALE_MIN = 0.6;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.15;

export type AbcStaffViewProps = {
  /** ABC source already validated / proposed — never invented here. */
  abc: string;
  /** Playback position in seconds (from AudioPlayer). */
  playbackSeconds?: number;
  playbackReady?: boolean;
  /** Seek audio when the user clicks a note/measure (seconds). */
  onSeek?: (seconds: number) => void;
  /** Optional warnings from export / abcjs. */
  warnings?: string[];
  compact?: boolean;
};

function clearHighlights(root: HTMLElement | null) {
  if (!root) return;
  root
    .querySelectorAll(".abcjs-note_selected, .abcjs-highlight")
    .forEach((el) => {
      el.classList.remove("abcjs-note_selected", "abcjs-highlight");
    });
}

function highlightEvent(ev: NoteTimingEvent | null, root: HTMLElement | null) {
  clearHighlights(root);
  if (!ev?.elements) return;
  for (const set of ev.elements) {
    for (const el of set) {
      el.classList.add("abcjs-note_selected", "abcjs-highlight");
    }
  }
  const first = ev.elements[0]?.[0];
  if (first && typeof first.scrollIntoView === "function") {
    first.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }
}

/**
 * Readable ABC staff with playback cursor and click-to-seek.
 */
export function AbcStaffView({
  abc,
  playbackSeconds = 0,
  playbackReady = false,
  onSeek,
  warnings = [],
  compact = false,
}: AbcStaffViewProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const timingRef = useRef<TimingCallbacks | null>(null);
  const lastHighlightKey = useRef<string>("");
  const onSeekRef = useRef(onSeek);
  const playbackReadyRef = useRef(playbackReady);
  const playbackSecondsRef = useRef(playbackSeconds);
  onSeekRef.current = onSeek;
  playbackReadyRef.current = playbackReady;
  playbackSecondsRef.current = playbackSeconds;

  const [scale, setScale] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderWarnings, setRenderWarnings] = useState<string[]>([]);
  const [seekHint, setSeekHint] = useState<string | null>(null);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;

    timingRef.current?.stop();
    timingRef.current = null;
    lastHighlightKey.current = "";
    paper.innerHTML = "";
    setRenderError(null);
    setRenderWarnings([]);
    setSeekHint(null);

    const trimmed = abc.trim();
    if (!trimmed) {
      setRenderError(t("score.staff.emptyAbc"));
      return;
    }

    try {
      const tunes = abcjs.renderAbc(paper, trimmed, {
        add_classes: true,
        responsive: "resize",
        scale,
        paddingtop: 8,
        paddingbottom: 8,
        paddingleft: 8,
        paddingright: 8,
        viewportHorizontal: true,
        clickListener: (abcElem) => {
          const ms = abcElem?.currentTrackMilliseconds;
          if (typeof ms !== "number" || !Number.isFinite(ms)) {
            setSeekHint(t("score.staff.seekUnavailable"));
            return;
          }
          if (!playbackReadyRef.current || !onSeekRef.current) {
            setSeekHint(t("score.staff.seekNoAudio"));
            return;
          }
          setSeekHint(null);
          onSeekRef.current(Math.max(0, ms / 1000));
        },
      });

      const tune = tunes[0];
      if (!tune) {
        setRenderError(t("score.staff.renderFailed"));
        return;
      }

      const abcWarnings = tune.warnings ?? [];
      setRenderWarnings(abcWarnings);

      const timing = new abcjs.TimingCallbacks(tune, {
        qpm: tune.getBpm(),
        eventCallback: (ev) => {
          const key =
            ev == null
              ? "end"
              : `${ev.milliseconds}|${ev.measureNumber ?? ""}|${ev.left ?? ""}`;
          if (key === lastHighlightKey.current) return "continue";
          lastHighlightKey.current = key;
          highlightEvent(ev, paper);
          return "continue";
        },
      });
      timingRef.current = timing;
      timing.setProgress(playbackSecondsRef.current, "seconds");
    } catch (e) {
      paper.innerHTML = "";
      timingRef.current = null;
      setRenderError(String(e));
    }

    return () => {
      timingRef.current?.stop();
      timingRef.current = null;
      clearHighlights(paper);
    };
  }, [abc, scale]);

  useEffect(() => {
    const timing = timingRef.current;
    if (!timing) return;
    timing.setProgress(Math.max(0, playbackSeconds), "seconds");
  }, [playbackSeconds]);

  const allWarnings = [...warnings, ...renderWarnings];

  return (
    <div
      className={`abc-staff-view${compact ? " compact" : ""}`}
      role="region"
      aria-label={t("score.staff.region")}
    >
      <div
        className="abc-staff-toolbar"
        role="group"
        aria-label={t("score.staff.zoom")}
      >
        <button
          type="button"
          className="btn ghost"
          disabled={scale <= SCALE_MIN}
          onClick={() =>
            setScale((s) => Math.max(SCALE_MIN, +(s - SCALE_STEP).toFixed(2)))
          }
        >
          {t("score.staff.zoomOut")}
        </button>
        <span className="abc-staff-zoom-label">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={scale >= SCALE_MAX}
          onClick={() =>
            setScale((s) => Math.min(SCALE_MAX, +(s + SCALE_STEP).toFixed(2)))
          }
        >
          {t("score.staff.zoomIn")}
        </button>
        {!playbackReady && (
          <span className="hint">{t("score.staff.syncHint")}</span>
        )}
      </div>

      <div className="abc-staff-scroll">
        <div className="abc-staff-paper" ref={paperRef} />
      </div>

      {renderError && (
        <p className="score-issues error" role="alert">
          {t("score.staff.renderError")}: {renderError}
        </p>
      )}
      {seekHint && <p className="hint">{seekHint}</p>}
      {allWarnings.length > 0 && (
        <ul className="score-issues">
          {allWarnings.map((w, i) => (
            <li key={`sw-${i}`} className="warning">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
