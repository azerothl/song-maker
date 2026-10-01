import type { KeySig, Meter } from "./types";

export type AbcHeaderMeta = {
  tempoBpm: number | null;
  key: KeySig | null;
  meter: Meter | null;
};

export type AbcAlignRequest = {
  tempoBpm?: number | null;
  key?: KeySig | null;
  meter?: Meter | null;
};

export type AbcAlignResult = {
  abc: string;
  changed: boolean;
  before: AbcHeaderMeta;
  after: AbcHeaderMeta;
  /** Fields that differed between model ABC and the request before alignment. */
  drifted: Array<"tempo" | "key" | "meter">;
};

const HEADER_RE = /^(X|T|M|L|Q|K|V|C|N|Z|B|D|F|G|H|I|O|P|R|S|W|w):\s*(.*)$/;

/** Format tonic+mode as YuE2 K: field (e.g. Dm, Em, ^F). */
export function formatAbcKeyField(key: KeySig): string {
  const preferred: Record<string, string> = {
    C: "C",
    "C#": "^C",
    Db: "_D",
    D: "D",
    "D#": "^D",
    Eb: "_E",
    E: "E",
    F: "F",
    "F#": "^F",
    Gb: "_G",
    G: "G",
    "G#": "^G",
    Ab: "_A",
    A: "A",
    "A#": "^A",
    Bb: "_B",
    B: "B",
  };
  const base = preferred[key.tonic] ?? key.tonic;
  if (key.mode === "minor") return `${base}m`;
  return base;
}

function parseTempoField(raw: string): number | null {
  const withUnit = /^1\/4\s*=\s*(\d+)/.exec(raw.trim());
  if (withUnit) return Number(withUnit[1]);
  const plain = /^(\d+)/.exec(raw.trim());
  if (plain) return Number(plain[1]);
  return null;
}

function parseMeterField(raw: string): Meter | null {
  const m = /^(\d+)\s*\/\s*(\d+)/.exec(raw.trim());
  if (!m) return null;
  return { numerator: Number(m[1]), denominator: Number(m[2]) };
}

function parseKeyField(raw: string): KeySig | null {
  const trimmed = raw.trim();
  const m = /^(?:\^|_|=)?([A-Ga-g])(?:m|min|minor)?/.exec(trimmed);
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  let tonic = letter;
  if (trimmed.startsWith("^")) tonic = `${letter}#`;
  if (trimmed.startsWith("_")) {
    const flatMap: Record<string, string> = {
      D: "Db",
      E: "Eb",
      G: "Gb",
      A: "Ab",
      B: "Bb",
    };
    tonic = flatMap[letter] ?? letter;
  }
  const mode = /m(in(or)?)?$/i.test(trimmed) ? "minor" : "major";
  return { tonic, mode };
}

/** Read Q:/K:/M: from ABC header lines (first occurrence each). */
export function parseAbcHeaders(abc: string): AbcHeaderMeta {
  let tempoBpm: number | null = null;
  let key: KeySig | null = null;
  let meter: Meter | null = null;

  for (const line of abc.split(/\r?\n/)) {
    const m = HEADER_RE.exec(line.trim());
    if (!m) {
      // End of header once music starts; keep scanning for late headers lightly.
      continue;
    }
    const tag = m[1]!;
    const value = m[2] ?? "";
    if (tag === "Q" && tempoBpm == null) tempoBpm = parseTempoField(value);
    if (tag === "K" && key == null) key = parseKeyField(value);
    if (tag === "M" && meter == null) meter = parseMeterField(value);
  }

  return { tempoBpm, key, meter };
}

function keysEqual(a: KeySig | null, b: KeySig | null): boolean {
  if (!a || !b) return a == null && b == null;
  return a.tonic === b.tonic && a.mode === b.mode;
}

function metersEqual(a: Meter | null, b: Meter | null): boolean {
  if (!a || !b) return a == null && b == null;
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

function hasRequest(request: AbcAlignRequest): boolean {
  return (
    (request.tempoBpm != null && request.tempoBpm > 0) ||
    request.key != null ||
    request.meter != null
  );
}

/**
 * Rewrite Q:/K:/M: header lines so the take ABC matches the requested form.
 * Does not transpose notes — only metadata fields. Missing headers are inserted
 * after X:/T: when a request value is present.
 */
export function alignAbcHeaders(
  abc: string,
  request: AbcAlignRequest,
): AbcAlignResult {
  const before = parseAbcHeaders(abc);
  if (!hasRequest(request)) {
    return {
      abc,
      changed: false,
      before,
      after: before,
      drifted: [],
    };
  }

  const drifted: Array<"tempo" | "key" | "meter"> = [];
  if (
    request.tempoBpm != null &&
    request.tempoBpm > 0 &&
    before.tempoBpm != null &&
    before.tempoBpm !== request.tempoBpm
  ) {
    drifted.push("tempo");
  }
  if (request.key && before.key && !keysEqual(before.key, request.key)) {
    drifted.push("key");
  }
  if (
    request.meter &&
    before.meter &&
    !metersEqual(before.meter, request.meter)
  ) {
    drifted.push("meter");
  }

  const lines = abc.split(/\r?\n/);
  let sawQ = false;
  let sawK = false;
  let sawM = false;
  let insertAfter = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = HEADER_RE.exec(lines[i]!.trim());
    if (!m) continue;
    const tag = m[1]!;
    if (tag === "X" || tag === "T") insertAfter = i;
    if (tag === "Q" && request.tempoBpm != null && request.tempoBpm > 0) {
      lines[i] = `Q:1/4=${request.tempoBpm}`;
      sawQ = true;
    }
    if (tag === "K" && request.key) {
      lines[i] = `K:${formatAbcKeyField(request.key)}`;
      sawK = true;
    }
    if (tag === "M" && request.meter) {
      lines[i] =
        `M:${request.meter.numerator}/${request.meter.denominator}`;
      sawM = true;
    }
  }

  const toInsert: string[] = [];
  if (!sawM && request.meter) {
    toInsert.push(
      `M:${request.meter.numerator}/${request.meter.denominator}`,
    );
  }
  if (!sawQ && request.tempoBpm != null && request.tempoBpm > 0) {
    toInsert.push(`Q:1/4=${request.tempoBpm}`);
  }
  if (!sawK && request.key) {
    toInsert.push(`K:${formatAbcKeyField(request.key)}`);
  }

  if (toInsert.length > 0) {
    const at = insertAfter >= 0 ? insertAfter + 1 : 0;
    lines.splice(at, 0, ...toInsert);
  }

  if (drifted.length > 0) {
    const bits: string[] = [];
    if (drifted.includes("tempo") && before.tempoBpm != null) {
      bits.push(`Q=${before.tempoBpm}`);
    }
    if (drifted.includes("key") && before.key) {
      bits.push(`K=${formatAbcKeyField(before.key)}`);
    }
    if (drifted.includes("meter") && before.meter) {
      bits.push(`M=${formatMeterLabel(before.meter)}`);
    }
    const note = `% song-maker-meta: model ${bits.join(" ")} (aligned to request)`;
    const already = lines.some((l) => l.startsWith("% song-maker-meta:"));
    if (!already) {
      const xIdx = lines.findIndex((l) => /^X:/i.test(l.trim()));
      lines.splice(xIdx >= 0 ? xIdx + 1 : 0, 0, note);
    }
  }

  const next = lines.join("\n");
  const after = parseAbcHeaders(next);
  return {
    abc: next,
    changed: next !== abc,
    before,
    after,
    drifted,
  };
}

/** Parse optional `% song-maker-meta: model Q=119 K=Em …` drift note. */
export function parseModelMetaComment(abc: string): {
  tempoBpm: number | null;
  key: KeySig | null;
  meter: Meter | null;
} | null {
  const line = abc.split(/\r?\n/).find((l) => l.startsWith("% song-maker-meta:"));
  if (!line) return null;
  const q = /Q=(\d+)/.exec(line);
  const k = /K=([^\s]+)/.exec(line);
  const m = /M=(\d+)\/(\d+)/.exec(line);
  return {
    tempoBpm: q ? Number(q[1]) : null,
    key: k ? parseKeyField(k[1]!) : null,
    meter: m
      ? { numerator: Number(m[1]), denominator: Number(m[2]) }
      : null,
  };
}

export function formatMeterLabel(meter: Meter): string {
  return `${meter.numerator}/${meter.denominator}`;
}

/** Human-readable key for banners (FR-friendly short form). */
export function formatKeyLabel(key: KeySig): string {
  return formatAbcKeyField(key);
}
