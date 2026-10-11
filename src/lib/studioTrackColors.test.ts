import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import {
  defaultStudioTrackColor,
  libraryWaveColors,
  readStudioTrackColors,
  saveStudioTrackColor,
} from "./studioTrackColors";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const storage = new Map<string, string>();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

afterEach(() => storage.clear());
after(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("studio track colors", () => {
  it("gives adjacent tracks distinct defaults and wraps the palette", () => {
    const colors = Array.from({ length: 16 }, (_, index) => defaultStudioTrackColor(index));

    assert.equal(new Set(colors).size, colors.length);
    assert.equal(defaultStudioTrackColor(16), defaultStudioTrackColor(0));
  });

  it("persists a chosen color by project and track", () => {
    saveStudioTrackColor("project-a", "track-1", "#12abef");
    saveStudioTrackColor("project-a", "track-2", "#aabbcc");

    assert.deepEqual(readStudioTrackColors("project-a"), {
      "track-1": "#12abef",
      "track-2": "#aabbcc",
    });
    assert.deepEqual(readStudioTrackColors("project-b"), {});
  });

  it("ignores invalid stored colors and refuses invalid updates", () => {
    storage.set(
      "song-maker.studio-track-colors.v1.project-a",
      JSON.stringify({ good: "#123456", bad: "red", malformed: 4 }),
    );

    saveStudioTrackColor("project-a", "bad-update", "#12fg00");

    assert.deepEqual(readStudioTrackColors("project-a"), { good: "#123456" });
  });

  it("keeps library waveform colors stable and distinct across titles", () => {
    assert.deepEqual(libraryWaveColors("track-a"), libraryWaveColors("track-a"));
    assert.notEqual(libraryWaveColors("track-a").color, libraryWaveColors("track-b").color);
  });
});
