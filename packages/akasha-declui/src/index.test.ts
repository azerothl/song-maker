import { describe, expect, it } from "vitest";
import {
  AKASHA_HOST_REGISTRATION,
  MUSIC_API_DESCRIPTOR,
  createAkashaHostBridge,
} from "./index.js";

describe("akasha-declui stubs", () => {
  it("describes a music API distinct from TTS", () => {
    expect(MUSIC_API_DESCRIPTOR.kind).toBe("music");
    expect(MUSIC_API_DESCRIPTOR.id).toBe("song-maker-music");
    expect(MUSIC_API_DESCRIPTOR.capabilities).toContain("generate_yue2");
  });

  it("registers DeclUI surfaces and points pack catalog at lora-packs", () => {
    expect(AKASHA_HOST_REGISTRATION.hostId).toBe("akasha");
    expect(AKASHA_HOST_REGISTRATION.packCatalogPackage).toBe(
      "@song-maker/lora-packs",
    );
    expect(
      AKASHA_HOST_REGISTRATION.declUiSurfaces.some((s) => s.id === "agent_panel"),
    ).toBe(true);
  });

  it("refuses register() until phase 4 wiring", async () => {
    const bridge = createAkashaHostBridge();
    expect(bridge.describe()).toEqual(AKASHA_HOST_REGISTRATION);
    await expect(bridge.register()).rejects.toThrow(/phase-4 stub/i);
  });
});
