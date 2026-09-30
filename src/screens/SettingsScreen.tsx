import { useCallback, useEffect, useState } from "react";
import { LoraTrainingPanel } from "../components/LoraTrainingPanel";
import { Phase3SettingsPanel } from "../components/Phase3SettingsPanel";
import { Phase4SettingsPanel } from "../components/Phase4SettingsPanel";
import { ProjectSyncPanel } from "../components/ProjectSyncPanel";
import { api } from "../lib/api";
import {
  loraTrainStatusLabelKey,
  resolveLoraTrainRuntimeStatus,
  type LoraTrainRuntimeStatus,
} from "../lib/loraTrainStatus";
import {
  isTauriRuntime,
  readAppVersion,
  runtimeApi,
  type LoraTrainerProbe,
} from "../lib/runtimeHost";
import { CommercialEnginesPanel } from "../components/CommercialEnginesPanel";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

type SettingsPage =
  | "home"
  | "model"
  | "separation"
  | "lora"
  | "loraTrain"
  | "remote"
  | "host"
  | "sync"
  | "system"
  | "engines";

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const profilesState = useAppStore((s) => s.profilesState);
  const activeProfile = profilesState?.profiles.find((p) => p.isActive);
  const health = useAppStore((s) => s.health);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);
  const [page, setPage] = useState<SettingsPage>("home");
  const [loraProbe, setLoraProbe] = useState<LoraTrainerProbe | null>(null);
  const [loraProbing, setLoraProbing] = useState(true);
  const [loraPanelStatus, setLoraPanelStatus] =
    useState<LoraTrainRuntimeStatus | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  const refreshLoraProbe = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLoraProbe(null);
      setLoraProbing(false);
      return;
    }
    setLoraProbing(true);
    try {
      const probe = await runtimeApi.loraTrainProbe();
      setLoraProbe(probe);
    } catch {
      setLoraProbe(null);
    } finally {
      setLoraProbing(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshHealth();
    void readAppVersion().then(setAppVersion);
  }, [refreshSettings, refreshHealth]);

  useEffect(() => {
    if (page === "home" || page === "loraTrain") {
      void refreshLoraProbe();
    }
  }, [page, refreshLoraProbe]);

  if (!settings) return <p>…</p>;

  const probeStatus = resolveLoraTrainRuntimeStatus({
    probing: loraProbing,
    hostAvailable: isTauriRuntime(),
    probe: loraProbe,
  });
  // Prefer live probe for host/runner absence; keep panel session status otherwise.
  const loraCardStatus =
    probeStatus === "probing" ||
    probeStatus === "host_required" ||
    probeStatus === "runner_absent" ||
    probeStatus === "python_missing"
      ? probeStatus
      : (loraPanelStatus ?? probeStatus);
  const loraCardValue = t(loraTrainStatusLabelKey(loraCardStatus));

  const pageTitle: Record<Exclude<SettingsPage, "home">, string> = {
    model: t("settings.model.title"),
    separation: t("settings.separation.title"),
    lora: t("settings.lora.title"),
    loraTrain: t("loraTrain.title"),
    remote: t("settings.remote.title"),
    host: t("settings.host.title"),
    sync: t("phase4.sync.title"),
    system: t("settings.system.title"),
    engines: t("profiles.engines.title"),
  };
  const separatorName =
    settings.stemSeparator === "htdemucs_6s"
      ? "HTDemucs · 6 stems"
      : settings.stemSeparator === "bs_roformer"
        ? "BS-RoFormer"
        : settings.stemSeparator === "mel_band_roformer"
          ? "Mel-Band RoFormer"
          : "HTDemucs · 4 stems";

  return (
    <div className="panel settings">
      <header className="settings-page-header">
        {page !== "home" && (
          <button
            type="button"
            className="btn ghost settings-back"
            onClick={() => setPage("home")}
          >
            {t("settings.back")}
          </button>
        )}
        <h1>{page === "home" ? t("settings.title") : pageTitle[page]}</h1>
        {page === "home" && (
          <p className="hint">{t("settings.home.hint")}</p>
        )}
      </header>

      {page === "home" && (
        <>
          <nav className="settings-card-grid" aria-label={t("settings.title")}>
            <SettingsCard
              title={pageTitle.model}
              description={t("settings.card.model")}
              value={`${t("settings.model.current")} · ${settings.modelPack.toUpperCase()}`}
              onClick={() => setPage("model")}
            />
            <SettingsCard
              title={pageTitle.separation}
              description={t("settings.card.separation")}
              value={separatorName}
              onClick={() => setPage("separation")}
            />
            {activeProfile?.kind === "commercial" ? (
              <SettingsCard
                title={pageTitle.engines}
                description={t("profiles.engines.graySection")}
                value={t("profiles.engines.commercialBadge")}
                onClick={() => setPage("engines")}
              />
            ) : null}
            <SettingsCard
              title={pageTitle.lora}
              description={t("settings.card.lora")}
              value={settings.ccByNcAccepted ? t("settings.card.loraReady") : t("settings.card.optional")}
              onClick={() => setPage("lora")}
            />
            <SettingsCard
              title={pageTitle.loraTrain}
              description={t("settings.card.loraTrain")}
              value={loraCardValue}
              onClick={() => setPage("loraTrain")}
            />
            <SettingsCard
              title={pageTitle.remote}
              description={t("settings.card.remote")}
              value={t("settings.card.offByDefault")}
              onClick={() => setPage("remote")}
            />
            <SettingsCard
              title={pageTitle.sync}
              description={t("settings.card.sync")}
              value={t("settings.card.offByDefault")}
              onClick={() => setPage("sync")}
            />
            <SettingsCard
              title={pageTitle.host}
              description={t("settings.card.host")}
              value={t("settings.card.optional")}
              onClick={() => setPage("host")}
            />
            <SettingsCard
              title={pageTitle.system}
              description={t("settings.card.system")}
              value={health?.gpuName ?? t("nav.gpuAbsent")}
              onClick={() => setPage("system")}
            />
          </nav>
          <button
            type="button"
            className="btn ghost settings-licenses-link"
            onClick={() => setScreen("licenses")}
          >
            {t("settings.licenses")}
          </button>
        </>
      )}

      {page === "model" && (
        <section className="settings-detail-page">
          <p className="settings-intro">{t("settings.model.hint")}</p>
          <p className="settings-current-model">
            {t("settings.model.current")}: <strong>{settings.modelPack.toUpperCase()}</strong>
            <span className="hint"> · {settings.modelGguf}</span>
          </p>
          {health && (
            <p className="hint">
              {t("settings.model.gpu", {
                pack: health.suggestedPack.toUpperCase(),
                vram: health.vramMib != null ? `${health.vramMib} MiB` : t("settings.model.unknown"),
              })}
            </p>
          )}
          <div className="settings-model-options">
            <div className="settings-pack-choice">
              <button
                type="button"
                className={`btn${settings.modelPack === "q8" ? " active" : ""}`}
                aria-pressed={settings.modelPack === "q8"}
                onClick={() =>
                  void api
                    .confirmModelPack("q8")
                    .then(() => refreshSettings())
                    .catch((e) => setError(String(e)))
                }
              >
                {t("settings.model.q8")}
              </button>
              <span className="hint">{t("settings.model.q8Hint")}</span>
            </div>
            <div className="settings-pack-choice">
              <button
                type="button"
                className={`btn${settings.modelPack === "q4" ? " active" : ""}`}
                aria-pressed={settings.modelPack === "q4"}
                onClick={() =>
                  void api
                    .confirmModelPack("q4")
                    .then(() => refreshSettings())
                    .catch((e) => setError(String(e)))
                }
              >
                {t("settings.model.q4")}
              </button>
              <span className="hint">{t("settings.model.q4Hint")}</span>
            </div>
          </div>
          <p className="hint">{t("settings.pack.confirm")}</p>
        </section>
      )}

      {page === "separation" && <Phase3SettingsPanel view="separation" />}
      {page === "engines" && <CommercialEnginesPanel />}
      {page === "lora" && (
        <div className="settings-lora-pages">
          <Phase3SettingsPanel view="lora" />
          <Phase4SettingsPanel view="lora" />
        </div>
      )}
      {page === "loraTrain" && (
        <div className="settings-detail-page">
          <LoraTrainingPanel
            probe={loraProbe}
            probing={loraProbing}
            onRuntimeStatusChange={setLoraPanelStatus}
          />
        </div>
      )}
      {page === "remote" && <Phase4SettingsPanel view="remote" />}
      {page === "sync" && (
        <div className="settings-detail-page">
          <ProjectSyncPanel />
        </div>
      )}
      {page === "host" && <Phase4SettingsPanel view="host" />}
      {page === "system" && (
        <section className="settings-detail-page settings-system-page">
          <p className="settings-intro">{t("settings.system.description")}</p>
          <section>
            <h2>{t("settings.appVersion")}</h2>
            <p className="mono">{appVersion ?? t("settings.appVersionUnknown")}</p>
          </section>
          <section>
            <h2>{t("settings.health")}</h2>
            <p>{health?.message ?? "—"}</p>
            <p>
              GPU : {health?.gpuName ?? t("nav.gpuAbsent")}
              {health?.driverVersion ? ` · driver ${health.driverVersion}` : ""}
            </p>
          </section>
          <section>
            <h2>{t("settings.binary")}</h2>
            <dl className="kv">
              <dt>Tag</dt><dd>{settings.binaryTag}</dd>
              <dt>Archive</dt><dd>{settings.binaryArchive}</dd>
              <dt>SHA-256</dt><dd className="mono">{settings.binarySha256}</dd>
            </dl>
          </section>
          <section>
            <h2>{t("settings.projectsDir")}</h2>
            <p className="mono">{settings.projectsDir}</p>
          </section>
          <section>
            <h2>{t("settings.outputDevice")}</h2>
            <p>{settings.outputDevice ?? t("settings.systemDefault")}</p>
          </section>
          <section>
            <h2>{t("settings.audioLatency")}</h2>
            <p className="hint">{t("settings.audioLatency.hint")}</p>
            <label className="clip-field">
              <span>{t("settings.audioLatency.ms")}</span>
              <input
                type="number"
                min={0}
                max={200}
                step={1}
                value={settings.audioLatencyMs ?? 20}
                onChange={(e) => {
                  const audioLatencyMs = Math.max(
                    0,
                    Math.min(200, Math.round(Number(e.target.value))),
                  );
                  void api
                    .updateSettings({ ...settings, audioLatencyMs })
                    .then(() => refreshSettings())
                    .catch((err) => setError(String(err)));
                }}
              />
            </label>
          </section>
        </section>
      )}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  value,
  onClick,
}: {
  title: string;
  description: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="settings-card" onClick={onClick}>
      <strong>{title}</strong>
      <span className="settings-card-description">{description}</span>
      <span className="settings-card-value">{value}</span>
      <span className="settings-card-open">{t("settings.openPage")}</span>
    </button>
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
        <li>{t("licenses.midiInstrument")}</li>
        <li>{t("licenses.yue2")}</li>
        <li>
          Packs LoRA optionnels (phases 3–4, y compris styles) — CC BY-NC 4.0,
          hors installeur ; voir Paramètres → Production audio / Agent.
        </li>
        <li>{t("licenses.sheetsage")}</li>
        <li>{t("licenses.loraTrain")}</li>
        <li>
          Crédit : <strong>{t("licenses.credit")}</strong>
        </li>
      </ul>
      <p className="hint">Pas de badge « monétisation autorisée ».</p>
    </div>
  );
}
