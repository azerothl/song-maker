import { describe, expect, it } from "vitest";
import {
  defaultBus,
  defaultSend,
  findRoutingCycles,
  validateRoutingGraph,
} from "./routing.js";

describe("routing validation (#98)", () => {
  it("accepts a track → group → master graph", () => {
    const group = defaultBus("group", "Drums");
    const result = validateRoutingGraph({
      tracks: [{ id: "trk-drums", groupId: group.id }],
      buses: [group],
      sends: [],
    });
    expect(result.ok).toBe(true);
    expect(result.recovered.trackGroupIds["trk-drums"]).toBe(group.id);
  });

  it("drops sends to missing aux and reports the issue", () => {
    const result = validateRoutingGraph({
      tracks: [{ id: "trk-vox" }],
      buses: [],
      sends: [defaultSend("trk-vox", "aux-missing")],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing_bus")).toBe(true);
    expect(result.recovered.sends).toHaveLength(0);
  });

  it("rejects send destinations that are not aux buses", () => {
    const group = defaultBus("group", "G");
    const result = validateRoutingGraph({
      tracks: [{ id: "trk-a" }],
      buses: [group],
      sends: [defaultSend("trk-a", group.id)],
    });
    expect(result.issues.some((i) => i.code === "send_to_non_aux")).toBe(true);
    expect(result.recovered.sends).toHaveLength(0);
  });

  it("detects and breaks group cycles", () => {
    const a = defaultBus("group", "A");
    const b = defaultBus("group", "B");
    a.parentGroupId = b.id;
    b.parentGroupId = a.id;
    const cycles = findRoutingCycles({
      tracks: [],
      buses: [a, b],
      sends: [],
    });
    expect(cycles.length).toBeGreaterThan(0);
    const result = validateRoutingGraph({
      tracks: [{ id: "trk-a", groupId: a.id }],
      buses: [a, b],
      sends: [],
    });
    expect(result.issues.some((i) => i.code === "cycle")).toBe(true);
    expect(result.recovered.buses.every((bus) => !bus.parentGroupId)).toBe(
      true,
    );
    expect(result.recovered.trackGroupIds["trk-a"]).toBeNull();
  });

  it("keeps a valid pre-fader send to aux", () => {
    const aux = defaultBus("aux", "Reverb");
    const send = defaultSend("trk-vox", aux.id, {
      gainDb: -3,
      preFader: true,
    });
    const result = validateRoutingGraph({
      tracks: [{ id: "trk-vox" }],
      buses: [aux],
      sends: [send],
    });
    expect(result.ok).toBe(true);
    expect(result.recovered.sends).toHaveLength(1);
    expect(result.recovered.sends[0]!.preFader).toBe(true);
  });
});
