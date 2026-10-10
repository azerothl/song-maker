import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormInput } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { CreateWorkspace } from "./CreateWorkspace";
import type { AdvancedSettingsPage } from "./shared";

function renderCreateWorkspace(
  instrumentalMode: boolean,
  options: {
    advancedSettingsPage?: AdvancedSettingsPage;
    showVocalRemovalGuidance?: boolean;
    showInstrumentalPackGuidance?: boolean;
    showScoreSettings?: boolean;
    instrumentalPackState?: "active" | "installed" | "missing";
  } = {},
) {
  const form: FormInput = {
    title: "Test",
    style: "Piano",
    lyrics: "",
    cot: "full",
    singingLanguage: null,
    tempoBpm: null,
    key: null,
    meter: null,
    seed: null,
    targetDurationSec: 30,
    preferFullLyrics: false,
    instrumentalMode,
    continuationGenerationId: null,
  };

  return renderToStaticMarkup(
    React.createElement(CreateWorkspace, {
      advancedSettingsPage: options.advancedSettingsPage ?? null,
      advancedSummary: "",
      busy: false,
      form,
      formFieldErrors: {},
      onGenerate: async () => undefined,
      onOpenInstrumentalSettings: () => undefined,
      onOpenVocalRemovalSettings: () => undefined,
      scoreDocument: null,
      scoreGate: { abc: null, error: null, issues: [] },
      setAdvancedSettingsPage: (() => undefined) as React.Dispatch<
        React.SetStateAction<AdvancedSettingsPage>
      >,
      setForm: () => undefined,
      showScoreSettings: options.showScoreSettings ?? true,
      instrumentalPackState: options.instrumentalPackState ?? "missing",
      showVocalRemovalGuidance: options.showVocalRemovalGuidance ?? true,
      showInstrumentalPackGuidance: options.showInstrumentalPackGuidance ?? true,
      showFormErrors: false,
    }),
  );
}

describe("instrumental voice removal entry", () => {
  it("shows a plain-language route to vocal-removal settings for instrumentals", () => {
    const html = renderCreateWorkspace(true);

    assert.match(html, /Song Maker tries to remove vocals|Song Maker (?:tente|essaie) de retirer les voix/);
    assert.match(html, /Adjust vocal removal|Régler le retrait des voix/);
  });

  it("does not show instrumental cleanup guidance for a vocal generation", () => {
    const html = renderCreateWorkspace(false);

    assert.doesNotMatch(html, /Adjust vocal removal|Régler le retrait des voix/);
  });

  it("keeps voice-removal settings visible without YuE2 pack guidance", () => {
    const html = renderCreateWorkspace(true, {
      showVocalRemovalGuidance: true,
      showInstrumentalPackGuidance: false,
    });

    assert.match(html, /Régler le retrait des voix|Adjust vocal removal/);
    assert.doesNotMatch(html, /pack may reduce leftover singing|pack facultatif peut réduire le chant/);
  });

  it("does not repeat the vocal warning in the active instrumental setting status", () => {
    const html = renderCreateWorkspace(true, { instrumentalPackState: "active" });

    assert.match(html, /Le réglage instrumental sera appliqué à cette génération/);
    assert.doesNotMatch(html, /voix résiduelles|Some vocals may still remain/i);
  });

  it("opens the separation settings page from the new action", () => {
    useAppStore.getState().openSeparationSettings();
    const state = useAppStore.getState();

    assert.equal(state.screen, "settings");
    assert.equal(state.settingsInitialPage, "separation");
    state.setScreen("splash");
  });

  it("hides score planning for engines that do not support score generation", () => {
    const html = renderCreateWorkspace(false, {
      advancedSettingsPage: "index",
      showScoreSettings: false,
    });

    assert.doesNotMatch(html, /Partition à générer|Score to create/);
  });

  it("does not keep a stale score-planning page open after switching engines", () => {
    const html = renderCreateWorkspace(false, {
      advancedSettingsPage: "plan",
      showScoreSettings: false,
    });

    assert.doesNotMatch(html, /Partition à générer|Score to create/);
    assert.match(html, /form-parameter-grid/);
  });
});
