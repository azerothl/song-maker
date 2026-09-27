import { describe, expect, it, beforeEach } from "vitest";
import {
  AKASHA_HOST_REGISTRATION,
  MUSIC_API_DESCRIPTOR,
  createAkashaHostBridge,
  getSharedAkashaHostBridge,
  resetSharedAkashaHostBridge,
} from "./index.js";

describe("akasha-declui adapter", () => {
  beforeEach(() => {
    resetSharedAkashaHostBridge();
  });

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

  it("starts desktop-first and can enable host adapter without throwing", async () => {
    const bridge = createAkashaHostBridge();
    expect(bridge.getMode()).toBe("desktop");
    const enabled = await bridge.enableHostMode();
    expect(enabled.ok).toBe(true);
    expect(enabled.mode).toBe("host_adapter");
    expect(enabled.messageFr).toMatch(/desktop/i);
    expect(bridge.disableHostMode().mode).toBe("desktop");
  });

  it("shares a session bridge for Settings", async () => {
    const a = getSharedAkashaHostBridge();
    await a.enableHostMode();
    expect(getSharedAkashaHostBridge().getMode()).toBe("host_adapter");
  });
});
