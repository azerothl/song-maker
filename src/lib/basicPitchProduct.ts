import type { MixTrack } from "./types";

export type BasicPitchQuality =
  | "vocals"
  | "bass"
  | "piano"
  | "drums"
  | "other";

export function basicPitchQualityKind(role: string): BasicPitchQuality {
  const r = role.trim().toLowerCase();
  switch (r) {
    case "vocals":
    case "vocal":
    case "voix":
      return "vocals";
    case "bass":
    case "basse":
      return "bass";
    case "piano":
      return "piano";
    case "drums":
    case "batterie":
      return "drums";
    default:
      return "other";
  }
}

export function basicPitchQualityKey(role: string): `basicPitch.quality.${BasicPitchQuality}` {
  const kind = basicPitchQualityKind(role);
  switch (kind) {
    case "vocals":
      return "basicPitch.quality.vocals";
    case "bass":
      return "basicPitch.quality.bass";
    case "piano":
      return "basicPitch.quality.piano";
    case "drums":
      return "basicPitch.quality.drums";
    case "other":
      return "basicPitch.quality.other";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function trackHasAudioClip(track: MixTrack): boolean {
  return track.clips.some((c) => Boolean(c.sourcePath));
}

export function midiBytesToUint8Array(bytes: number[] | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}
