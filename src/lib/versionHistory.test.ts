import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerationSummary, SeparationVersionSummary } from "./types.ts";
import {
  assignTakeOrdinals,
  buildTimeline,
  formatDayLabel,
  formatRelativeWhen,
  resolveTakeTitle,
  summarizeStyle,
} from "./versionHistory.ts";

function gen(
  partial: Partial<GenerationSummary> & Pick<GenerationSummary, "id">,
): GenerationSummary {
  return {
    createdAt: "2026-09-28T12:00:00.000Z",
    seed: 1,
    cot: "full",
    state: "generated",
    hasScore: false,
    canContinue: false,
    ...partial,
  };
}

const labels = {
  fromParent: (parentTitle: string) => `à partir de ${parentTitle}`,
  separation: "Pistes séparées",
  mix: "Mix modifié",
  score: "Partition mise à jour",
};

describe("summarizeStyle", () => {
  it("retourne vide si le style est blanc", () => {
    assert.equal(summarizeStyle("  "), "");
  });

  it("tronque sans couper au milieu d’un mot long", () => {
    const long =
      "warm piano pop, expressive female voice, soft pads and gentle drums overnight";
    const out = summarizeStyle(long, 40);
    assert.ok(out.endsWith("…"));
    assert.ok(out.length <= 40);
    assert.equal(out.includes("gen-"), false);
  });
});

describe("assignTakeOrdinals", () => {
  it("numérote du plus ancien au plus récent", () => {
    const map = assignTakeOrdinals([
      gen({ id: "gen-003", createdAt: "2026-09-29T10:00:00.000Z" }),
      gen({ id: "gen-001", createdAt: "2026-09-28T10:00:00.000Z" }),
      gen({ id: "gen-002", createdAt: "2026-09-28T18:00:00.000Z" }),
    ]);
    assert.equal(map.get("gen-001"), 1);
    assert.equal(map.get("gen-002"), 2);
    assert.equal(map.get("gen-003"), 3);
  });
});

describe("resolveTakeTitle", () => {
  it("préfère le nom choisi par l’utilisateur", () => {
    assert.equal(
      resolveTakeTitle("gen-002", 2, { "gen-002": "Ballade douce" }),
      "Ballade douce",
    );
    assert.equal(resolveTakeTitle("gen-002", 2, {}), "Prise 2");
  });
});

describe("formatRelativeWhen", () => {
  it("dit aujourd’hui / hier sans exposer d’identifiant technique", () => {
    const now = new Date(2026, 8, 29, 16, 0, 0); // 29 sept local
    const today = new Date(2026, 8, 29, 14, 22, 0).toISOString();
    const yesterday = new Date(2026, 8, 28, 15, 10, 0).toISOString();
    assert.match(formatRelativeWhen(today, now), /^aujourd’hui \d{2}:\d{2}$/);
    assert.match(formatRelativeWhen(yesterday, now), /^hier \d{2}:\d{2}$/);
    assert.equal(formatRelativeWhen(today, now).includes("gen-"), false);
  });
});

describe("formatDayLabel", () => {
  it("groupe Aujourd’hui et Hier", () => {
    const now = new Date(2026, 8, 29, 12, 0, 0);
    assert.equal(formatDayLabel("2026-09-29", now), "Aujourd’hui");
    assert.equal(formatDayLabel("2026-09-28", now), "Hier");
    assert.equal(formatDayLabel("2026-09-20", now), "20 septembre 2026");
  });
});

describe("buildTimeline", () => {
  it("liste chronologique lisible sans ids techniques dans les titres", () => {
    const generations: GenerationSummary[] = [
      gen({
        id: "gen-001",
        createdAt: "2026-09-28T10:00:00.000Z",
        audioPath: "/a.wav",
      }),
      gen({
        id: "gen-002",
        createdAt: "2026-09-29T11:00:00.000Z",
        parentGenerationId: "gen-001",
        audioPath: "/b.wav",
      }),
    ];
    const separations: SeparationVersionSummary[] = [
      {
        separationId: "sep-001",
        mixId: "mix-v1",
        createdAt: "2026-09-29T12:00:00.000Z",
        isActive: true,
      },
    ];
    const now = new Date(2026, 8, 29, 16, 0, 0);
    const groups = buildTimeline({
      generations,
      separations,
      scores: [
        {
          id: "score-v3",
          createdAt: "2026-09-29T13:00:00.000Z",
          kind: "score",
        },
      ],
      mixes: [
        { id: "mix-v2", createdAt: "2026-09-29T14:00:00.000Z", kind: "mix" },
      ],
      activeGenerationId: "gen-002",
      style: "warm piano pop",
      customNames: { "gen-002": "Version soir" },
      now,
      labels,
    });

    const flat = groups.flatMap((g) => g.items);
    const takeTitles = flat
      .filter((i) => i.type === "take")
      .map((i) => (i.type === "take" ? i.take.title : ""));
    assert.deepEqual(takeTitles.sort(), ["Prise 1", "Version soir"].sort());

    const child = flat.find(
      (i) => i.type === "take" && i.take.id === "gen-002",
    );
    assert.ok(child && child.type === "take");
    assert.equal(child.take.fromParent, "à partir de Prise 1");
    assert.equal(child.take.isActive, true);

    const titles = flat.map((i) =>
      i.type === "take" ? i.take.title : i.event.title,
    );
    for (const title of titles) {
      assert.equal(title.includes("gen-"), false);
      assert.equal(title.includes("sep-"), false);
      assert.equal(title.includes("mix-v"), false);
      assert.equal(title.includes("score-v"), false);
      assert.equal(title.includes("racine"), false);
      assert.equal(title.includes("parent "), false);
    }

    const eventTitles = flat
      .filter((i) => i.type === "event")
      .map((i) => (i.type === "event" ? i.event.title : ""));
    assert.ok(eventTitles.includes("Pistes séparées"));
    assert.ok(eventTitles.includes("Mix modifié"));
    assert.ok(eventTitles.includes("Partition mise à jour"));

    // Newest first within the day.
    const today = groups.find((g) => g.dayLabel === "Aujourd’hui");
    assert.ok(today);
    assert.equal(today.items[0].type, "event");
    if (today.items[0].type === "event") {
      assert.equal(today.items[0].event.title, "Mix modifié");
    }
  });
});
