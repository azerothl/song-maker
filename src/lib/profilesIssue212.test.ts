import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  APP_ENGINE_CATALOG,
  WIRED_COMMERCIAL_LICENSE_IDS,
  listProductionWiredCommercialEngines,
  formatCommercialReservedBadge,
} from "@song-maker/stem-providers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("profiles a11y/data debt (#212)", () => {
  it("R2: profile pill name wraps (no ellipsis truncate)", () => {
    const css = readFileSync(path.join(root, "src/App.css"), "utf8");
    assert.match(css, /\.profile-selector-name\s*\{[^}]*white-space:\s*normal/s);
    assert.doesNotMatch(
      css,
      /\.profile-selector-name\s*\{[^}]*text-overflow:\s*ellipsis/s,
    );
  });

  it("R7: Commercial tile border uses ≥3:1 color vs --bg1", () => {
    const css = readFileSync(
      path.join(root, "src/screens/ProfileOnboardingScreen.css"),
      "utf8",
    );
    assert.match(
      css,
      /\.profile-type-card\.profile-type-commercial\s*\{[^}]*border-color:\s*#8a7430/s,
    );
  });

  it("R11: reserved badge absent from prod i18n; derived from statut", () => {
    const fr = readFileSync(path.join(root, "src/ui/fr.json"), "utf8");
    const en = readFileSync(path.join(root, "src/ui/en.profiles.json"), "utf8");
    assert.doesNotMatch(fr, /profiles\.engines\.reservedBadge/);
    assert.doesNotMatch(en, /profiles\.engines\.reservedBadge/);
    assert.equal(
      formatCommercialReservedBadge("disponible avec réserve"),
      "Disponible avec réserve",
    );
    const ui = readFileSync(path.join(root, "src/lib/commercialEnginesUi.ts"), "utf8");
    assert.match(ui, /formatCommercialReservedBadge/);
    assert.doesNotMatch(ui, /reservedBadge"\)/);
  });

  it("R12: Rust and TS share wired-commercial-license-ids.json", () => {
    const rust = readFileSync(path.join(root, "src-tauri/src/profiles.rs"), "utf8");
    assert.match(rust, /wired-commercial-license-ids\.json/);
    assert.doesNotMatch(rust, /const WIRED_COMMERCIAL_LICENSE_IDS: &\[&str\]/);
    assert.ok(WIRED_COMMERCIAL_LICENSE_IDS.length >= 8);
    const wired = listProductionWiredCommercialEngines();
    assert.equal(wired.length, WIRED_COMMERCIAL_LICENSE_IDS.length);
    for (const id of WIRED_COMMERCIAL_LICENSE_IDS) {
      assert.ok(
        wired.some((w) => w.licenseDataId === id),
        `missing wired id ${id}`,
      );
    }
  });

  it("polish: catalog has 9 engines; why-links ≥44px; no window.prompt rename", () => {
    assert.equal(APP_ENGINE_CATALOG.length, 9);
    assert.ok(APP_ENGINE_CATALOG.some((e) => e.id === "kim_vocal_2"));
    const css = readFileSync(path.join(root, "src/App.css"), "utf8");
    assert.match(css, /\.engine-why-link\s*\{[^}]*min-height:\s*44px/s);
    const onboarding = readFileSync(
      path.join(root, "src/screens/ProfileOnboardingScreen.tsx"),
      "utf8",
    );
    const banner = readFileSync(
      path.join(root, "src/components/ProfileMigrationBanner.tsx"),
      "utf8",
    );
    assert.doesNotMatch(onboarding, /window\.prompt/);
    assert.doesNotMatch(banner, /window\.prompt/);
    assert.match(onboarding, /ProfileRenameDialog/);
    assert.match(banner, /ProfileRenameDialog/);
  });
});
