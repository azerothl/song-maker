import { describe, expect, it, beforeEach } from "vitest";
import {
  AKASHA_HOST_REGISTRATION,
  MUSIC_API_DESCRIPTOR,
  createAkashaHostBridge,
  getSharedAkashaHostBridge,
  resetSharedAkashaHostBridge,
  type AkashaHostTransport,
  type MusicCapabilityInvokeRequest,
} from "./index.js";

function mockTransport(
  discoverOk: boolean,
): AkashaHostTransport {
  return {
    async discover() {
      if (!discoverOk) {
        return {
          ok: false,
          errorCode: "host_unreachable",
          messageFr: "down",
        };
      }
      return {
        ok: true,
        body: {
          apiVersion: AKASHA_HOST_REGISTRATION.apiVersion,
          hostId: "akasha",
          musicApi: { id: "song-maker-music", kind: "music", version: 1 },
          declUiSurfaces: [],
        },
      };
    },
    async invoke(_url, _token, request: MusicCapabilityInvokeRequest) {
      return { ok: true, capability: request.capability, result: { echo: true } };
    },
  };
}

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

  it("stays desktop by default and does not fake a connection without URL", async () => {
    const bridge = createAkashaHostBridge();
    expect(bridge.getMode()).toBe("desktop");
    const noOptIn = await bridge.enableHostMode();
    expect(noOptIn.ok).toBe(false);
    expect(noOptIn.mode).toBe("desktop");

    const missingUrl = await bridge.enableHostMode({ hostOptIn: true, hostUrl: "" });
    expect(missingUrl.ok).toBe(false);
    expect(missingUrl.mode).toBe("unavailable");
    expect(missingUrl.messageFr).toMatch(/indisponible/i);
  });

  it("connects when a real host answers discovery", async () => {
    const bridge = createAkashaHostBridge({
      transport: mockTransport(true),
    });
    const enabled = await bridge.enableHostMode({
      hostOptIn: true,
      hostUrl: "https://akasha.example",
    });
    expect(enabled.ok).toBe(true);
    expect(enabled.mode).toBe("connected");
    expect(bridge.getMode()).toBe("connected");

    const invoked = await bridge.invokeMusicCapability({
      capability: "list_projects",
      args: {},
    });
    expect(invoked.ok).toBe(true);

    expect(bridge.disableHostMode().mode).toBe("desktop");
  });

  it("marks unavailable when host is unreachable", async () => {
    const bridge = createAkashaHostBridge({
      transport: mockTransport(false),
    });
    const result = await bridge.enableHostMode({
      hostOptIn: true,
      hostUrl: "https://akasha.example",
    });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("unavailable");
  });

  it("refuses invoke while disconnected", async () => {
    const bridge = createAkashaHostBridge();
    const result = await bridge.invokeMusicCapability({
      capability: "generate_yue2",
      args: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_connected");
    }
  });

  it("shares a session bridge for Settings", async () => {
    const a = getSharedAkashaHostBridge();
    expect(a.getMode()).toBe("desktop");
    expect(getSharedAkashaHostBridge().getMode()).toBe("desktop");
  });
});
