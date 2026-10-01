/**
 * Mix routing: group / aux buses, sends, cycle detection.
 * Pure helpers for the offline bake and UI validation (#98).
 */

export type BusKind = "group" | "aux";

export type MixBus = {
  id: string;
  kind: BusKind;
  name: string;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Optional parent group (groups only). Aux returns go to master. */
  parentGroupId?: string | null;
};

export type MixSend = {
  id: string;
  fromTrackId: string;
  toBusId: string;
  gainDb: number;
  /** true = take signal before track fader; false = after fader. */
  preFader: boolean;
  enabled: boolean;
};

export type RoutingTrackRef = {
  id: string;
  /** When set, post-fader track output feeds this group instead of master. */
  groupId?: string | null;
};

export type RoutingGraphInput = {
  tracks: RoutingTrackRef[];
  buses: MixBus[];
  sends: MixSend[];
};

export type RoutingIssueCode =
  | "missing_bus"
  | "missing_track"
  | "missing_parent"
  | "cycle"
  | "aux_parent"
  | "send_to_non_aux"
  | "self_parent";

export type RoutingIssue = {
  code: RoutingIssueCode;
  message: string;
  busId?: string;
  sendId?: string;
  trackId?: string;
};

export type RoutingValidation = {
  ok: boolean;
  issues: RoutingIssue[];
  /** Safe buses/sends after dropping broken edges (missing dest / cycles). */
  recovered: {
    buses: MixBus[];
    sends: MixSend[];
    trackGroupIds: Record<string, string | null>;
  };
};

function busById(buses: MixBus[]): Map<string, MixBus> {
  return new Map(buses.map((b) => [b.id, b]));
}

/**
 * Detect cycles among group parenting + track→group edges.
 * Aux buses are leaves toward master (no parent); sends do not create
 * signal cycles because aux returns only sum to master.
 */
export function findRoutingCycles(input: RoutingGraphInput): string[][] {
  const nodes = new Set<string>();
  const edges: Array<[string, string]> = [];

  for (const bus of input.buses) {
    nodes.add(`bus:${bus.id}`);
    if (bus.kind === "group" && bus.parentGroupId) {
      edges.push([`bus:${bus.id}`, `bus:${bus.parentGroupId}`]);
    }
  }
  for (const track of input.tracks) {
    nodes.add(`trk:${track.id}`);
    if (track.groupId) {
      edges.push([`trk:${track.id}`, `bus:${track.groupId}`]);
    }
  }

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];

  function dfs(n: string) {
    if (done.has(n)) return;
    if (visiting.has(n)) {
      const idx = stack.indexOf(n);
      cycles.push(idx >= 0 ? stack.slice(idx).concat(n) : [n]);
      return;
    }
    visiting.add(n);
    stack.push(n);
    for (const next of adj.get(n) ?? []) dfs(next);
    stack.pop();
    visiting.delete(n);
    done.add(n);
  }

  for (const n of adj.keys()) dfs(n);
  return cycles;
}

/**
 * Validate routing and recover by dropping broken/cyclic edges.
 * Sidechain is out of scope here (handled separately).
 */
export function validateRoutingGraph(input: RoutingGraphInput): RoutingValidation {
  const issues: RoutingIssue[] = [];
  const busesMap = busById(input.buses);
  const trackIds = new Set(input.tracks.map((t) => t.id));

  const buses: MixBus[] = [];
  for (const bus of input.buses) {
    if (bus.kind === "aux" && bus.parentGroupId) {
      issues.push({
        code: "aux_parent",
        message: `Le bus auxiliaire « ${bus.name} » ne peut pas avoir de parent groupe.`,
        busId: bus.id,
      });
      buses.push({ ...bus, parentGroupId: null });
      continue;
    }
    if (bus.parentGroupId === bus.id) {
      issues.push({
        code: "self_parent",
        message: `Le bus « ${bus.name} » ne peut pas être son propre parent.`,
        busId: bus.id,
      });
      buses.push({ ...bus, parentGroupId: null });
      continue;
    }
    if (bus.parentGroupId && !busesMap.has(bus.parentGroupId)) {
      issues.push({
        code: "missing_parent",
        message: `Parent manquant pour le bus « ${bus.name} » — détaché.`,
        busId: bus.id,
      });
      buses.push({ ...bus, parentGroupId: null });
      continue;
    }
    if (bus.parentGroupId) {
      const parent = busesMap.get(bus.parentGroupId);
      if (parent && parent.kind !== "group") {
        issues.push({
          code: "missing_parent",
          message: `Le parent de « ${bus.name} » doit être un groupe.`,
          busId: bus.id,
        });
        buses.push({ ...bus, parentGroupId: null });
        continue;
      }
    }
    buses.push({ ...bus });
  }

  const recoveredBusesMap = busById(buses);
  const sends: MixSend[] = [];
  for (const send of input.sends) {
    if (!trackIds.has(send.fromTrackId)) {
      issues.push({
        code: "missing_track",
        message: `Send « ${send.id} » : piste source introuvable — ignoré.`,
        sendId: send.id,
        trackId: send.fromTrackId,
      });
      continue;
    }
    const dest = recoveredBusesMap.get(send.toBusId);
    if (!dest) {
      issues.push({
        code: "missing_bus",
        message: `Send « ${send.id} » : bus destination manquant — ignoré.`,
        sendId: send.id,
      });
      continue;
    }
    if (dest.kind !== "aux") {
      issues.push({
        code: "send_to_non_aux",
        message: `Send « ${send.id} » : la destination doit être un bus auxiliaire.`,
        sendId: send.id,
        busId: send.toBusId,
      });
      continue;
    }
    sends.push({ ...send });
  }

  const trackGroupIds: Record<string, string | null> = {};
  const tracksForCycle: RoutingTrackRef[] = [];
  for (const track of input.tracks) {
    let groupId = track.groupId ?? null;
    if (groupId && !recoveredBusesMap.has(groupId)) {
      issues.push({
        code: "missing_bus",
        message: `Groupe manquant pour la piste « ${track.id} » — détachée.`,
        trackId: track.id,
        busId: groupId,
      });
      groupId = null;
    } else if (groupId) {
      const bus = recoveredBusesMap.get(groupId);
      if (bus && bus.kind !== "group") {
        issues.push({
          code: "missing_bus",
          message: `La piste « ${track.id} » doit cibler un bus de groupe.`,
          trackId: track.id,
          busId: groupId,
        });
        groupId = null;
      }
    }
    trackGroupIds[track.id] = groupId;
    tracksForCycle.push({ id: track.id, groupId });
  }

  const cycles = findRoutingCycles({
    tracks: tracksForCycle,
    buses,
    sends,
  });
  if (cycles.length > 0) {
    for (const cycle of cycles) {
      issues.push({
        code: "cycle",
        message: `Cycle de routage détecté (${cycle.join(" → ")}) — liens groupe cassés.`,
      });
    }
    // Break cycles: clear all group parents and track group assignments.
    for (let i = 0; i < buses.length; i++) {
      const b = buses[i]!;
      if (b.parentGroupId) {
        buses[i] = { ...b, parentGroupId: null };
      }
    }
    for (const id of Object.keys(trackGroupIds)) {
      trackGroupIds[id] = null;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    recovered: { buses, sends, trackGroupIds },
  };
}

/** Topological order of group buses (parents after children). */
export function topoSortGroupBuses(buses: MixBus[]): MixBus[] {
  const groups = buses.filter((b) => b.kind === "group");
  const byId = busById(groups);
  const indeg = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const g of groups) {
    indeg.set(g.id, indeg.get(g.id) ?? 0);
    if (g.parentGroupId && byId.has(g.parentGroupId)) {
      indeg.set(g.parentGroupId, (indeg.get(g.parentGroupId) ?? 0) + 1);
      const list = children.get(g.id) ?? [];
      list.push(g.parentGroupId);
      children.set(g.id, list);
    }
  }
  // Kahn: start with nodes that nobody feeds into them as child→parent edge
  // We want children first, then parents: edge child → parent, so process
  // nodes with no incoming from other groups' "I am your child" ...
  // Simpler: DFS post-order from leaves.
  const result: MixBus[] = [];
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const g = byId.get(id);
    if (!g) return;
    // Visit siblings that feed into this? Visit this first, then parent.
    result.push(g);
    if (g.parentGroupId) visit(g.parentGroupId);
  }
  for (const g of groups) {
    if (![...groups].some((o) => o.parentGroupId === g.id)) {
      visit(g.id);
    }
  }
  for (const g of groups) visit(g.id);
  // Deduplicate while preserving first-seen (child before parent).
  const out: MixBus[] = [];
  const got = new Set<string>();
  for (const g of result) {
    if (got.has(g.id)) continue;
    got.add(g.id);
    out.push(g);
  }
  return out;
}

export function newBusId(kind: BusKind): string {
  const c = globalThis.crypto;
  const suffix =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${kind}-${suffix}`;
}

export function newSendId(): string {
  const c = globalThis.crypto;
  const suffix =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `send-${suffix}`;
}

export function defaultBus(kind: BusKind, name?: string): MixBus {
  return {
    id: newBusId(kind),
    kind,
    name: name ?? (kind === "group" ? "Groupe" : "Aux"),
    gainDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    parentGroupId: null,
  };
}

export function defaultSend(
  fromTrackId: string,
  toBusId: string,
  opts?: Partial<Pick<MixSend, "gainDb" | "preFader" | "enabled">>,
): MixSend {
  return {
    id: newSendId(),
    fromTrackId,
    toBusId,
    gainDb: opts?.gainDb ?? -6,
    preFader: opts?.preFader ?? false,
    enabled: opts?.enabled ?? true,
  };
}
