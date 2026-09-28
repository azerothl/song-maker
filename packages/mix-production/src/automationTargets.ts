/**
 * Automation target encoding beyond volume/pan (#98).
 * Kept as strings so existing lanes and localStorage stay compatible.
 */

/** Volume fader (absolute dB) or pan (−1…1), plus FX / send / bus targets. */
export type AutomationTarget = string;

export const VOLUME_TARGET = "volume";
export const PAN_TARGET = "pan";

export function effectParamTarget(effectId: string, paramKey: string): string {
  return `fx:${effectId}:${paramKey}`;
}

export function sendGainTarget(sendId: string): string {
  return `send:${sendId}:gain`;
}

export function busVolumeTarget(busId: string): string {
  return `bus:${busId}:volume`;
}

export function busPanTarget(busId: string): string {
  return `bus:${busId}:pan`;
}

export type ParsedAutomationTarget =
  | { kind: "volume" }
  | { kind: "pan" }
  | { kind: "effectParam"; effectId: string; paramKey: string }
  | { kind: "sendGain"; sendId: string }
  | { kind: "busVolume"; busId: string }
  | { kind: "busPan"; busId: string }
  | { kind: "unknown"; raw: string };

export function parseAutomationTarget(target: string): ParsedAutomationTarget {
  if (target === VOLUME_TARGET) return { kind: "volume" };
  if (target === PAN_TARGET) return { kind: "pan" };
  if (target.startsWith("fx:")) {
    const rest = target.slice(3);
    const idx = rest.indexOf(":");
    if (idx > 0) {
      return {
        kind: "effectParam",
        effectId: rest.slice(0, idx),
        paramKey: rest.slice(idx + 1),
      };
    }
  }
  if (target.startsWith("send:") && target.endsWith(":gain")) {
    return { kind: "sendGain", sendId: target.slice(5, -5) };
  }
  if (target.startsWith("bus:") && target.endsWith(":volume")) {
    return { kind: "busVolume", busId: target.slice(4, -7) };
  }
  if (target.startsWith("bus:") && target.endsWith(":pan")) {
    return { kind: "busPan", busId: target.slice(4, -4) };
  }
  return { kind: "unknown", raw: target };
}

export function isVolumeOrPanTarget(target: string): boolean {
  return target === VOLUME_TARGET || target === PAN_TARGET;
}
