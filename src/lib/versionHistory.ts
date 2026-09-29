import type {
  GenerationSummary,
  SeparationVersionSummary,
} from "./types";

/** Optional score / mix snapshots for event lines in the Versions timeline. */
export type VersionEventSource = {
  id: string;
  createdAt: string;
  kind: "score" | "mix";
};

export type TakeDisplay = {
  id: string;
  ordinal: number;
  /** User-facing title, e.g. « Prise 3 » or a custom name. */
  title: string;
  /** Relative clock, e.g. « aujourd’hui 14:22 ». */
  when: string;
  /** Short style blurb; empty when none. */
  styleSummary: string;
  /** Readable parent link, e.g. « à partir de la prise 2 ». */
  fromParent: string | null;
  parentId: string | null;
  createdAt: string;
  hasAudio: boolean;
  hasScore: boolean;
  state: string;
  isActive: boolean;
};

export type TimelineEvent = {
  id: string;
  kind: "separation" | "mix" | "score";
  title: string;
  when: string;
  createdAt: string;
  /** Technical id kept for the Details disclosure only. */
  technicalId: string;
  isActive: boolean;
  /** Separation / mix activation target when applicable. */
  activationId: string | null;
};

export type TimelineItem =
  | { type: "take"; take: TakeDisplay; sortAt: string }
  | { type: "event"; event: TimelineEvent; sortAt: string };

export type DayGroup = {
  /** Calendar day key YYYY-MM-DD (local). */
  dayKey: string;
  /** Label such as « Aujourd’hui », « Hier », or a localized date. */
  dayLabel: string;
  items: TimelineItem[];
};

function parseIso(iso: string): Date | null {
  if (!iso.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Clock fragment « 14:22 » in local time. */
export function formatClock(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Relative French when-label: « aujourd’hui 14:22 », « hier 15:10 »,
 * or « 28 sept. 14:22 ».
 */
export function formatRelativeWhen(
  iso: string,
  now: Date = new Date(),
): string {
  const d = parseIso(iso);
  if (!d) return "";
  const clock = formatClock(iso);
  const day = localDayKey(d);
  const today = localDayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDayKey(yesterdayDate);
  if (day === today) return clock ? `aujourd’hui ${clock}` : "aujourd’hui";
  if (day === yesterday) return clock ? `hier ${clock}` : "hier";
  const months = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const datePart = `${d.getDate()} ${months[d.getMonth()]}`;
  return clock ? `${datePart} ${clock}` : datePart;
}

export function formatDayLabel(dayKey: string, now: Date = new Date()): string {
  const today = localDayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDayKey(yesterdayDate);
  if (dayKey === today) return "Aujourd’hui";
  if (dayKey === yesterday) return "Hier";
  const [y, m, day] = dayKey.split("-").map(Number);
  if (!y || !m || !day) return dayKey;
  const months = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  return `${day} ${months[m - 1]} ${y}`;
}

/** Truncate style for a one-line summary next to the take title. */
export function summarizeStyle(style: string, maxLen = 48): string {
  const trimmed = style.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

/**
 * Chronological ordinals (oldest = 1). Sort by createdAt, then id for
 * stable numbering when timestamps collide.
 */
export function assignTakeOrdinals(
  generations: GenerationSummary[],
): Map<string, number> {
  const sorted = [...generations].sort((a, b) => {
    const ac = a.createdAt || "";
    const bc = b.createdAt || "";
    if (ac !== bc) return ac < bc ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, number>();
  sorted.forEach((g, i) => map.set(g.id, i + 1));
  return map;
}

export function defaultTakeTitle(ordinal: number): string {
  return `Prise ${ordinal}`;
}

export function resolveTakeTitle(
  genId: string,
  ordinal: number,
  customNames: Record<string, string> | undefined,
): string {
  const custom = customNames?.[genId]?.trim();
  if (custom) return custom;
  return defaultTakeTitle(ordinal);
}

export type BuildTimelineInput = {
  generations: GenerationSummary[];
  separations: SeparationVersionSummary[];
  scores?: VersionEventSource[];
  mixes?: VersionEventSource[];
  activeGenerationId?: string | null;
  style: string;
  customNames?: Record<string, string>;
  now?: Date;
  labels: {
    fromParent: (parentTitle: string) => string;
    separation: string;
    mix: string;
    score: string;
  };
};

export function buildTakeDisplays(input: BuildTimelineInput): TakeDisplay[] {
  const {
    generations,
    activeGenerationId,
    style,
    customNames,
    now = new Date(),
    labels,
  } = input;
  const ordinals = assignTakeOrdinals(generations);
  const titleById = new Map<string, string>();
  for (const g of generations) {
    const ordinal = ordinals.get(g.id) ?? 0;
    titleById.set(g.id, resolveTakeTitle(g.id, ordinal, customNames));
  }
  const styleSummary = summarizeStyle(style);
  return generations.map((g) => {
    const ordinal = ordinals.get(g.id) ?? 0;
    const title = titleById.get(g.id) ?? defaultTakeTitle(ordinal);
    const parentIdRaw = g.parentGenerationId ?? null;
    const parentKnown = Boolean(parentIdRaw && titleById.has(parentIdRaw));
    const fromParent =
      parentKnown && parentIdRaw
        ? labels.fromParent(titleById.get(parentIdRaw)!)
        : null;
    return {
      id: g.id,
      ordinal,
      title,
      when: formatRelativeWhen(g.createdAt, now),
      styleSummary,
      fromParent,
      parentId: parentKnown ? parentIdRaw : null,
      createdAt: g.createdAt,
      hasAudio: Boolean(g.audioPath),
      hasScore: g.hasScore,
      state: g.state,
      isActive: g.id === activeGenerationId,
    };
  });
}

export function buildTimeline(input: BuildTimelineInput): DayGroup[] {
  const {
    separations,
    scores = [],
    mixes = [],
    now = new Date(),
    labels,
  } = input;
  const takes = buildTakeDisplays(input);
  const items: TimelineItem[] = [];

  for (const take of takes) {
    items.push({ type: "take", take, sortAt: take.createdAt || take.id });
  }

  for (const sep of separations) {
    items.push({
      type: "event",
      sortAt: sep.createdAt || sep.separationId,
      event: {
        id: `sep:${sep.separationId}`,
        kind: "separation",
        title: labels.separation,
        when: formatRelativeWhen(sep.createdAt, now),
        createdAt: sep.createdAt,
        technicalId: sep.separationId,
        isActive: sep.isActive,
        activationId: sep.separationId,
      },
    });
  }

  for (const mix of mixes) {
    items.push({
      type: "event",
      sortAt: mix.createdAt || mix.id,
      event: {
        id: `mix:${mix.id}`,
        kind: "mix",
        title: labels.mix,
        when: formatRelativeWhen(mix.createdAt, now),
        createdAt: mix.createdAt,
        technicalId: mix.id,
        isActive: false,
        activationId: null,
      },
    });
  }

  for (const score of scores) {
    items.push({
      type: "event",
      sortAt: score.createdAt || score.id,
      event: {
        id: `score:${score.id}`,
        kind: "score",
        title: labels.score,
        when: formatRelativeWhen(score.createdAt, now),
        createdAt: score.createdAt,
        technicalId: score.id,
        isActive: false,
        activationId: null,
      },
    });
  }

  items.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1;
    return a.type === b.type
      ? 0
      : a.type === "take"
        ? -1
        : 1;
  });

  const groups = new Map<string, TimelineItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const d = parseIso(item.sortAt);
    const key = d ? localDayKey(d) : "unknown";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }

  return order.map((dayKey) => ({
    dayKey,
    dayLabel:
      dayKey === "unknown" ? "Sans date" : formatDayLabel(dayKey, now),
    items: groups.get(dayKey)!,
  }));
}
