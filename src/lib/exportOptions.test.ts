import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultExportOptions,
  isLosslessFormat,
  visibleExportControls,
} from "./exportOptions.ts";
import {
  buildQualityTimeOptions,
  canDownloadSeparator,
  formatDurationFr,
  recommendSeparator,
  timeLabelFr,
} from "@song-maker/stem-providers";

describe("exportOptions (#168)", () => {
  it("shows bit depth for lossless and bitrate for compressed — never both", () => {
    const wav = visibleExportControls("wav");
    assert.equal(wav.showBitDepth, true);
    assert.equal(wav.showBitrate, false);
    const flac = visibleExportControls("flac");
    assert.equal(flac.showBitDepth, true);
    assert.equal(flac.showBitrate, false);
    const mp3 = visibleExportControls("mp3");
    assert.equal(mp3.showBitDepth, false);
    assert.equal(mp3.showBitrate, true);
    assert.equal(isLosslessFormat("wav"), true);
    assert.equal(isLosslessFormat("mp3"), false);
    assert.equal(defaultExportOptions().pack, "folder");
  });
});

describe("separation recommend + license (#166 #167)", () => {
  it("every quality option exposes a time label", () => {
    const options = buildQualityTimeOptions({
      focus: "vocals",
      audioDurationSec: 120,
    });
    assert.ok(options.length >= 2);
    for (const opt of options) {
      const label = `${formatDurationFr(opt.estimatedMs)} · ${timeLabelFr(opt.kind)}`;
      assert.match(label, /exemple, non mesuré|mesuré/);
    }
    assert.equal(recommendSeparator("vocals"), "mel_band_roformer");
  });

  it("blocks download until the license checkbox is accepted", () => {
    assert.equal(canDownloadSeparator("mel_band_roformer", {}), false);
    assert.equal(
      canDownloadSeparator("mel_band_roformer", { mel_band_roformer: true }),
      true,
    );
    assert.equal(canDownloadSeparator("bs_roformer", undefined), false);
    assert.equal(canDownloadSeparator("htdemucs", {}), false);
    assert.equal(canDownloadSeparator("htdemucs", { htdemucs: true }), true);
  });
});
