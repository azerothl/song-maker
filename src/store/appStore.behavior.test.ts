import assert from "node:assert/strict";
import { it } from "node:test";
import { api } from "../lib/api";
import type { FormInput, ProjectDoc } from "../lib/types";
import { useAppStore } from "./appStore";

it("preserves the latest form when refreshing a project after a track import", async () => {
  const project: ProjectDoc = {
    schema: "songmaker.project",
    schemaVersion: 1,
    id: "project-1",
    title: "Saved title",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
    sampleRate: 48000,
    channels: 2,
    bitDepth: 24,
    style: "Saved style",
    lyrics: "Saved lyrics",
    cot: "full",
    targetDurationSec: 60,
  };
  const previousState = useAppStore.getState();
  const previousApi = { ...api };
  let resolveProject!: (value: ProjectDoc) => void;
  const projectLoading = new Promise<ProjectDoc>((resolve) => {
    resolveProject = resolve;
  });
  const overrides = {
    openProject: async () => projectLoading,
    loadMix: async () => null,
    listGenerations: async () => [],
    loadScore: async () => null,
    playbackSources: async () => {
      throw new Error("No playback sources");
    },
    renderPreview: async () => null,
  } as unknown as typeof api;

  Object.assign(api, overrides);
  try {
    const latestDraft: FormInput = {
      title: "New unsaved title",
      style: "New unsaved style",
      lyrics: "New unsaved lyrics",
      cot: "full",
      targetDurationSec: 90,
      preferFullLyrics: false,
      instrumentalMode: false,
    };
    const refresh = useAppStore.getState().openProject(project.id, {
      preserveForm: true,
    });
    useAppStore.setState({ form: latestDraft });
    resolveProject(project);

    await refresh;

    assert.deepEqual(useAppStore.getState().form, latestDraft);
  } finally {
    Object.assign(api, previousApi);
    useAppStore.setState({
      project: previousState.project,
      form: previousState.form,
      mix: previousState.mix,
      generations: previousState.generations,
      scoreAbc: previousState.scoreAbc,
      scoreDocument: previousState.scoreDocument,
      scoreOpen: previousState.scoreOpen,
      error: previousState.error,
      audioPath: previousState.audioPath,
      playbackSources: previousState.playbackSources,
      screen: previousState.screen,
    });
  }
});
