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

  it("always offers folder|zip and mix|stems modes on the unified dialog defaults", () => {
    const opts = defaultExportOptions();
    assert.equal(opts.mode, "mix");
    assert.ok(opts.pack === "folder" || opts.pack === "zip");
    assert.equal(opts.bitDepth, 24);
  });
});

describe("export UI surface (#168 / #187)", () => {
  it("does not ship a second tracks-only export popin module", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const popin = path.resolve(
      import.meta.dirname,
      "../components/ExportTracksPopin.tsx",
    );
    await assert.rejects(() => fs.access(popin), /ENOENT/);
  });

  it("keeps ExportWizard as portable package body (no mix/stems path)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const wizard = await fs.readFile(
      path.resolve(import.meta.dirname, "../components/ExportWizard.tsx"),
      "utf8",
    );
    assert.match(wizard, /Portable project package UI/);
    assert.doesNotMatch(wizard, /exportAlignedStems|ExportFormat|mode === "stems"/);
    const dialog = await fs.readFile(
      path.resolve(import.meta.dirname, "../components/ExportDialog.tsx"),
      "utf8",
    );
    assert.match(dialog, /export\.dialog\.mode\.package/);
    assert.match(dialog, /mode === "package"/);
    assert.doesNotMatch(dialog, /Maquette Alphonse|mockupMissing/);
    assert.doesNotMatch(dialog, /window\.alert/);
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
