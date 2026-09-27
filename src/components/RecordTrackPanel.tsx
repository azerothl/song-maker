import { useEffect, useEffectEvent, useRef, useState } from "react";
import { api } from "../lib/api";
import type { MixDoc } from "../lib/types";
import { t } from "../ui/i18n";

type CapturePhase =
  | "idle"
  | "arming"
  | "armed"
  | "recording"
  | "paused"
  | "review"
  | "saving";

type InputDevice = {
  deviceId: string;
  label: string;
};

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onTrackAdded: (mix: MixDoc) => void;
  onError: (message: string) => void;
};

function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

function mapGetUserMediaError(err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return t("record.err.permission");
    case "NotFoundError":
    case "DevicesNotFoundError":
      return t("record.err.noDevice");
    case "NotReadableError":
    case "TrackStartError":
      return t("record.err.deviceBusy");
    case "OverconstrainedError":
      return t("record.err.deviceGone");
    default:
      return t("record.err.generic", {
        detail: err instanceof Error ? err.message : String(err),
      });
  }
}

export function RecordTrackPanel({
  projectId,
  open,
  onClose,
  onTrackAdded,
  onError,
}: Props) {
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [monitoring, setMonitoring] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const pauseStartedRef = useRef<number | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writeFailedRef = useRef(false);

  const stopMeter = useEffectEvent(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
  });

  const releaseStream = useEffectEvent(() => {
    stopMeter();
    recorderRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    monitorGainRef.current = null;
  });

  const clearReview = useEffectEvent(() => {
    if (reviewUrl) {
      URL.revokeObjectURL(reviewUrl);
    }
    setReviewUrl(null);
    chunksRef.current = [];
  });

  const resetLocal = useEffectEvent(() => {
    releaseStream();
    clearReview();
    sessionIdRef.current = null;
    writeChainRef.current = Promise.resolve();
    writeFailedRef.current = false;
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    setElapsedMs(0);
    setPhase("idle");
    setStatusMsg(null);
  });

  const refreshDevices = useEffectEvent(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label?.trim() || t("record.device.unnamed", { n: String(i + 1) }),
        }));
      setDevices(inputs);
      setDeviceId((prev) => {
        if (prev && inputs.some((d) => d.deviceId === prev)) return prev;
        return inputs[0]?.deviceId ?? "";
      });
    } catch {
      setDevices([]);
    }
  });

  useEffect(() => {
    if (!open) {
      resetLocal();
      return;
    }
    void refreshDevices();
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [open]);

  useEffect(() => {
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = monitoring ? 1 : 0;
    }
  }, [monitoring]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const tick = window.setInterval(() => {
      const pauseExtra =
        pauseStartedRef.current != null
          ? Date.now() - pauseStartedRef.current
          : 0;
      setElapsedMs(
        Date.now() - startedAtRef.current - pausedAccumRef.current - pauseExtra,
      );
    }, 200);
    return () => window.clearInterval(tick);
  }, [phase]);

  function startMeter(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  async function arm() {
    setStatusMsg(null);
    setPhase("arming");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t("record.err.unsupported"));
      }
      // Warm permission so enumerateDevices returns labels.
      const warm = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId } }
          : true,
        video: false,
      });
      for (const track of warm.getTracks()) track.stop();
      await refreshDevices();

      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          setStatusMsg(t("record.err.deviceGone"));
          if (
            recorderRef.current &&
            (recorderRef.current.state === "recording" ||
              recorderRef.current.state === "paused")
          ) {
            try {
              recorderRef.current.stop();
            } catch {
              /* ignore */
            }
          }
        });
      }

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = monitoring ? 1 : 0;
      source.connect(analyser);
      analyser.connect(monitorGain);
      monitorGain.connect(ctx.destination);
      analyserRef.current = analyser;
      monitorGainRef.current = monitorGain;
      startMeter(analyser);
      setPhase("armed");
    } catch (e) {
      releaseStream();
      setPhase("idle");
      const msg = mapGetUserMediaError(e);
      setStatusMsg(msg);
      onError(msg);
    }
  }

  async function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      onError(t("record.err.notArmed"));
      return;
    }
    setStatusMsg(null);
    writeFailedRef.current = false;
    chunksRef.current = [];
    try {
      const session = await api.beginUserAudioCapture(projectId);
      sessionIdRef.current = session.sessionId;
      const mime = pickMimeType();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        chunksRef.current.push(ev.data);
        const sid = sessionIdRef.current;
        if (!sid || writeFailedRef.current) return;
        const blob = ev.data;
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (writeFailedRef.current) return;
          try {
            const buf = new Uint8Array(await blob.arrayBuffer());
            // Chunked IPC — avoid one giant payload.
            const STEP = 256 * 1024;
            for (let i = 0; i < buf.length; i += STEP) {
              const slice = Array.from(buf.subarray(i, i + STEP));
              await api.appendUserAudioChunk(projectId, sid, slice);
            }
          } catch (err) {
            writeFailedRef.current = true;
            setStatusMsg(
              t("record.err.write", {
                detail: err instanceof Error ? err.message : String(err),
              }),
            );
            try {
              recorder.stop();
            } catch {
              /* ignore */
            }
          }
        });
      };

      recorder.onerror = () => {
        setStatusMsg(t("record.err.recorder"));
      };

      recorder.onstop = () => {
        void (async () => {
          await writeChainRef.current;
          stopMeter();
          if (writeFailedRef.current) {
            const sid = sessionIdRef.current;
            if (sid) {
              try {
                await api.discardUserAudioCapture(projectId, sid);
              } catch {
                /* ignore */
              }
            }
            sessionIdRef.current = null;
            setPhase("armed");
            return;
          }
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          clearReview();
          if (blob.size === 0) {
            const sid = sessionIdRef.current;
            if (sid) {
              try {
                await api.discardUserAudioCapture(projectId, sid);
              } catch {
                /* ignore */
              }
            }
            sessionIdRef.current = null;
            setStatusMsg(t("record.err.empty"));
            setPhase("armed");
            return;
          }
          setReviewUrl(URL.createObjectURL(blob));
          setPhase("review");
        })();
      };

      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      pauseStartedRef.current = null;
      setElapsedMs(0);
      recorder.start(1000);
      setPhase("recording");
    } catch (e) {
      sessionIdRef.current = null;
      setPhase("armed");
      const msg = t("record.err.start", {
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatusMsg(msg);
      onError(msg);
    }
  }

  function pauseRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    pauseStartedRef.current = Date.now();
    setPhase("paused");
  }

  function resumeRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    if (pauseStartedRef.current != null) {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    rec.resume();
    setPhase("recording");
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || (rec.state !== "recording" && rec.state !== "paused")) return;
    if (pauseStartedRef.current != null) {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    try {
      rec.requestData();
    } catch {
      /* ignore */
    }
    rec.stop();
  }

  async function keepTake() {
    const sid = sessionIdRef.current;
    if (!sid) {
      onError(t("record.err.noSession"));
      return;
    }
    setPhase("saving");
    setStatusMsg(null);
    try {
      await writeChainRef.current;
      if (writeFailedRef.current) {
        throw new Error(t("record.err.writeFailed"));
      }
      const mix = await api.finalizeUserAudioCapture(
        projectId,
        sid,
        t("record.defaultName"),
      );
      sessionIdRef.current = null;
      resetLocal();
      onTrackAdded(mix);
      onClose();
    } catch (e) {
      const msg = t("record.err.finalize", {
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatusMsg(msg);
      onError(msg);
      // No mix track was appended; keep session for retry or explicit discard.
      setPhase("review");
    }
  }

  async function discardTake() {
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await api.discardUserAudioCapture(projectId, sid);
      } catch {
        /* ignore */
      }
    }
    sessionIdRef.current = null;
    clearReview();
    setElapsedMs(0);
    if (streamRef.current && analyserRef.current) {
      startMeter(analyserRef.current);
      setPhase("armed");
    } else {
      setPhase("idle");
    }
  }

  function handleClose() {
    const sid = sessionIdRef.current;
    const rec = recorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    if (sid && phase !== "saving") {
      void api.discardUserAudioCapture(projectId, sid).catch(() => undefined);
    }
    resetLocal();
    onClose();
  }

  if (!open) return null;

  const elapsedLabel = formatElapsed(elapsedMs);
  const canPickDevice = phase === "idle" || phase === "arming";

  return (
    <section
      className="record-panel"
      aria-labelledby="record-panel-title"
    >
      <header className="record-panel-header">
        <h3 id="record-panel-title">{t("record.title")}</h3>
        <button type="button" className="btn ghost" onClick={handleClose}>
          {t("record.close")}
        </button>
      </header>

      <p className="hint">{t("record.intro")}</p>

      <label className="record-device">
        <span>{t("record.device")}</span>
        <select
          value={deviceId}
          disabled={!canPickDevice || devices.length === 0}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">{t("record.device.empty")}</option>
          ) : (
            devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="record-monitor">
        <input
          type="checkbox"
          checked={monitoring}
          onChange={(e) => setMonitoring(e.target.checked)}
        />
        <span>{t("record.monitor")}</span>
      </label>
      {monitoring && <p className="hint warn">{t("record.monitor.warn")}</p>}

      <div className="record-vu" aria-hidden>
        <div className="record-vu-fill" style={{ width: `${level * 100}%` }} />
      </div>
      <p className="record-elapsed" aria-live="polite">
        {t("record.elapsed", { time: elapsedLabel })}
        {phase === "paused" ? ` · ${t("record.state.paused")}` : ""}
      </p>

      <div className="btn-row record-actions">
        {(phase === "idle" || phase === "arming") && (
          <button
            type="button"
            className="btn primary"
            disabled={phase === "arming"}
            onClick={() => void arm()}
          >
            {phase === "arming" ? t("record.arming") : t("record.arm")}
          </button>
        )}
        {phase === "armed" && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void startRecording()}
          >
            {t("record.start")}
          </button>
        )}
        {phase === "recording" && (
          <>
            <button type="button" className="btn" onClick={pauseRecording}>
              {t("record.pause")}
            </button>
            <button type="button" className="btn" onClick={stopRecording}>
              {t("record.stop")}
            </button>
          </>
        )}
        {phase === "paused" && (
          <>
            <button type="button" className="btn primary" onClick={resumeRecording}>
              {t("record.resume")}
            </button>
            <button type="button" className="btn" onClick={stopRecording}>
              {t("record.stop")}
            </button>
          </>
        )}
        {phase === "review" && (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => void keepTake()}
            >
              {t("record.keep")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void discardTake()}
            >
              {t("record.discard")}
            </button>
          </>
        )}
        {phase === "saving" && (
          <button type="button" className="btn" disabled>
            {t("record.saving")}
          </button>
        )}
      </div>

      {reviewUrl && phase === "review" && (
        <audio className="record-review" controls src={reviewUrl} />
      )}

      {statusMsg && (
        <p className="banner warn" role="alert">
          {statusMsg}
        </p>
      )}
    </section>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
