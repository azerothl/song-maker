import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "../../../../src/App";
import { useAppStore } from "../../../../src/store/appStore";
import { PROJECT_ID } from "./fixtures";

function CaptureRoot() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void useAppStore
      .getState()
      .openProject(PROJECT_ID)
      .then(() => {
        const state = useAppStore.getState();
        useAppStore.setState({
          screen: "song",
          // Formulaire invalide → « Relancer » grisé + explication (prise 13).
          form: { ...state.form, style: "", lyrics: "" },
        });
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <div className="splash" style={{ padding: "2rem" }}>
        Chargement des fixtures Versions…
      </div>
    );
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaptureRoot />
  </React.StrictMode>,
);
