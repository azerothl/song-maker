import { describe, expect, it } from "vitest";
import {
  MemoryTrainingJobStore,
  QUALITY_DISCLAIMER_FR,
  cancelTrainingJob,
  cleanupTrainingJob,
  launchTrainingJob,
  splitByWholeSong,
  validateAdapterForCatalog,
  validateCorpus,
  type CorpusSong,
} from "./index.js";

function song(
  id: string,
  path: string,
  durationMs = 60_000,
  sha?: string,
): CorpusSong {
  return {
    songId: id,
    title: id,
    audioPath: path,
    format: "wav",
    durationMs,
    contentSha256: sha ?? null,
  };
}

describe("@song-maker/lora-training", () => {
  it("rejects empty / bad formats / short clips / dupes", () => {
    expect(validateCorpus([]).ok).toBe(false);
    expect(
      validateCorpus([
        {
          ...song("a", "a.mid", 60_000),
          format: "unknown",
        },
      ]).issues.some((i) => i.code === "unsupported_format"),
    ).toBe(true);
    expect(
      validateCorpus([song("a", "a.wav", 1000)]).issues.some(
        (i) => i.code === "duration_too_short",
      ),
    ).toBe(true);
    const dup = validateCorpus([
      song("a", "x.wav", 60_000, "abc"),
      song("b", "y.wav", 60_000, "abc"),
    ]);
    expect(dup.ok).toBe(false);
    expect(dup.issues.some((i) => i.code === "duplicate_hash")).toBe(true);
  });

  it("splits by whole song without overlap", () => {
    const songs = [
      song("s1", "1.wav"),
      song("s2", "2.wav"),
      song("s3", "3.wav"),
      song("s4", "4.wav"),
      song("s5", "5.wav"),
    ];
    const split = splitByWholeSong(songs, 0.2, () => 0.1);
    expect(split.valSongIds.length).toBeGreaterThanOrEqual(1);
    expect(split.trainSongIds.length).toBeGreaterThanOrEqual(1);
    for (const id of split.valSongIds) {
      expect(split.trainSongIds).not.toContain(id);
    }
  });

  it("writes job folder and returns not_implemented without trainer", async () => {
    const store = new MemoryTrainingJobStore();
    const songs = [song("s1", "1.wav"), song("s2", "2.wav")];
    const result = await launchTrainingJob(
      {
        corpusRoot: "/corpus",
        songs,
        rightsConfirmed: true,
        trainerExists: false,
      },
      store,
    );
    expect(result.status).toBe("not_implemented");
    expect(result.shelledOut).toBe(false);
    expect(result.manifest.autoActivate).toBe(false);
    expect(result.manifest.catalogEligible).toBe(false);
    expect(await store.exists(`${result.jobDir}/manifest.json`)).toBe(true);
    expect(result.messageFr).toContain("non implémenté");
    expect(QUALITY_DISCLAIMER_FR).toMatch(/clonage/);
  });

  it("queues when trainer exists but never auto-activates", async () => {
    const store = new MemoryTrainingJobStore();
    const result = await launchTrainingJob(
      {
        corpusRoot: "/corpus",
        songs: [song("s1", "1.wav"), song("s2", "2.wav")],
        rightsConfirmed: true,
        trainerExists: true,
        trainerScriptPath: "scripts/lora-train-nar.py",
      },
      store,
    );
    expect(result.status).toBe("queued");
    expect(result.shelledOut).toBe(true);
    expect(result.manifest.autoActivate).toBe(false);
  });

  it("requires rights confirmation", async () => {
    const store = new MemoryTrainingJobStore();
    const result = await launchTrainingJob(
      {
        corpusRoot: "/corpus",
        songs: [song("s1", "1.wav")],
        rightsConfirmed: false,
      },
      store,
    );
    expect(result.status).toBe("failed");
    expect(result.messageFr).toMatch(/droits/);
  });

  it("cancel / cleanup / adapter gate", async () => {
    const store = new MemoryTrainingJobStore();
    const launched = await launchTrainingJob(
      {
        corpusRoot: "/corpus",
        songs: [song("s1", "1.wav"), song("s2", "2.wav")],
        rightsConfirmed: true,
        trainerExists: true,
        trainerScriptPath: "scripts/lora-train-nar.py",
      },
      store,
    );
    const cancelled = await cancelTrainingJob(launched.jobId, store);
    expect(cancelled.status).toBe("cancelled");
    const cleaned = await cleanupTrainingJob(launched.jobId, store);
    expect(cleaned.removed).toBe(true);

    const fused = validateAdapterForCatalog({
      adapterPath: "/x.safetensors",
      layoutHint: "fused",
    });
    expect(fused.catalogEligible).toBe(false);
    expect(fused.autoActivate).toBe(false);

    const ready = validateAdapterForCatalog({
      adapterPath: "/x.safetensors",
      layoutHint: "unfused_safetensors",
      loadProbeOk: true,
      shortRenderOk: true,
      sha256: "a".repeat(64),
    });
    expect(ready.status).toBe("catalog_ready");
    expect(ready.catalogEligible).toBe(true);
    expect(ready.autoActivate).toBe(false);
  });
});
