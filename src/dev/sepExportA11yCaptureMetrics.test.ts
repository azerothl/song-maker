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

describe("captures-react séparation / export (#187 / #191)", () => {
  it("prouve visibilité réelle (footerReach.reachable)", () => {
    const metrics = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<
      string,
      { footerReach?: Reach; exportRunReach?: Reach; contrast?: Record<string, number> }
    >;
    for (const [scene, m] of Object.entries(metrics)) {
      if (scene !== "regen-gate-blocked") {
        assert.equal(
          m.footerReach?.reachable,
          true,
          `${scene} footer`,
        );
      }
      if (scene.startsWith("export-drawer")) {
        assert.equal(m.exportRunReach?.reachable, true, `${scene} export`);
      }
      if (scene === "export-stems-none-selected") {
        assert.equal(m.exportDisabledReasonReach?.reachable, true);
        assert.equal(m.exportDescribedByLinked, true);
      }
      if (scene === "regen-gate-blocked") {
        assert.equal(m.regenProceedReasonReach?.reachable, true);
        assert.equal(m.regenDescribedByLinked, true);
      }
    }
    const contrast = metrics["sep-header"]?.contrast;
    assert.ok(contrast);
    for (const [k, v] of Object.entries(contrast!)) {
      if (typeof v === "number") {
        assert.ok(v >= 4.5, `contraste ${k}: ${v}`);
      }
    }
  });
});
