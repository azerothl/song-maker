import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormInput } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { CreateWorkspace } from "./CreateWorkspace";
import type { AdvancedSettingsPage } from "./shared";

function renderCreateWorkspace(instrumentalMode: boolean) {
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
      advancedSettingsPage: null,
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
      instrumentalPackState: "missing",
      showInstrumentalPackGuidance: true,
      showFormErrors: false,
    }),
  );
}

describe("instrumental voice removal entry", () => {
  it("shows a plain-language route to vocal-removal settings for instrumentals", () => {
    const html = renderCreateWorkspace(true);

    assert.match(html, /Still hear vocals\?|Vous entendez encore des voix \?/);
    assert.match(html, /Adjust vocal removal|Régler le retrait des voix/);
  });

  it("does not show instrumental cleanup guidance for a vocal generation", () => {
    const html = renderCreateWorkspace(false);

    assert.doesNotMatch(html, /Adjust vocal removal|Régler le retrait des voix/);
  });

  it("opens the separation settings page from the new action", () => {
    useAppStore.getState().openSeparationSettings();
    const state = useAppStore.getState();

    assert.equal(state.screen, "settings");
    assert.equal(state.settingsInitialPage, "separation");
    state.setScreen("splash");
  });
});
