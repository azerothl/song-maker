import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { yue2PackNeedsInstall } from "./firstLaunch.ts";

const componentSrc = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../components/Yue2PackSettings.tsx",
  ),
  "utf8",
);

describe("yue2PackNeedsInstall", () => {
  it("demande un téléchargement tant que YuE2 n’est pas prêt", () => {
    assert.equal(
      yue2PackNeedsInstall({
        selected: "q4",
        activePack: "q4",
        modelsOk: false,
        localYue2Enabled: true,
      }),
      true,
    );
    assert.equal(
      yue2PackNeedsInstall({
        selected: "q4",
        activePack: "q4",
        modelsOk: true,
        localYue2Enabled: false,
      }),
      true,
    );
  });

  it("demande le téléchargement de l’autre pack même si le pack actif est prêt", () => {
    assert.equal(
      yue2PackNeedsInstall({
        selected: "q8",
        activePack: "q4",
        modelsOk: true,
        localYue2Enabled: true,
      }),
      true,
    );
    assert.equal(
      yue2PackNeedsInstall({
        selected: "q4",
        activePack: "q4",
        modelsOk: true,
        localYue2Enabled: true,
      }),
      false,
    );
  });

  it("n’appelle pas get_install_plan : ce hash synchrone fige l’interface", () => {
    assert.doesNotMatch(componentSrc, /getInstallPlan/);
    assert.match(componentSrc, /htmlFor="settings-yue2-license"/);
  });
});
