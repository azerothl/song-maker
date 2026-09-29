import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const metricsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/design/sidebar-repliable/captures-react/metrics.json",
);

type MetricsFile = {
  replie_1280?: { checks?: { collapsedIconsCentered?: boolean; iconCenterById?: Record<string, boolean> } };
  replie_icon_center_apres_1280?: {
    checks?: { collapsedIconsCentered?: boolean; iconCenterById?: Record<string, boolean> };
  };
  deplie_1280?: { sidebarWidthPx?: number; toggleSizePx?: number[]; navTargetSizesPx?: number[][] };
  deplie_1280_ref?: { sidebarWidthPx?: number; toggleSizePx?: number[]; navTargetSizesPx?: number[][] };
};

describe("sidebar capture metrics (régression #161)", () => {
  it("centre chaque icône repliée à 28 px ±1 après correctif", () => {
    const raw = readFileSync(metricsPath, "utf8");
    const metrics = JSON.parse(raw) as MetricsFile;
    const after =
      metrics.replie_icon_center_apres_1280 ?? metrics.replie_1280;
    assert.ok(after?.checks?.collapsedIconsCentered, "collapsedIconsCentered attendu");
    const byId = after.checks?.iconCenterById ?? {};
    for (const [id, ok] of Object.entries(byId)) {
      assert.equal(ok, true, `icône ${id} hors tolérance`);
    }
    assert.ok(Object.keys(byId).length >= 5, "au moins bascule + 3 nav + meta GPU");
  });

  it("conserve les mesures dépliées (220 px) par rapport à la référence", () => {
    const raw = readFileSync(metricsPath, "utf8");
    const metrics = JSON.parse(raw) as MetricsFile;
    const ref = metrics.deplie_1280_ref;
    const current = metrics.deplie_1280;
    assert.ok(ref && current, "deplie_1280_ref et deplie_1280 requis");
    assert.equal(current.sidebarWidthPx, ref.sidebarWidthPx);
    assert.deepEqual(current.toggleSizePx, ref.toggleSizePx);
    assert.deepEqual(current.navTargetSizesPx, ref.navTargetSizesPx);
  });
});
