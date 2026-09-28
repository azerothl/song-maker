import { describe, expect, it } from "vitest";
import {
  assertAbcConfirmedForYue2,
  checkSheetsageReadiness,
  createSheetsageTranscriber,
  defaultSheetsageProbe,
  REINTERPRETATION_DISCLAIMER_FR,
  SHEETSAGE2_LICENSE,
  SHEETSAGE2_WEIGHTS,
} from "./index.js";

describe("@song-maker/sheetsage", () => {
  it("pins CC BY-NC weights metadata from the spec", () => {
    expect(SHEETSAGE2_LICENSE).toBe("cc-by-nc-4.0");
    expect(SHEETSAGE2_WEIGHTS.filename).toBe("sheetsage2-orig.gguf");
    expect(SHEETSAGE2_WEIGHTS.sha256).toHaveLength(64);
  });

  it("blocks without license, binary, or weights", () => {
    expect(
      checkSheetsageReadiness(defaultSheetsageProbe()).status,
    ).toBe("license_not_accepted");
    expect(
      checkSheetsageReadiness(
        defaultSheetsageProbe({ licenseAccepted: true }),
      ).status,
    ).toBe("missing_binary");
    expect(
      checkSheetsageReadiness(
        defaultSheetsageProbe({
          licenseAccepted: true,
          binaryPresent: true,
        }),
      ).status,
    ).toBe("missing_weights");
  });

  it("marks ready when probe is complete; stub without runner stays honest", async () => {
    const probe = defaultSheetsageProbe({
      licenseAccepted: true,
      binaryPresent: true,
      weightsPresent: true,
      acceleration: "cuda",
    });
    expect(checkSheetsageReadiness(probe).canAttemptTranscribe).toBe(true);
    expect(checkSheetsageReadiness(probe).messageFr).toMatch(/prêt pour transcription/i);
    const t = createSheetsageTranscriber(probe);
    const result = await t.transcribe({
      source: { kind: "user_track", id: "t1", label: "Piste" },
      licenseAccepted: true,
    });
    expect(result.status).toBe("not_implemented");
    expect(result.abc).toBeNull();
    expect(result.reinterpretationDisclaimerFr).toContain("CC BY-NC");
  });

  it("wired runner returns ABC when injected", async () => {
    const probe = defaultSheetsageProbe({
      licenseAccepted: true,
      binaryPresent: true,
      weightsPresent: true,
    });
    const t = createSheetsageTranscriber(probe, async () => ({
      status: "ok",
      jobId: "j1",
      abc: "X:1\nT:t\nM:4/4\nK:C\nCDEF|",
      warnings: [],
      messageFr: "ok",
      reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
    }));
    const result = await t.transcribe({
      source: { kind: "user_track", id: "t1", label: "Piste", path: "/a.wav" },
      licenseAccepted: true,
    });
    expect(result.status).toBe("ok");
    expect(result.abc).toMatch(/^X:/m);
  });

  it("never invents ABC when runtime missing", async () => {
    const t = createSheetsageTranscriber(defaultSheetsageProbe());
    const result = await t.transcribe({
      source: { kind: "mixdown", id: "m1", label: "Mix" },
      licenseAccepted: false,
    });
    expect(result.status).toBe("license_not_accepted");
    expect(result.abc == null || result.abc === "").toBe(true);
  });

  it("gates YuE2 until ABC is confirmed", () => {
    expect(assertAbcConfirmedForYue2(null).ok).toBe(false);
    expect(assertAbcConfirmedForYue2("").ok).toBe(false);
    expect(assertAbcConfirmedForYue2("CDEF").ok).toBe(false);
    expect(
      assertAbcConfirmedForYue2("X:1\nT:test\nM:4/4\nK:C\nCDEF|").ok,
    ).toBe(true);
  });

  it("exposes reinterpretation disclaimer", () => {
    expect(REINTERPRETATION_DISCLAIMER_FR).toMatch(/Nouvelle interprétation/);
  });
});
