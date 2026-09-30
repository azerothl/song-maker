import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ProfileCommercialTypeOption } from "../components/ProfileCommercialTypeOption.tsx";
import { resolveCommercialCreationState } from "./profileCommercialCreation.ts";
import type { EngineLicenseRow201, WiredCommercialEngine } from "@song-maker/stem-providers";

function fixtureRows(): Map<string, EngineLicenseRow201> {
  return new Map([
    [
      "__fixture_commercial_wired__",
      {
        id: "__fixture_commercial_wired__",
        nom: "Fixture",
        licence_poids: "MIT",
        citation: "",
        source_url: "https://example.test/license",
        licence_code: "",
        donnees_entrainement: "",
        restriction_sorties: "",
        statut: "disponible avec réserve",
        date_verification: "2026-09-30",
        raison_grise_fr: "",
      },
    ],
  ]);
}

describe("ProfileCommercialTypeOption (#201)", () => {
  it("production: visible, non-activatable, focusable, reason in DOM", () => {
    const state = resolveCommercialCreationState();
    assert.equal(state.showUnavailableReason, true);
    assert.equal(state.activatable, false);
    const html = renderToStaticMarkup(
      React.createElement(ProfileCommercialTypeOption, {
        state,
        selected: false,
        onSelect: () => {},
        name: "Commercial",
      }),
    );
    assert.match(html, /data-testid="profile-commercial-unavailable-reason"/);
    assert.ok(html.includes("profile-commercial-unavailable-reason"));
    assert.ok(html.includes("Indisponible pour l"));
    assert.ok(html.includes("usage commercial"));
    assert.match(html, /data-testid="profile-type-commercial"/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /tabindex="0"/i);
    assert.doesNotMatch(html, /(?<!aria-)disabled=/);
  });

  it("fixture wired + dated row: reason absent, option activatable (no aria-disabled)", () => {
    const wired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "__fixture_commercial_wired__" },
    ];
    const state = resolveCommercialCreationState(wired, fixtureRows());
    assert.equal(state.activatable, true);
    assert.equal(state.showUnavailableReason, false);
    const html = renderToStaticMarkup(
      React.createElement(ProfileCommercialTypeOption, {
        state,
        selected: false,
        onSelect: () => {},
        name: "Commercial",
      }),
    );
    assert.doesNotMatch(html, /profile-commercial-unavailable-reason/);
    assert.doesNotMatch(html, /aria-disabled/);
  });
});
