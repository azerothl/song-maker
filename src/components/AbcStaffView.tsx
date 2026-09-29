import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import * as abcjs from "abcjs";
import type { NoteTimingEvent, TimingCallbacks } from "abcjs";
import {
  abcBarDurationSeconds,
  sliceAbcMeasures,
  splitAbcMeasures,
} from "../lib/staffAbc";
import { traceTiming } from "../lib/perfTrace";
import { t } from "../ui/i18n";

const SCALE_MIN = 0.6;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.15;

/**
 * Mesures composées d'un coup par abcjs.
 *
 * abcjs compose la portée de façon synchrone sur le thread principal : un
 * morceau de plusieurs minutes gèle l'interface plusieurs secondes à chaque
 * visite de l'onglet. On ne compose donc qu'une fenêtre, l'utilisateur
 * demande la suite explicitement.
 */
const MEASURES_PER_WINDOW = 24;

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

  // Retarde la composition : React peint d'abord l'onglet, puis abcjs compose
  // la fenêtre dans un rendu de priorité basse au lieu de bloquer l'arrivée.
  const deferredAbc = useDeferredValue(abc);
  const isStale = deferredAbc !== abc;

  const [windowStart, setWindowStart] = useState(0);
  const [scale, setScale] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderWarnings, setRenderWarnings] = useState<string[]>([]);
  const [seekHint, setSeekHint] = useState<string | null>(null);

  const { totalBars, windowed, windowBars, barSeconds } = useMemo(() => {
    const splitStart = performance.now();
    const split = splitAbcMeasures(deferredAbc);
    traceTiming("splitAbcMeasures", splitStart, {
      bars: split.barCount,
      voices: split.blocks.length,
      windowable: split.windowable,
      abcChars: deferredAbc.length,
    });
    if (split.barCount === 0) {
      return { totalBars: 0, windowed: false, windowBars: 0, barSeconds: null };
    }
    const metric = abcBarDurationSeconds(split.header);
    // Sans métrique connue on ne sait pas replacer la lecture dans la
    // fenêtre, donc on compose le tune entier plutôt qu'un curseur faux.
    if (!split.windowable || metric == null) {
      return {
        totalBars: split.barCount,
        windowed: false,
        windowBars: split.barCount,
        barSeconds: metric,
      };
    }
    const step = compact
      ? Math.max(8, Math.floor(MEASURES_PER_WINDOW / 2))
      : MEASURES_PER_WINDOW;
    return {
      totalBars: split.barCount,
      windowed: true,
      windowBars: Math.min(step, split.barCount),
      barSeconds: metric,
    };
  }, [deferredAbc, compact]);

  const visibleAbc = useMemo(
    () => sliceAbcMeasures(deferredAbc, windowStart, windowBars),
    [deferredAbc, windowStart, windowBars],
  );

  // abcjs chronomètre la portion qu'il reçoit : on retire donc l'offset de la
  // fenêtre pour que le curseur et le clic-pour-seek visent le bon instant du
  // morceau entier.
  const windowOffsetSeconds = (barSeconds ?? 0) * windowStart;
  const windowOffsetRef = useRef(windowOffsetSeconds);
  windowOffsetRef.current = windowOffsetSeconds;

  // Un nouveau tune repart du début de la partition.
  useEffect(() => {
    setWindowStart(0);
  }, [deferredAbc]);

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

    const trimmed = visibleAbc.trim();
    if (!trimmed) {
      setRenderError(t("score.staff.emptyAbc"));
      return;
    }

    try {
      const renderStart = performance.now();
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
          onSeekRef.current(
            Math.max(0, ms / 1000 + windowOffsetRef.current),
          );
        },
      });

      const tune = tunes[0];
      traceTiming("abcjs.renderAbc", renderStart, {
        bars: windowBars,
        windowStart,
        totalBars,
        windowed,
        abcChars: trimmed.length,
        compact,
        scale,
      });
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
      timing.setProgress(
        Math.max(0, playbackSecondsRef.current - windowOffsetRef.current),
        "seconds",
      );
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
  }, [visibleAbc, scale]);

  useEffect(() => {
    const timing = timingRef.current;
    if (!timing) return;
    // abcjs chronomètre la fenêtre rendue : on retire son offset pour viser le
    // bon instant du morceau entier.
    timing.setProgress(
      Math.max(0, playbackSeconds - windowOffsetSeconds),
      "seconds",
    );
  }, [playbackSeconds, windowOffsetSeconds]);

  const allWarnings = [...warnings, ...renderWarnings];
  const canPage = windowed && windowStart + windowBars < totalBars;
  const hasPrevious = windowed && windowStart > 0;

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

      {isStale && (
        <p className="hint" role="status">
          {t("score.staff.composing")}
        </p>
      )}

      <div className="abc-staff-scroll">
        <div className="abc-staff-paper" ref={paperRef} />
      </div>

      {windowed && totalBars > windowBars && (
        <div
          className="abc-staff-pages"
          role="group"
          aria-label={t("score.staff.pages.nav")}
        >
          <button
            type="button"
            className="btn ghost"
            disabled={!hasPrevious}
            onClick={() =>
              setWindowStart((s) => Math.max(0, s - windowBars))
            }
          >
            {t("score.staff.pages.previous")}
          </button>
          <span className="abc-staff-zoom-label">
            {t("score.staff.pages.position", {
              from: windowStart + 1,
              to: Math.min(totalBars, windowStart + windowBars),
              total: totalBars,
            })}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={!canPage}
            onClick={() => setWindowStart((s) => s + windowBars)}
          >
            {t("score.staff.pages.next")}
          </button>
        </div>
      )}

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
