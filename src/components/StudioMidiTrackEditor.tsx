import { useState } from "react";
import { api } from "../lib/api";
import type { ScoreDocument } from "../lib/score";
import { MidiInstrumentPanel } from "./MidiInstrumentPanel";
import { PianoRoll } from "./PianoRoll";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function StudioMidiTrackEditor({
  projectId,
  document,
  voiceId,
  onDocumentChange,
  onProjectRefresh,
  onError,
  instrumentInspectorPosition = "below",
}: {
  projectId: string;
  document: ScoreDocument;
  voiceId: string;
  onDocumentChange: (document: ScoreDocument) => void;
  onProjectRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  instrumentInspectorPosition?: "below" | "side";
}) {
  const settings = useAppStore((state) => state.settings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveMessage(null);
    onError(null);
    try {
      const result = await api.saveScore(projectId, document);
      onDocumentChange({ ...document, id: result.project.activeScoreId ?? result.scoreId });
      await onProjectRefresh();
      setSaveMessage(t("production.midi.saved"));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="studio-midi-edit-content"
      data-inspector-position={instrumentInspectorPosition}
    >
      <div className="studio-midi-edit-toolbar">
        <strong>{t("production.midi.pianoRoll")}</strong>
        {saveMessage && <span role="status">{saveMessage}</span>}
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? t("production.midi.saving") : t("production.midi.save")}
        </button>
      </div>
      <PianoRoll
        document={document}
        initialVoiceId={voiceId}
        onChange={onDocumentChange}
        onError={onError}
      />
      <details
        className="studio-midi-instrument-settings"
        open={instrumentInspectorPosition === "side"}
      >
        <summary>{t("production.midi.instrumentSettings")}</summary>
        <MidiInstrumentPanel
          projectId={projectId}
          onProjectRefresh={onProjectRefresh}
          document={document}
          voiceId={voiceId}
          onDocumentChange={onDocumentChange}
          latencyMs={settings?.audioLatencyMs ?? 20}
          onLatencyChange={async (ms) => {
            if (!settings) return;
            try {
              await api.updateSettings({ ...settings, audioLatencyMs: ms });
              await useAppStore.getState().refreshSettings();
            } catch (error) {
              onError(error instanceof Error ? error.message : String(error));
            }
          }}
          onError={onError}
        />
      </details>
    </div>
  );
}
