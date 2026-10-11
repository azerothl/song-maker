import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { SongScreen } from "../screens/SongScreen";
import { useAppStore } from "../store/appStore";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { registerCaptureProject } from "./tauriInvokeMock";
import "../App.css";

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  const studioProject = { ...seededProject, activeGenerationId: "gen-001" };
  useAppStore.setState({ screen: "studio", project: studioProject });
  registerCaptureProject(studioProject);
}

function StudioTrackAddCaptureApp() {
  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureGetMidiTrackState = () => {
      const state = useAppStore.getState();
      return {
        mix: state.mix,
        voices: state.scoreDocument?.voices ?? [],
      };
    };
    return () => {
      delete window.__captureGetMidiTrackState;
    };
  }, []);

  return (
    <div className="app-shell studio-track-add-capture" data-capture-mock="studio-track-add">
      <main className="main">
        <SongScreen initialWorkspace="production" />
      </main>
    </div>
  );
}

declare global {
  interface Window {
    __captureGetMidiTrackState?: () => {
      mix: { tracks: Array<{ id: string; name: string; role: string }> } | null;
      voices: Array<{ id: string; name: string; role: string }>;
    };
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StudioTrackAddCaptureApp />
  </React.StrictMode>,
);
