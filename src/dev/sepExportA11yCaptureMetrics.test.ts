import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const metricsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/design/separation-export-a11y/captures-react/metrics.json",
);

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
  contrast?: Record<string, number | null>;
};

describe("captures-react séparation / export (#187 / #191)", () => {
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
      if (scene.startsWith("export-drawer-top")) {
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
  });
});
