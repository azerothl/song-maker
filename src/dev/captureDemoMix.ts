import type { MixDoc, MixTrack, PlaybackSources, ProjectDoc, SeparationInfo } from "../lib/types";

function track(
  id: string,
  role: string,
  name: string,
  opts?: Partial<Pick<MixTrack, "gainDb" | "pan" | "mute">>,
): MixTrack {
  return {
    id,
    role,
    name,
    gainDb: opts?.gainDb ?? 0,
    pan: opts?.pan ?? 0,
    mute: opts?.mute ?? false,
    solo: false,
    locked: false,
    aiSeparated: true,
    clips: [],
  };
}

const CAPTURE_DEMO_TRACKS: MixTrack[] = [
  track("trk-vocals", "vocals", "Voix lead", { gainDb: -3 }),
  track("trk-choir", "vocals", "Chœurs", { gainDb: -6, pan: -0.2, mute: true }),
  track("trk-growl", "vocals", "Voix gutturales", { gainDb: -4.5, pan: 0.1 }),
  track("trk-drums", "drums", "Batterie", { gainDb: -2 }),
  track("trk-bass", "bass", "Basse", { gainDb: -4 }),
  track("trk-perc", "percussion", "Percussions", { gainDb: -8, pan: 0.25 }),
  track("trk-guitar", "guitar", "Guitare rythmique", { gainDb: -7, pan: -0.35 }),
  track("trk-guitar-lead", "guitar", "Guitare lead", { gainDb: -5, pan: 0.3 }),
  track("trk-piano", "piano", "Piano", { gainDb: -9, pan: -0.1 }),
  track("trk-accomp", "other", "Accompagnement", { gainDb: -8, pan: 0.05 }),
  track("trk-kick", "drums", "Grosse caisse", { gainDb: -3 }),
  track("trk-other", "other", "Cordes", { gainDb: -8, pan: 0.15 }),
  track("trk-synth", "other", "Synthés", { gainDb: -10, pan: -0.25 }),
  track("trk-pad", "other", "Nappes", { gainDb: -12 }),
  track("trk-brass", "other", "Cuivres", { gainDb: -11, pan: 0.2 }),
  track("trk-strings", "other", "Cordes aiguës", { gainDb: -9, pan: -0.15 }),
];

const CAPTURE_DEMO_CLIP = {
  id: "clip-capture-demo",
  sourcePath: "capture/demo.wav",
  sourceSha256: "0",
  startMs: 0,
  offsetMs: 0,
  durationMs: 4000,
  gainDb: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
};

/** Stems de démo pour captures navigateur (6, 12 ou 16 pistes). */
export function buildCaptureDemoMix(trackCount = 12): MixDoc {
  const n = Math.min(Math.max(trackCount, 1), CAPTURE_DEMO_TRACKS.length);
  return {
    schema: "mix",
    schemaVersion: 1,
    id: "mix-capture-demo",
    separationId: "sep-capture-demo",
    sampleRate: 48_000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: CAPTURE_DEMO_TRACKS.slice(0, n).map((tr, index) =>
      index === 0
        ? {
            ...tr,
            clips: [{ ...CAPTURE_DEMO_CLIP, id: "clip-capture-demo", trackId: tr.id }],
          }
        : tr,
    ),
  };
}

export function buildCaptureProject(): ProjectDoc {
  const now = new Date().toISOString();
  return {
    schema: "project",
    schemaVersion: 1,
    id: "proj-capture-demo",
    title: "Capture densité Production",
    createdAt: now,
    updatedAt: now,
    sampleRate: 48_000,
    channels: 2,
    bitDepth: 24,
    style: "Démo capture navigateur",
    lyrics: "",
    cot: "full",
    targetDurationSec: 180,
    activeGenerationId: "gen-capture-demo",
    activeSeparationId: "sep-capture-demo",
    activeMixId: "mix-capture-demo",
  };
}

export function buildCapturePlaybackSources(mix: MixDoc): PlaybackSources {
  return {
    mode: "stems",
    generationWav: null,
    label: "Stems de démo (capture)",
    stems: mix.tracks.map((tr) => ({
      trackId: tr.id,
      role: tr.role,
      name: tr.name,
      path: `/dev/null/${tr.id}.wav`,
    })),
  };
}

export function buildCaptureSeparationInfo(): SeparationInfo {
  return {
    id: "sep-capture-demo",
    family: "htdemucs_6s",
    warnings: ["guitarExperimental", "pianoExperimental", "phaseRisk"],
  };
}

export function syntheticPeaks(seed: number, bars = 120): Float32Array {
  const out = new Float32Array(bars);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < bars; i++) {
    const t = i / bars;
    const sect =
      t < 0.06 ? 0.25 : t < 0.3 ? 0.55 : t < 0.45 ? 0.85 : t < 0.6 ? 0.6 : t < 0.8 ? 0.95 : 0.7;
    out[i] = Math.min(1, sect * (0.55 + 0.45 * rnd()));
  }
  return out;
}
