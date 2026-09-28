import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPortablePackagePlan,
  shouldIncludeInPortablePackage,
} from "./projectPackage";

describe("portable package plan (#99)", () => {
  it("includes project artifacts and excludes model weights", () => {
    assert.equal(shouldIncludeInPortablePackage("project.json").include, true);
    assert.equal(
      shouldIncludeInPortablePackage("mixes/mix-v001.json").include,
      true,
    );
    assert.equal(
      shouldIncludeInPortablePackage("models/lora/foo.gguf").include,
      false,
    );
  });

  it("summarizes sizes and missing media", () => {
    const plan = buildPortablePackagePlan({
      projectId: "proj-1",
      title: "Demo",
      inventory: [
        { relativePath: "project.json", byteLength: 100, exists: true },
        {
          relativePath: "mixes/mix-v001.json",
          byteLength: 200,
          exists: true,
        },
        {
          relativePath: "mixes/mix-v001.production.json",
          byteLength: 50,
          exists: true,
        },
        {
          relativePath: "separations/sep-1/vocals.wav",
          byteLength: 1_000_000,
          exists: true,
        },
        {
          relativePath: "models/yue2.gguf",
          byteLength: 5_000_000_000,
          exists: true,
        },
        {
          relativePath: "generations/gen-1/audio.wav",
          byteLength: 0,
          exists: false,
        },
      ],
    });
    assert.equal(plan.estimatedBytes, 100 + 200 + 50 + 1_000_000);
    assert.equal(plan.excludedBytes, 5_000_000_000);
    assert.ok(plan.missing.includes("generations/gen-1/audio.wav"));
    assert.equal(plan.artifacts.filter((a) => a.included).length, 4);
    assert.ok(plan.licenses.length > 0);
  });
});
