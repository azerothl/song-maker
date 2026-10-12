import React from "react";
import ReactDOM from "react-dom/client";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { useAppStore } from "../store/appStore";
import { registerCaptureLibraryProjects } from "./tauriInvokeMock";
import "../App.css";

const rows = [
  {
    id: "mcp-generated-project",
    title: "MCP Q4 end-to-end proof",
    folderPath: "/tmp/song-maker/mcp-generated-project",
    createdAt: "2026-10-11T10:00:00.000Z",
    updatedAt: "2026-10-11T10:05:00.000Z",
    durationMs: 29_999,
    status: "versions_available",
    cot: "full",
    activeGenerationId: null,
  },
  {
    id: "empty-project",
    title: "Projet vide",
    folderPath: "/tmp/song-maker/empty-project",
    createdAt: "2026-10-11T10:00:00.000Z",
    updatedAt: "2026-10-11T10:00:00.000Z",
    durationMs: null,
    status: "empty",
    cot: "full",
    activeGenerationId: null,
  },
];

registerCaptureLibraryProjects(rows);
useAppStore.setState({
  screen: "library",
  project: null,
  projects: [],
  profilesState: null,
  error: null,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">Song Maker</div>
        <nav>
          <button type="button" className="active" aria-current="page">Projets</button>
        </nav>
      </aside>
      <ProjectsScreen />
    </main>
  </React.StrictMode>,
);
