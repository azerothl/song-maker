import { createClipEditor, type Clip as EngineClip } from "@song-maker/score-engine";
import { useMemo, useState } from "react";
import type { MixClip, MixDoc, MixTrack } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  mix: MixDoc;
  onChange: (next: MixDoc) => void;
};

function toEngine(clip: MixClip): EngineClip {
  return { ...clip };
}

function fromEngine(clip: EngineClip): MixClip {
  return { ...clip };
}

function formatMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(1);
  return `${m}:${rest.padStart(4, "0")}`;
}

export function ClipTimeline({ mix, onChange }: Props) {
  const editor = useMemo(() => createClipEditor(), []);
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const selectedClip = useMemo(() => {
    if (!selected) return null;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    return track?.clips.find((c) => c.id === selected.clipId) ?? null;
  }, [mix, selected]);

  const timelineMs = useMemo(() => {
    let max = 1;
    for (const tr of mix.tracks) {
      for (const c of tr.clips) {
        max = Math.max(max, c.startMs + c.durationMs);
      }
    }
    return Math.max(max, 30_000);
  }, [mix]);

  function patchTrackClips(trackId: string, clips: MixClip[]) {
    onChange({
      ...mix,
      tracks: mix.tracks.map((tr) =>
        tr.id === trackId ? { ...tr, clips } : tr,
      ),
    });
  }

  function applyEdit(
    track: MixTrack,
    request: Parameters<ReturnType<typeof createClipEditor>["apply"]>[1],
  ) {
    setError(null);
    try {
      const next = editor
        .apply(track.clips.map(toEngine), request)
        .map(fromEngine);
      patchTrackClips(track.id, next);
      if (request.kind === "duplicate" || request.kind === "cut") {
        const last = next[next.length - 1];
        if (last && last.id !== request.clipId) {
          setSelected({ trackId: track.id, clipId: last.id });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function updateSelectedNumeric(
    field: "startMs" | "offsetMs" | "durationMs" | "fadeInMs" | "fadeOutMs",
    value: number,
  ) {
    if (!selected || !selectedClip) return;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) return;
    setError(null);
    try {
      if (field === "startMs") {
        applyEdit(track, {
          kind: "move",
          clipId: selected.clipId,
          startMs: value,
        });
      } else if (field === "fadeInMs" || field === "fadeOutMs") {
        applyEdit(track, {
          kind: "fade",
          clipId: selected.clipId,
          fadeInMs: field === "fadeInMs" ? value : selectedClip.fadeInMs,
          fadeOutMs: field === "fadeOutMs" ? value : selectedClip.fadeOutMs,
        });
      } else {
        applyEdit(track, {
          kind: "trim",
          clipId: selected.clipId,
          offsetMs: field === "offsetMs" ? value : selectedClip.offsetMs,
          durationMs: field === "durationMs" ? value : selectedClip.durationMs,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="clip-timeline">
      <div className="clip-timeline-header">
        <h3>{t("clips.title")}</h3>
        <span className="hint">{t("clips.hint")}</span>
      </div>

      <div className="clip-lanes">
        <div className="clip-ruler" aria-hidden="true">
          <span className="clip-lane-label" />
          <div className="clip-ruler-marks">
            <span>0:00</span>
            <span>{formatMs(timelineMs / 2)}</span>
            <span>{formatMs(timelineMs)}</span>
          </div>
        </div>
        {mix.tracks.map((tr) => (
          <div key={tr.id} className="clip-lane">
            <span className="clip-lane-label">{tr.name}</span>
            <div className="clip-lane-rail">
              {tr.clips.map((clip) => {
                const left = (clip.startMs / timelineMs) * 100;
                const width = Math.max(0.8, (clip.durationMs / timelineMs) * 100);
                const active =
                  selected?.trackId === tr.id && selected.clipId === clip.id;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    className={active ? "clip-block active" : "clip-block"}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${tr.name} · ${formatMs(clip.startMs)} → ${formatMs(clip.startMs + clip.durationMs)}`}
                    aria-label={`${tr.name}, ${formatMs(clip.startMs)}, ${formatMs(clip.durationMs)}`}
                    onClick={() =>
                      setSelected({ trackId: tr.id, clipId: clip.id })
                    }
                  >
                    <span className="clip-block-label">
                      {formatMs(clip.startMs)}
                    </span>
                    <span
                      className="clip-fade-in"
                      style={{
                        width: `${clip.durationMs > 0 ? (clip.fadeInMs / clip.durationMs) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="clip-fade-out"
                      style={{
                        width: `${clip.durationMs > 0 ? (clip.fadeOutMs / clip.durationMs) * 100 : 0}%`,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && selectedClip && (
        <div className="clip-inspector">
          <p className="clip-inspector-title">
            {t("clips.selected", { id: selectedClip.id.slice(0, 8) })}
          </p>
          <div className="clip-fields">
            <label className="clip-field">
              <span>{t("clips.start")}</span>
              <input
                type="number"
                min={0}
                step={100}
                value={selectedClip.startMs}
                onChange={(e) =>
                  updateSelectedNumeric("startMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.offset")}</span>
              <input
                type="number"
                min={0}
                step={100}
                value={selectedClip.offsetMs}
                onChange={(e) =>
                  updateSelectedNumeric("offsetMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.duration")}</span>
              <input
                type="number"
                min={100}
                step={100}
                value={selectedClip.durationMs}
                onChange={(e) =>
                  updateSelectedNumeric("durationMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.fadeIn")}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={selectedClip.fadeInMs}
                onChange={(e) =>
                  updateSelectedNumeric("fadeInMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.fadeOut")}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={selectedClip.fadeOutMs}
                onChange={(e) =>
                  updateSelectedNumeric("fadeOutMs", Number(e.target.value))
                }
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const track = mix.tracks.find((tr) => tr.id === selected.trackId);
                if (!track) return;
                applyEdit(track, {
                  kind: "duplicate",
                  clipId: selected.clipId,
                  startMs: selectedClip.startMs + selectedClip.durationMs,
                });
              }}
            >
              {t("clips.duplicate")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const track = mix.tracks.find((tr) => tr.id === selected.trackId);
                if (!track) return;
                const mid =
                  selectedClip.startMs + Math.floor(selectedClip.durationMs / 2);
                applyEdit(track, {
                  kind: "cut",
                  clipId: selected.clipId,
                  atMs: mid,
                });
              }}
            >
              {t("clips.cut")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="hint error">{error}</p>}
    </div>
  );
}
