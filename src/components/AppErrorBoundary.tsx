import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { t } from "../ui/i18n";

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { error: Error | null; componentStack: string };

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null, componentStack: "" };
  private headingRef = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("Song Maker ne peut pas afficher cet écran.", error, info.componentStack);
    window.requestAnimationFrame(() => this.headingRef.current?.focus());
  }

  private reload = () => window.location.reload();

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const details = [
      error.name,
      error.message,
      error.stack,
      componentStack,
    ].filter(Boolean).join("\n\n").slice(0, 4000);

    return (
      <main className="app-error-fallback">
        <section className="app-error-card" aria-labelledby="app-error-title">
          <span className="app-error-mark" aria-hidden="true">!</span>
          <h1 id="app-error-title" ref={this.headingRef} tabIndex={-1}>
            {t("app.errorBoundary.title")}
          </h1>
          <p className="app-error-message" role="alert">
            {t("app.errorBoundary.description")}
          </p>
          <details className="app-error-details">
            <summary>{t("app.errorBoundary.details")}</summary>
            <pre tabIndex={0}>{details}</pre>
          </details>
          <button type="button" className="btn primary" onClick={this.reload}>
            {t("app.errorBoundary.reload")}
          </button>
        </section>
      </main>
    );
  }
}
