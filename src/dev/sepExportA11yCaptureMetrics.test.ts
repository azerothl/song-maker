import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const capturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/design/separation-export-a11y/captures-react",
);
const metricsPath = path.join(capturesDir, "metrics.json");
const i6ProductionPath = path.join(capturesDir, "i6-production-metrics.json");

type Reach = { reachable?: boolean };

type SceneMetrics = {
  footerReach?: Reach;
  exportRunReach?: Reach;
  exportDisabledReasonReach?: Reach;
  exportDescribedByLinked?: boolean;
  regenProceedReasonReach?: Reach;
  regenDescribedByLinked?: boolean;
  exportFieldsetBorder?: { style?: string; width?: string };
  exportPopinBtnHeights?: number[];
  i6OutsideBtnHeights?: number[];
  contrast?: Record<string, number | null>;
  sepRecommendAnchorOverlapPx?: number | null;
  noticeFontPx?: number | null;
  demucs327LinkCount?: number | null;
};

describe("captures-react séparation / export (#187 / #191)", () => {
  it("prouve I6 tiroir ProductionWorkspace (i6-production-metrics.json)", () => {
    const i6 = JSON.parse(readFileSync(i6ProductionPath, "utf8")) as Record<
      string,
      {
        drawerImportRecordHeightsPx?: number[];
        drawerSeparateExportHeightsPx?: number[];
        mixToolbar44Variant?: boolean;
      }
    >;
    for (const [key, m] of Object.entries(i6)) {
      if (key.includes("mix-toolbar-44")) continue;
      const heights = m.drawerImportRecordHeightsPx ?? [];
      assert.ok(heights.length >= 2, `${key} tiroir`);
      for (const h of heights) {
        assert.ok(h >= 44, `${key} bouton tiroir ${h}px`);
      }
      const sepExp = m.drawerSeparateExportHeightsPx ?? [];
      assert.ok(sepExp.length >= 2, `${key} séparer/exporter`);
      for (const h of sepExp) {
        assert.ok(h >= 44, `${key} séparer/exporter ${h}px`);
      }
    }
  });

  it("prouve visibilité réelle (footerReach.reachable)", () => {
    const metrics = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<
      string,
      SceneMetrics
    >;
    for (const [scene, m] of Object.entries(metrics)) {
      if (scene.startsWith("regen-gate-blocked")) {
        assert.equal(m.regenProceedReasonReach?.reachable, true);
        assert.equal(m.regenDescribedByLinked, true);
        continue;
      }
      assert.equal(m.footerReach?.reachable, true, `${scene} footer`);
      if (scene.startsWith("export-drawer-b1-12") || scene.startsWith("export-drawer-top")) {
        assert.equal(m.exportRunReach?.reachable, true, `${scene} export`);
        assert.equal(m.exportFieldsetBorder?.style, "none", `${scene} fieldset`);
        assert.equal(m.exportFieldsetBorder?.width, "0px", `${scene} fieldset`);
      }
      if (scene.startsWith("export-stems-none-selected")) {
        assert.equal(m.exportDisabledReasonReach?.reachable, true);
        assert.equal(m.exportDescribedByLinked, true);
      }
      if (scene.startsWith("export-mix-tight")) {
        for (const h of m.exportPopinBtnHeights ?? []) {
          assert.ok(h >= 44, `${scene} bouton ${h}px`);
        }
      }
      if (scene.startsWith("sep-unmeasured-badge")) {
        const c = m.contrast?.unmeasuredBadge;
        assert.ok(c != null && c >= 4.5, `badge contraste ${c}`);
      }
    }
    const contrast = metrics["sep-header-1280x720"]?.contrast;
    assert.ok(contrast);
    for (const [k, v] of Object.entries(contrast!)) {
      if (k === "unmeasuredBadge") continue;
      if (typeof v === "number") {
        assert.ok(v >= 4.5, `contraste ${k}: ${v} (fond effectif)`);
      }
    }
    for (const suffix of ["1280x720", "1280x768", "1280x640"]) {
      const key = `sep-header-${suffix}`;
      const m = metrics[key];
      assert.ok(m, key);
      assert.ok(
        (m.sepRecommendAnchorOverlapPx ?? 99) <= 0.51,
        `${key} overlap ${m.sepRecommendAnchorOverlapPx}`,
      );
      assert.ok(
        (m.noticeFontPx ?? 0) >= 14,
        `${key} notice ${m.noticeFontPx}px`,
      );
      assert.ok(
        (m.demucs327LinkCount ?? 0) <= 1,
        `${key} liens Demucs ${m.demucs327LinkCount}`,
      );
    }
  });
});
