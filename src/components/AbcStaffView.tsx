import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as abcjs from "abcjs";
import { subscribePlaybackPosition } from "../lib/playbackPosition";
import type { NoteTimingEvent, TimingCallbacks } from "abcjs";
import {
  abcBarDurationSeconds,
  sanitizeAbcForStaffRender,
  sliceAbcMeasures,
  splitAbcMeasures,
  summarizeStaffRenderWarnings,
} from "../lib/staffAbc";
import {
  blendPxPerBar,
  computeStaffScrollWindow,
  DEFAULT_PX_PER_BAR,
  playbackBarIndex,
} from "../lib/staffWindow";
import {
  followPlaybackAfterPositionTick,
  staffScrollTopTo,
} from "../lib/staffScroll";
import { t } from "../ui/i18n";

const SCALE_MIN = 0.6;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.15;

/** Au-dessous de ce seuil, le tune entier est composé d'un coup. */
const MIN_TOTAL_BARS_FOR_WINDOW = 24;
const MIN_TOTAL_BARS_FOR_WINDOW_COMPACT = 12;

/** Cible abcjs : 3–4 mesures par système, largeur = panneau. */
const STAFF_WRAP = {
  preferredMeasuresPerLine: 4,
  minSpacing: 1.1,
  maxSpacing: 2.7,
} as const;

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

function highlightEvent(
  ev: NoteTimingEvent | null,
  root: HTMLElement | null,
  scrollEl: HTMLElement | null,
  followPlayback: boolean,
  reducedMotion: boolean,
) {
  clearHighlights(root);
  if (!ev?.elements) return;
  for (const set of ev.elements) {
    for (const el of set) {
      el.classList.add("abcjs-note_selected", "abcjs-highlight");
    }
  }
  if (!followPlayback || !scrollEl) return;

  const first = ev.elements[0]?.[0];
  if (!first) return;

  const staffLine =
    first.closest<SVGElement>(".abcjs-staff") ??
    first.closest<SVGElement>("g[class*='staff']");
  const scrollTarget = staffLine ?? first;

  const targetRect = scrollTarget.getBoundingClientRect();
  const viewRect = scrollEl.getBoundingClientRect();
  const margin = viewRect.height * 0.12;

  if (
    targetRect.top >= viewRect.top + margin &&
    targetRect.bottom <= viewRect.bottom - margin
  ) {
    return;
  }

  const targetTop =
    scrollEl.scrollTop +
    (targetRect.top - viewRect.top) -
    viewRect.height * 0.2;
  staffScrollTopTo(scrollEl, targetTop, reducedMotion);
}

/**
 * Readable ABC staff with playback cursor and click-to-seek.
 * Compose uniquement la fenêtre visible (+ marge) pour les partitions longues.
 */
export function AbcStaffView({
  abc,
  playbackSeconds = 0,
  playbackReady = false,
  onSeek,
  warnings = [],
  compact = false,
}: AbcStaffViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const timingRef = useRef<TimingCallbacks | null>(null);
  const lastHighlightKey = useRef<string>("");
  const onSeekRef = useRef(onSeek);
  const playbackReadyRef = useRef(playbackReady);
  const playbackSecondsRef = useRef(playbackSeconds);
  const windowOffsetRef = useRef(0);
  const pxPerBarRef = useRef(DEFAULT_PX_PER_BAR);
  const scrollRafRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const followPlaybackRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const prevPlaybackSecondsRef = useRef(playbackSeconds);

  onSeekRef.current = onSeek;
  playbackReadyRef.current = playbackReady;

  const [livePlaybackSeconds, setLivePlaybackSeconds] = useState(playbackSeconds);

  useEffect(() => {
    setLivePlaybackSeconds(playbackSeconds);
    playbackSecondsRef.current = playbackSeconds;
    setFollowPlayback((f) =>
      followPlaybackAfterPositionTick(
        prevPlaybackSecondsRef.current,
        playbackSeconds,
        f,
      ),
    );
    prevPlaybackSecondsRef.current = playbackSeconds;
  }, [playbackSeconds]);

  useEffect(() => {
    return subscribePlaybackPosition((t) => {
      playbackSecondsRef.current = t;
      setLivePlaybackSeconds(t);
      setFollowPlayback((f) =>
        followPlaybackAfterPositionTick(prevPlaybackSecondsRef.current, t, f),
      );
      prevPlaybackSecondsRef.current = t;
    });
  }, []);

  const deferredAbc = useDeferredValue(abc);
  const isStale = deferredAbc !== abc;
  const staffAbc = useMemo(
    () => sanitizeAbcForStaffRender(deferredAbc),
    [deferredAbc],
  );

  const [scale, setScale] = useState(1);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [staffWidth, setStaffWidth] = useState(640);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderWarnings, setRenderWarnings] = useState<string[]>([]);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [pxPerBar, setPxPerBar] = useState(DEFAULT_PX_PER_BAR);
  const [scrollWindow, setScrollWindow] = useState({
    renderStart: 0,
    renderCount: 0,
  });

  const split = useMemo(() => splitAbcMeasures(staffAbc), [staffAbc]);
  const barSeconds = useMemo(
    () => abcBarDurationSeconds(split.header),
    [split.header],
  );

  const windowing =
    split.windowable &&
    barSeconds != null &&
    split.barCount >
      (compact
        ? MIN_TOTAL_BARS_FOR_WINDOW_COMPACT
        : MIN_TOTAL_BARS_FOR_WINDOW);

  const applyScrollWindow = useCallback(() => {
    if (!windowing) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const next = computeStaffScrollWindow({
      scrollTop: scroll.scrollTop,
      viewportHeight: scroll.clientHeight || 420,
      barCount: split.barCount,
      pxPerBar: pxPerBarRef.current,
      minRenderBars: compact ? 12 : 20,
      maxRenderBars: compact ? 40 : 56,
    });
    setScrollWindow((prev) =>
      prev.renderStart === next.renderStart &&
      prev.renderCount === next.renderCount
        ? prev
        : next,
    );
  }, [windowing, split.barCount, compact]);

  const visibleAbc = useMemo(() => {
    if (!windowing) return staffAbc;
    const { renderStart, renderCount } =
      scrollWindow.renderCount > 0
        ? scrollWindow
        : computeStaffScrollWindow({
            scrollTop: 0,
            viewportHeight: 420,
            barCount: split.barCount,
            pxPerBar: pxPerBarRef.current,
            minRenderBars: compact ? 12 : 20,
            maxRenderBars: compact ? 40 : 56,
          });
    return sliceAbcMeasures(staffAbc, renderStart, renderCount);
  }, [staffAbc, windowing, scrollWindow, split.barCount, compact]);

  const windowOffsetSeconds =
    windowing && barSeconds != null
      ? barSeconds * scrollWindow.renderStart
      : 0;
  windowOffsetRef.current = windowOffsetSeconds;

  const virtualTrackHeight =
    windowing && split.barCount > 0
      ? split.barCount * pxPerBar
      : undefined;

  const paperTop =
    windowing && virtualTrackHeight != null
      ? scrollWindow.renderStart * pxPerBar
      : 0;

  useEffect(() => {
    followPlaybackRef.current = followPlayback;
  }, [followPlayback]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const pauseFollowOnUserScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    setFollowPlayback(false);
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const updateWidth = () => {
      setStaffWidth(Math.max(280, Math.floor(scroll.clientWidth - 24)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    pxPerBarRef.current = DEFAULT_PX_PER_BAR;
    setPxPerBar(DEFAULT_PX_PER_BAR);
    setScrollWindow({ renderStart: 0, renderCount: 0 });
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = 0;
  }, [staffAbc, scale]);

  useEffect(() => {
    if (!windowing) return;
    applyScrollWindow();
  }, [windowing, applyScrollWindow]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const onScroll = () => {
      pauseFollowOnUserScroll();
      if (!windowing) return;
      if (programmaticScrollRef.current) return;
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        applyScrollWindow();
      });
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    scroll.addEventListener("wheel", pauseFollowOnUserScroll, {
      passive: true,
    });
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      scroll.removeEventListener("wheel", pauseFollowOnUserScroll);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [windowing, applyScrollWindow, pauseFollowOnUserScroll]);

  useEffect(() => {
    if (!followPlayback || !windowing || barSeconds == null) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const bar = playbackBarIndex(livePlaybackSeconds, barSeconds);
    const targetY = bar * pxPerBarRef.current;
    const margin = scroll.clientHeight * 0.2;
    const top = scroll.scrollTop;
    const bottom = top + scroll.clientHeight;
    if (targetY >= top + margin && targetY <= bottom - margin) return;

    programmaticScrollRef.current = true;
    staffScrollTopTo(
      scroll,
      targetY - scroll.clientHeight * 0.35,
      reducedMotionRef.current,
    );
    applyScrollWindow();
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [
    livePlaybackSeconds,
    windowing,
    barSeconds,
    applyScrollWindow,
    followPlayback,
    reducedMotion,
  ]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;

    timingRef.current?.stop();
    timingRef.current = null;
    lastHighlightKey.current = "";
    paper.innerHTML = "";
    setRenderError(null);
    setRenderWarnings([]);
    setWarningsExpanded(false);
    setSeekHint(null);

    const trimmed = visibleAbc.trim();
    if (!trimmed) {
      setRenderError(t("score.staff.emptyAbc"));
      return;
    }

    try {
      // Défaut abcjs : responsive "off". "resize" recompose à chaque
      // redimensionnement et annule `scale`. Voir `pnpm bench:score-tab`.
      const tunes = abcjs.renderAbc(paper, trimmed, {
        add_classes: true,
        scale,
        paddingtop: 8,
        paddingbottom: 8,
        paddingleft: 8,
        paddingright: 8,
        staffwidth: staffWidth,
        wrap: STAFF_WRAP,
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
          highlightEvent(
            ev,
            paper,
            scrollRef.current,
            followPlaybackRef.current,
            reducedMotionRef.current,
          );
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
  }, [visibleAbc, scale, staffWidth]);

  useLayoutEffect(() => {
    if (!windowing) return;
    const paper = paperRef.current;
    if (!paper || scrollWindow.renderCount <= 0) return;
    const svg = paper.querySelector("svg");
    if (!svg) return;
    const measured = svg.getBoundingClientRect().height / scrollWindow.renderCount;
    const next = blendPxPerBar(
      pxPerBarRef.current,
      measured,
      scrollWindow.renderCount,
    );
    if (Math.abs(next - pxPerBarRef.current) > 0.5) {
      pxPerBarRef.current = next;
      setPxPerBar(next);
    }
  }, [visibleAbc, scale, windowing, scrollWindow]);

  useEffect(() => {
    const timing = timingRef.current;
    if (!timing) return;
    timing.setProgress(
      Math.max(0, livePlaybackSeconds - windowOffsetSeconds),
      "seconds",
    );
  }, [livePlaybackSeconds, windowOffsetSeconds]);

  const allWarnings = [...warnings, ...renderWarnings];
  const warningSummary = useMemo(
    () => summarizeStaffRenderWarnings(allWarnings),
    [allWarnings],
  );

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
        <button
          type="button"
          className={`btn ghost abc-staff-follow${followPlayback ? " active" : ""}`}
          aria-pressed={followPlayback}
          onClick={() => setFollowPlayback((on) => !on)}
        >
          {t("score.staff.followPlayback")}
        </button>
        {!playbackReady && (
          <span className="hint">{t("score.staff.syncHint")}</span>
        )}
        {isStale && (
          <span className="hint" aria-live="polite">
            {t("score.staff.composing")}
          </span>
        )}
      </div>

      <div
        className={`abc-staff-scroll${windowing ? " is-windowed" : ""}`}
        ref={scrollRef}
      >
        {windowing && virtualTrackHeight != null ? (
          <div
            className="abc-staff-virtual-track"
            style={{ height: virtualTrackHeight, position: "relative" }}
          >
            <div
              className="abc-staff-paper abc-staff-paper-windowed"
              ref={paperRef}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: paperTop,
              }}
            />
          </div>
        ) : (
          <div className="abc-staff-paper" ref={paperRef} />
        )}
      </div>

      {renderError && (
        <p className="score-issues error" role="alert">
          {t("score.staff.renderError")}: {renderError}
        </p>
      )}
      {seekHint && <p className="hint">{seekHint}</p>}
      {warningSummary && (
        <div className="abc-staff-warnings" role="status">
          <p className="score-issues warning">
            {warningSummary.issueCount === 1
              ? t("score.staff.renderIssueSummaryOne")
              : t("score.staff.renderIssuesSummary", {
                  count: warningSummary.issueCount,
                })}
          </p>
          <button
            type="button"
            className="btn ghost abc-staff-warnings-toggle"
            aria-expanded={warningsExpanded}
            onClick={() => setWarningsExpanded((open) => !open)}
          >
            {warningsExpanded
              ? t("score.staff.hideDetails")
              : t("score.staff.showDetails")}
          </button>
          {warningsExpanded && (
            <ul className="abc-staff-warnings-details score-issues">
              {warningSummary.details.map((detail, i) => (
                <li key={`swd-${i}`} className="warning">
                  {detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
