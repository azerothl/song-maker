import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { CreateWorkspace } from "../screens/song/CreateWorkspace";
import { useAppStore } from "../store/appStore";
import {
  advancedSettingsSummary,
  type AdvancedSettingsPage,
  validateFormFields,
} from "../screens/song/shared";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { registerCaptureProject } from "./tauriInvokeMock";
import "../App.css";

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  registerCaptureProject(seededProject);
}

function CreateTabCaptureApp() {
  const form = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const scoreDocument = useAppStore((s) => s.scoreDocument);
  const [busy, setBusy] = useState(false);
  const [advancedSettingsPage, setAdvancedSettingsPage] =
    useState<AdvancedSettingsPage>(null);
  const [showFormErrors, setShowFormErrors] = useState(false);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureSetGenerateBusy = (next: boolean) => setBusy(next);
    window.__captureOpenAdvancedSettings = (page = "seed") => {
      setAdvancedSettingsPage(page ?? "seed");
    };
    return () => {
      delete window.__captureSetGenerateBusy;
      delete window.__captureOpenAdvancedSettings;
    };
  }, []);

  const formFieldErrors = useMemo(() => validateFormFields(form), [form]);
  const advancedSummary = useMemo(
    () => advancedSettingsSummary(form),
    [form],
  );
  const scoreGate = useMemo(
    () => ({ abc: null, error: null, issues: [] }),
    [],
  );

  return (
    <div className="app-shell create-tab-capture-root" data-capture-mock="create-tab">
      <main className="main">
        <CreateWorkspace
          advancedSettingsPage={advancedSettingsPage}
          advancedSummary={advancedSummary}
          busy={busy}
          form={form}
          formFieldErrors={formFieldErrors}
          onGenerate={async () => {
            setShowFormErrors(true);
          }}
          onOpenInstrumentalSettings={() => undefined}
          scoreDocument={scoreDocument}
          scoreGate={scoreGate}
          setAdvancedSettingsPage={setAdvancedSettingsPage}
          setForm={setForm}
          showInstrumentalPackGuidance={false}
          showFormErrors={showFormErrors}
        />
      </main>
    </div>
  );
}

declare global {
  interface Window {
    __captureSetGenerateBusy?: (busy: boolean) => void;
    __captureOpenAdvancedSettings?: (page?: AdvancedSettingsPage) => void;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CreateTabCaptureApp />
  </React.StrictMode>,
);
