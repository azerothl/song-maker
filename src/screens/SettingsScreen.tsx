import { useEffect } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const health = useAppStore((s) => s.health);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);

  useEffect(() => {
    void refreshSettings();
    void refreshHealth();
  }, [refreshSettings, refreshHealth]);

  if (!settings) return <p>…</p>;

  return (
    <div className="panel settings">
      <header className="panel-header">
        <h1>{t("settings.title")}</h1>
      </header>

      <section>
        <h2>{t("settings.binary")}</h2>
        <dl className="kv">
          <dt>Tag</dt>
          <dd>{settings.binaryTag}</dd>
          <dt>Archive</dt>
          <dd>{settings.binaryArchive}</dd>
          <dt>SHA-256</dt>
          <dd className="mono">{settings.binarySha256}</dd>
        </dl>
      </section>

      <section>
        <h2>{t("settings.pack")}</h2>
        <p>
          Pack actuel : <strong>{settings.modelPack.toUpperCase()}</strong> —{" "}
          {settings.modelGguf}
        </p>
        {health && (
          <p>
            Suggestion VRAM : {health.suggestedPack.toUpperCase()}
            {health.vramMib != null ? ` (${health.vramMib} MiB)` : ""}
          </p>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api
                .confirmModelPack("q8")
                .then(() => refreshSettings())
                .catch((e) => setError(String(e)))
            }
          >
            Q8
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api
                .confirmModelPack("q4")
                .then(() => refreshSettings())
                .catch((e) => setError(String(e)))
            }
          >
            Q4
          </button>
        </div>
        <p className="hint">{t("settings.pack.confirm")} — un OOM ne change pas le pack tout seul.</p>
      </section>

      <section>
        <h2>{t("settings.projectsDir")}</h2>
        <p className="mono">{settings.projectsDir}</p>
      </section>

      <section>
        <h2>{t("settings.outputDevice")}</h2>
        <p>{settings.outputDevice ?? "Défaut système"}</p>
      </section>

      <section>
        <button type="button" className="btn" onClick={() => setScreen("licenses")}>
          {t("settings.licenses")}
        </button>
      </section>

      {health && (
        <section>
          <h2>Santé</h2>
          <p>{health.message}</p>
          <p>
            GPU : {health.gpuName ?? t("nav.gpuAbsent")}
            {health.driverVersion ? ` · driver ${health.driverVersion}` : ""}
          </p>
        </section>
      )}
    </div>
  );
}

export function LicensesScreen() {
  return (
    <div className="panel">
      <header className="panel-header">
        <h1>{t("licenses.title")}</h1>
      </header>
      <ul className="licenses">
        <li>{t("licenses.audiocpp")}</li>
        <li>{t("licenses.yue2")}</li>
        <li>
          Crédit : <strong>{t("licenses.credit")}</strong>
        </li>
      </ul>
      <p className="hint">Pas de badge « monétisation autorisée ».</p>
    </div>
  );
}
