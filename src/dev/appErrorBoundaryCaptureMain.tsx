import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import "../App.css";

function BrokenCaptureView(): never {
  throw new Error("capture component render failed");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <BrokenCaptureView />
  </AppErrorBoundary>,
);
