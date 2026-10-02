import { useEffect, useEffectEvent, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  formatLatencyReading,
  latencyHintForPreference,
  readCaptureLatency,
  type CaptureLatencyPreference,
  type CaptureLatencyReading,
} from "../lib/captureLatency";
import type { MixDoc } from "../lib/types";
import { t } from "../ui/i18n";

type CapturePhase =
  | "idle"
  | "arming"
  | "armed"
  | "countdown"
  | "recording"
  | "paused"
  | "review"
  | "saving";

type InputDevice = {
  deviceId: string;
  label: string;
};

type PendingTake = {
  sessionId: string;
  reviewUrl: string;
  elapsedMs: number;
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
  const [monitorCompensate, setMonitorCompensate] = useState(true);
  const [latencyPref, setLatencyPref] =
    useState<CaptureLatencyPreference>("balanced");
  const [latency, setLatency] = useState<CaptureLatencyReading | null>(null);
  const [countdownSec, setCountdownSec] = useState(3);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopBarsMs, setLoopBarsMs] = useState(8000);
  const [punchEnabled, setPunchEnabled] = useState(false);
  const [punchInMs, setPunchInMs] = useState(0);
  const [punchOutMs, setPunchOutMs] = useState(8000);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pendingTakes, setPendingTakes] = useState<PendingTake[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureSetRecordPhase = (next, opts) => {
      setPhase(next);
      if (next === "review" || opts?.withTakes) {
        setPendingTakes([
          {
            sessionId: "capture-take-1",
            reviewUrl: "",
            elapsedMs: 1_500,
            label: "Prise 1",
          },
        ]);
      }
      if (next === "paused") {
        setElapsedMs(2_400);
      }
    };
    return () => {
      delete window.__captureSetRecordPhase;
    };
  }, []);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const monitorDelayRef = useRef<DelayNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const pauseStartedRef = useRef<number | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writeFailedRef = useRef(false);
  const loopEnabledRef = useRef(false);
  const loopBarsMsRef = useRef(8000);
  const punchEnabledRef = useRef(false);
  const punchWindowMsRef = useRef(0);
  const takeIndexRef = useRef(0);
  const rollingTakesRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const elapsedMsRef = useRef(0);

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
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
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
    monitorDelayRef.current = null;
  });

  const clearPendingTakes = useEffectEvent(() => {
    for (const take of pendingTakes) {
      URL.revokeObjectURL(take.reviewUrl);
    }
    setPendingTakes([]);
  });

  const resetLocal = useEffectEvent(() => {
    releaseStream();
    clearPendingTakes();
    sessionIdRef.current = null;
    chunksRef.current = [];
    writeChainRef.current = Promise.resolve();
    writeFailedRef.current = false;
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    takeIndexRef.current = 0;
    rollingTakesRef.current = false;
    setElapsedMs(0);
    setCountdownLeft(0);
    setPhase("idle");
    setStatusMsg(null);
    setLatency(null);
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

  const refreshLatency = useEffectEvent(() => {
    const reading = readCaptureLatency(audioCtxRef.current, latencyPref);
    setLatency(reading);
    if (monitorDelayRef.current && reading.compensationMs != null) {
      const sec = Math.min(1, Math.max(0, reading.compensationMs / 1000));
      monitorDelayRef.current.delayTime.value = monitorCompensate ? sec : 0;
    }
  });

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    loopBarsMsRef.current = loopBarsMs;
  }, [loopBarsMs]);

  useEffect(() => {
    punchEnabledRef.current = punchEnabled;
    punchWindowMsRef.current =
      punchEnabled && punchOutMs > punchInMs ? punchOutMs - punchInMs : 0;
  }, [punchEnabled, punchInMs, punchOutMs]);

  const stopRecorderNow = useEffectEvent((rollLoop: boolean) => {
    rollingTakesRef.current = rollLoop;
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
    refreshLatency();
  }, [latencyPref, monitorCompensate, phase]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const tick = window.setInterval(() => {
      const pauseExtra =
        pauseStartedRef.current != null
          ? Date.now() - pauseStartedRef.current
          : 0;
      const elapsed =
        Date.now() - startedAtRef.current - pausedAccumRef.current - pauseExtra;
      elapsedMsRef.current = elapsed;
      setElapsedMs(elapsed);
      if (phase !== "recording") return;
      if (loopEnabledRef.current && elapsed >= loopBarsMsRef.current) {
        stopRecorderNow(true);
        return;
      }
      if (
        punchEnabledRef.current &&
        punchWindowMsRef.current > 0 &&
        !loopEnabledRef.current &&
        elapsed >= punchWindowMsRef.current
      ) {
        stopRecorderNow(false);
      }
    }, 100);
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
      const warm = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
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
          emergencyStopRecording();
        });
      }

      const ctx = new AudioContext({
        latencyHint: latencyHintForPreference(latencyPref),
      });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = monitoring ? 1 : 0;
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0;
      source.connect(analyser);
      analyser.connect(delay);
      delay.connect(monitorGain);
      monitorGain.connect(ctx.destination);
      analyserRef.current = analyser;
      monitorGainRef.current = monitorGain;
      monitorDelayRef.current = delay;
      startMeter(analyser);
      refreshLatency();
      setPhase("armed");
    } catch (e) {
      releaseStream();
      setPhase("idle");
      const msg = mapGetUserMediaError(e);
      setStatusMsg(msg);
      onError(msg);
    }
  }

  function beginCountdown() {
    if (!streamRef.current) {
      onError(t("record.err.notArmed"));
      return;
    }
    const secs = Math.max(0, Math.min(10, Math.round(countdownSec)));
    if (secs <= 0) {
      void startRecording();
      return;
    }
    setPhase("countdown");
    setCountdownLeft(secs);
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
    }
    countdownTimerRef.current = window.setInterval(() => {
      setCountdownLeft((left) => {
        if (left <= 1) {
          if (countdownTimerRef.current != null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          void startRecording();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
  }

  function emergencyStopRecording() {
    stopRecorderNow(false);
  }

  async function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      onError(t("record.err.notArmed"));
      setPhase("armed");
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
            rollingTakesRef.current = false;
            if (analyserRef.current) startMeter(analyserRef.current);
            setPhase("armed");
            return;
          }
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const sid = sessionIdRef.current;
          if (!sid || blob.size === 0) {
            if (sid) {
              try {
                await api.discardUserAudioCapture(projectId, sid);
              } catch {
                /* ignore */
              }
            }
            sessionIdRef.current = null;
            setStatusMsg(t("record.err.empty"));
            rollingTakesRef.current = false;
            if (analyserRef.current) startMeter(analyserRef.current);
            setPhase("armed");
            return;
          }

          takeIndexRef.current += 1;
          const take: PendingTake = {
            sessionId: sid,
            reviewUrl: URL.createObjectURL(blob),
            elapsedMs: elapsedMsRef.current,
            label: t("record.takeLabel", { n: String(takeIndexRef.current) }),
          };
          sessionIdRef.current = null;
          setPendingTakes((prev) => [...prev, take]);

          if (rollingTakesRef.current && loopEnabledRef.current) {
            rollingTakesRef.current = false;
            if (analyserRef.current) startMeter(analyserRef.current);
            await startRecording();
            return;
          }

          if (analyserRef.current) startMeter(analyserRef.current);
          setPhase("review");
        })();
      };

      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      pauseStartedRef.current = null;
      setElapsedMs(0);
      recorder.start(250);
      setPhase("recording");
      if (analyserRef.current) startMeter(analyserRef.current);
    } catch (e) {
      sessionIdRef.current = null;
      rollingTakesRef.current = false;
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
    stopRecorderNow(false);
  }

  async function keepTakes() {
    if (pendingTakes.length === 0) {
      onError(t("record.err.empty"));
      return;
    }
    setPhase("saving");
    setStatusMsg(null);
    try {
      await writeChainRef.current;
      if (writeFailedRef.current) {
        throw new Error(t("record.err.writeFailed"));
      }
      const startMs = punchEnabled ? Math.max(0, punchInMs) : 0;
      const mix =
        pendingTakes.length === 1
          ? await api.finalizeUserAudioCapture(
              projectId,
              pendingTakes[0]!.sessionId,
              t("record.defaultName"),
            )
          : await api.finalizeUserAudioCaptureTakes(
              projectId,
              pendingTakes.map((p) => p.sessionId),
              t("record.defaultName"),
              startMs,
            );
      // Single-take punch: place clip at punch-in via update.
      if (pendingTakes.length === 1 && punchEnabled && startMs > 0) {
        const track = mix.tracks[mix.tracks.length - 1];
        if (track?.clips[0]) {
          const clips = track.clips.map((c, i) =>
            i === 0 ? { ...c, startMs } : c,
          );
          const updated = await api.updateMix(projectId, {
            masterGainDb: mix.masterGainDb,
            tracks: mix.tracks.map((tr) =>
              tr.id === track.id
                ? {
                    id: tr.id,
                    gainDb: tr.gainDb,
                    pan: tr.pan,
                    mute: tr.mute,
                    solo: tr.solo,
                    clips,
                  }
                : {
                    id: tr.id,
                    gainDb: tr.gainDb,
                    pan: tr.pan,
                    mute: tr.mute,
                    solo: tr.solo,
                  },
            ),
          });
          resetLocal();
          onTrackAdded(updated);
          onClose();
          return;
        }
      }
      resetLocal();
      onTrackAdded(mix);
      onClose();
    } catch (e) {
      const msg = t("record.err.finalize", {
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatusMsg(msg);
      onError(msg);
      setPhase("review");
    }
  }

  async function discardTakes() {
    for (const take of pendingTakes) {
      try {
        await api.discardUserAudioCapture(projectId, take.sessionId);
      } catch {
        /* ignore */
      }
    }
    clearPendingTakes();
    takeIndexRef.current = 0;
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
    if (phase !== "saving") {
      for (const take of pendingTakes) {
        void api
          .discardUserAudioCapture(projectId, take.sessionId)
          .catch(() => undefined);
      }
    }
    resetLocal();
    onClose();
  }

  if (!open) return null;

  const elapsedLabel = formatElapsed(elapsedMs);
  const canPickDevice = phase === "idle" || phase === "arming";
  const punchInvalid =
    punchEnabled && punchOutMs > 0 && punchOutMs <= punchInMs;

  return (
    <section className="record-panel" aria-labelledby="record-panel-title">
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

      <label className="record-device">
        <span>{t("record.latency.pref")}</span>
        <select
          value={latencyPref}
          disabled={phase !== "idle" && phase !== "arming"}
          onChange={(e) =>
            setLatencyPref(e.target.value as CaptureLatencyPreference)
          }
        >
          <option value="stable">{t("record.latency.stable")}</option>
          <option value="balanced">{t("record.latency.balanced")}</option>
          <option value="low">{t("record.latency.low")}</option>
        </select>
      </label>
      <p className="hint record-latency" aria-live="polite">
        {t("record.latency.measured", {
          value: latency ? formatLatencyReading(latency) : "—",
        })}
      </p>
      <p className="hint">{t("record.latency.hint")}</p>

      <label className="record-monitor">
        <input
          type="checkbox"
          checked={monitoring}
          onChange={(e) => setMonitoring(e.target.checked)}
        />
        <span>{t("record.monitor")}</span>
      </label>
      {monitoring && (
        <>
          <p className="hint warn">{t("record.monitor.warn")}</p>
          <label className="record-monitor">
            <input
              type="checkbox"
              checked={monitorCompensate}
              onChange={(e) => setMonitorCompensate(e.target.checked)}
            />
            <span>{t("record.monitor.compensate")}</span>
          </label>
        </>
      )}

      <div className="record-options">
        <label className="record-field">
          <span>{t("record.countdown")}</span>
          <input
            type="number"
            min={0}
            max={10}
            value={countdownSec}
            disabled={phase === "recording" || phase === "countdown"}
            onChange={(e) => setCountdownSec(Number(e.target.value) || 0)}
          />
        </label>
        <label className="record-monitor">
          <input
            type="checkbox"
            checked={loopEnabled}
            disabled={phase === "recording" || phase === "countdown"}
            onChange={(e) => setLoopEnabled(e.target.checked)}
          />
          <span>{t("record.loop")}</span>
        </label>
        {loopEnabled && (
          <label className="record-field">
            <span>{t("record.loopLength")}</span>
            <input
              type="number"
              min={500}
              step={100}
              value={loopBarsMs}
              disabled={phase === "recording" || phase === "countdown"}
              onChange={(e) => setLoopBarsMs(Number(e.target.value) || 8000)}
            />
          </label>
        )}
        <label className="record-monitor">
          <input
            type="checkbox"
            checked={punchEnabled}
            disabled={phase === "recording" || phase === "countdown"}
            onChange={(e) => setPunchEnabled(e.target.checked)}
          />
          <span>{t("record.punch")}</span>
        </label>
        {punchEnabled && (
          <div className="record-punch-fields">
            <label className="record-field">
              <span>{t("record.punchIn")}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={punchInMs}
                onChange={(e) => setPunchInMs(Number(e.target.value) || 0)}
              />
            </label>
            <label className="record-field">
              <span>{t("record.punchOut")}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={punchOutMs}
                onChange={(e) => setPunchOutMs(Number(e.target.value) || 0)}
              />
            </label>
          </div>
        )}
        {punchInvalid && (
          <p className="hint warn">{t("record.punch.invalid")}</p>
        )}
      </div>

      <div className="record-vu" aria-hidden>
        <div className="record-vu-fill" style={{ width: `${level * 100}%` }} />
      </div>
      <p className="record-elapsed" aria-live="polite">
        {phase === "countdown"
          ? t("record.countdown.left", { n: String(countdownLeft) })
          : t("record.elapsed", { time: elapsedLabel })}
        {phase === "paused" ? ` · ${t("record.state.paused")}` : ""}
        {pendingTakes.length > 0
          ? ` · ${t("record.takes.count", { n: String(pendingTakes.length) })}`
          : ""}
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
            disabled={punchInvalid}
            onClick={() => beginCountdown()}
          >
            {t("record.start")}
          </button>
        )}
        {phase === "countdown" && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (countdownTimerRef.current != null) {
                window.clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              setCountdownLeft(0);
              setPhase("armed");
            }}
          >
            {t("record.countdown.cancel")}
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
            <button
              type="button"
              className="btn primary"
              onClick={resumeRecording}
            >
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
              onClick={() => void keepTakes()}
            >
              {t("record.keep")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void discardTakes()}
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

      {phase === "review" && pendingTakes.length > 0 && (
        <ul className="record-takes">
          {pendingTakes.map((take) => (
            <li key={take.sessionId}>
              <span>{take.label}</span>
              <audio className="record-review" controls src={take.reviewUrl} />
            </li>
          ))}
        </ul>
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

declare global {
  interface Window {
    __captureSetRecordPhase?: (
      next:
        | "idle"
        | "arming"
        | "armed"
        | "countdown"
        | "recording"
        | "paused"
        | "review"
        | "saving",
      opts?: { withTakes?: boolean },
    ) => void;
  }
}
