import { useEffect } from "react";
import { t } from "../ui/i18n";
import { useAppStore } from "../store/appStore";

export function SplashScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const refreshSettings = useAppStore((s) => s.refreshSettings);

  useEffect(() => {
    void refreshHealth();
    void refreshSettings();
    const timer = window.setTimeout(() => setScreen("library"), 1200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setScreen("library");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [setScreen, refreshHealth, refreshSettings]);

  return (
    <button
      type="button"
      className="splash"
      onClick={() => setScreen("library")}
      aria-label={t("splash.skip")}
    >
      <h1 className="splash-brand">{t("app.name")}</h1>
    </button>
  );
}
