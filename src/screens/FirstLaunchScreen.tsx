import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { isTauriRuntime } from "../lib/runtimeHost";
import {
  NVIDIA_DRIVERS_URL,
  YUE2_LICENSE_URL,
  browserDemoFromHash,
  bucketPlanBytes,
  buildFileRows,
  demoInstallPlan,
  demoProgressError,
  demoSetupGpu,
  detectHeadline,
  fileStatusShowsWarningIcon,
  formatBytesFr,
  formatEtaFr,
  formatRateFr,
  formatVramGo,
  gpuDetailLine,
  installErrorCopy,
  isMixOnlySkipped,
  LICENSE_REQUIRED_FR,
  licenseAllowsDownload,
  modelPackVramFailureRisk,
  overallReceived,
  overallTotal,
  parsePack,
  packModelBytes,
  persistMixOnlySkip,
  Q8_VRAM_FAILURE_RISK_FR,
  resolveFirstLaunchView,
  setupComplete,
  vramBarPercent,
  yue2PeakMib,
  type FileRowStatus,
  type ModelPack,
} from "../lib/firstLaunch";
import type { InstallPlan, InstallProgress, SetupGpuInfo } from "../lib/types";
import { useAppStore } from "../store/appStore";

function invokeError(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

function FileStatusLabel({
  status,
  etaSeconds,
  etaIsEstimate,
}: {
  status: FileRowStatus;
  etaSeconds: number | null | undefined;
  etaIsEstimate: boolean;
}) {
  switch (status) {
    case "complete":
      return (
        <>
          <span aria-hidden="true">✓</span> Terminé
        </>
      );
    case "error":
      return (
        <>
          {fileStatusShowsWarningIcon(status) ? (
            <span aria-hidden="true">⚠</span>
          ) : null}
          <span>Interrompu</span>
        </>
      );
    case "partial":
      return (
        <span>
          Interrompu
          {etaSeconds != null && (
            <small>
              Reste {formatEtaFr(etaSeconds, etaIsEstimate)} après reprise
            </small>
          )}
        </span>
      );
    case "active":
      return (
        <>
          <span aria-hidden="true">↓</span> En cours
        </>
      );
    case "waiting":
    case "missing":
      return (
        <>
          <span aria-hidden="true">◷</span> En attente
        </>
      );
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function FirstLaunchScreen() {
  const health = useAppStore((s) => s.health);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const setStoreError = useAppStore((s) => s.setError);
  const settings = useAppStore((s) => s.settings);
  const browser = !isTauriRuntime();
  const initialDemo = browser ? browserDemoFromHash() : null;

  const [loading, setLoading] = useState(!browser);
  const [gpu, setGpu] = useState<SetupGpuInfo | null>(initialDemo?.gpu ?? null);
  const [plan, setPlan] = useState<InstallPlan | null>(initialDemo?.plan ?? null);
  const [pack, setPack] = useState<ModelPack>(initialDemo?.pack ?? "q4");
  const [accepted, setAccepted] = useState(Boolean(initialDemo?.progress));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(
    initialDemo?.progress ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [interruptDismissed, setInterruptDismissed] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const loadPlan = useCallback(async (nextPack: ModelPack) => {
    const next = await api.getInstallPlan(nextPack);
    setPlan(next);
    return next;
  }, []);

  const applyDemo = useCallback(() => {
    const demo = browserDemoFromHash();
    setGpu(demo.gpu);
    setPack(demo.pack);
    setPlan(demo.plan);
    setProgress(demo.progress);
    setInterruptDismissed(false);
    setAccepted(Boolean(demo.progress));
    setLoading(false);
  }, []);

  const bootstrap = useCallback(async () => {
    if (!isTauriRuntime()) {
      applyDemo();
      return;
    }
    const [gpuInfo] = await Promise.all([
      api.getSetupGpuInfo(),
      refreshHealth(),
      refreshSettings(),
    ]);
    setGpu(gpuInfo);
    const current = useAppStore.getState();
    if (setupComplete(current.health) || isMixOnlySkipped()) {
      setScreen("library");
      return;
    }
    const nextPack = parsePack(
      current.settings?.modelPack === "q8"
        ? "q8"
        : gpuInfo.suggestedPack === "q8"
          ? "q8"
          : "q4",
    );
    setPack(nextPack);
    setAccepted(current.settings?.yue2LicenseAccepted ?? false);
    await loadPlan(nextPack);
    setLoading(false);
  }, [applyDemo, loadPlan, refreshHealth, refreshSettings, setScreen]);

  useEffect(() => {
    setStoreError(null);
    let active = true;
    void bootstrap().catch((reason) => {
      if (!active) return;
      setError(invokeError(reason));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [bootstrap, setStoreError]);

  useEffect(() => {
    if (!browser) return undefined;
    const onHash = () => {
      applyDemo();
      setScreen("splash");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [applyDemo, browser, setScreen]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("setup-progress", (event) => {
      setProgress(event.payload);
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch((reason) => setError(invokeError(reason)));
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (loading || !isTauriRuntime()) return;
    void loadPlan(pack).catch((reason) => setError(invokeError(reason)));
  }, [pack, loading, loadPlan]);

  const view = resolveFirstLaunchView({
    loading,
    gpu,
    plan,
    progress,
    busy,
    interruptDismissed,
  });

  const buckets = useMemo(() => bucketPlanBytes(plan), [plan]);
  const rows = useMemo(() => buildFileRows(plan, progress), [plan, progress]);
  const headline = detectHeadline(gpu?.accelerationKind);
  const suggested = parsePack(gpu?.suggestedPack);
  const etaIsEstimate = Boolean(
    progress?.overallEtaIsEstimate ?? progress?.etaIsEstimate ?? true,
  );
  const etaLabel = formatEtaFr(
    progress?.overallEtaSeconds ?? progress?.etaSeconds ?? null,
    etaIsEstimate || progress == null,
  );

  async function install() {
    setBusy(true);
    setError(null);
    setInterruptDismissed(false);
    if (!isTauriRuntime()) {
      setProgress(demoProgressError());
      setPlan(demoInstallPlan(pack, true));
      setBusy(false);
      return;
    }
    setProgress(null);
    try {
      await api.installRequiredAssets(
        pack,
        accepted || Boolean(settings?.yue2LicenseAccepted),
      );
      await Promise.all([refreshHealth(), refreshSettings()]);
      setScreen("library");
    } catch (reason) {
      setError(invokeError(reason));
      await refreshHealth();
      try {
        setPlan(await api.getInstallPlan(pack));
      } catch {
        /* keep last plan */
      }
    } finally {
      setBusy(false);
    }
  }

  async function relancer() {
    setError(null);
    if (!isTauriRuntime()) {
      setGpu(demoSetupGpu("none"));
      return;
    }
    setLoading(true);
    try {
      await bootstrap();
    } catch (reason) {
      setError(invokeError(reason));
      setLoading(false);
    }
  }

  function continuerSansGeneration() {
    persistMixOnlySkip();
    setScreen("library");
  }

  function ouvrirWorker() {
    persistMixOnlySkip();
    setScreen("settings");
  }

  if (view === "loading") {
    return (
      <section className="first-launch" aria-live="polite">
        <div className="fl-card">
          <p className="fl-eyebrow">Première installation</p>
          <h1>Song Maker</h1>
          <p className="fl-lead">Vérification des composants nécessaires…</p>
        </div>
      </section>
    );
  }

  if (setupComplete(health)) return null;

  const errorCopy = installErrorCopy(
    progress?.error ?? (error ? { message: error, cause: "other" } : null),
  );

  return (
    <section className="first-launch" aria-labelledby="fl-title">
      {view === "gpu" && gpu && (
        <div className="fl-card">
          <header className="fl-head">
            <div>
              <p className="fl-eyebrow">Première installation</p>
              <h1 id="fl-title">Préparons Song Maker</h1>
              <p className="fl-lead">
                Nous avons analysé votre ordinateur et choisi la meilleure configuration.
                Il vous suffit de vérifier, puis de lancer le téléchargement.
              </p>
            </div>
          </header>

          <div className="fl-grid">
            <div className="fl-stack">
              <div className="fl-panel fl-detect" role="status">
                <div className="fl-ico" aria-hidden="true">▣</div>
                <div>
                  <span className="fl-status">
                    <span aria-hidden="true">✓</span> {headline.status}
                  </span>
                  <b>{gpuDetailLine(gpu)}</b>
                  <small>{headline.sub}</small>
                </div>
              </div>

              <div className="fl-panel fl-reco">
                <h2>Recommandé pour cet ordinateur</h2>
                <div className="fl-big">
                  Modèle {suggested.toUpperCase()}{" "}
                  <span className="fl-chip">★ Recommandé</span>
                </div>
                <p>{gpu.suggestedPackReasonFr}</p>
              </div>

              <div className="fl-panel">
                <h2>Ce qui sera téléchargé</h2>
                <dl className="fl-sum">
                  <div>
                    <dt>Moteur audio, VAE, HTDemucs</dt>
                    <dd>{formatBytesFr(buckets.engineBytes)}</dd>
                  </div>
                  <div>
                    <dt>Modèle YuE2 {pack.toUpperCase()}</dt>
                    <dd>{formatBytesFr(buckets.modelBytes)}</dd>
                  </div>
                  <div className="fl-sum-total">
                    <dt>Total à télécharger</dt>
                    <dd>{formatBytesFr(buckets.totalBytes)}</dd>
                  </div>
                  <div>
                    <dt>
                      {progress?.overallBytesPerSec
                        ? `Durée estimée à ${formatRateFr(progress.overallBytesPerSec)}`
                        : "Durée estimée"}
                    </dt>
                    <dd>{etaLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="fl-models" role="radiogroup" aria-label="Choix de la précision du modèle">
              {(["q4", "q8"] as const).map((option) => {
                const selected = pack === option;
                const recommended = suggested === option;
                const vram = gpu.vramMib;
                const peakPct = vramBarPercent(option, vram);
                const vramGo = formatVramGo(vram);
                const peakGo = formatVramGo(yue2PeakMib(option));
                return (
                  <label key={option} className={`fl-model${selected ? " sel" : ""}`}>
                    <input
                      type="radio"
                      name="model-pack"
                      value={option}
                      checked={selected}
                      disabled={busy}
                      onChange={() => setPack(option)}
                    />
                    <div className="fl-model-t">
                      <b>
                        {option === "q4" ? "Q4 · Rapide et léger" : "Q8 · Qualité maximale"}{" "}
                        {recommended ? (
                          <span className="fl-chip">★ Recommandé</span>
                        ) : (
                          <span className="fl-chip neutral">Plus exigeant</span>
                        )}
                      </b>
                      <span className="fl-size">
                        {formatBytesFr(packModelBytes(option))}
                      </span>
                    </div>
                    <p>
                      {option === "q4"
                        ? "Bonne qualité, génération plus rapide. Fonctionne dès 8 Go de VRAM."
                        : "Rendu un peu plus fin, mais plus lent et plus proche de la limite de votre carte."}
                    </p>
                    <div className="fl-bars">
                      <span>
                        VRAM utilisée ≈ {peakGo ?? "—"}
                        {vramGo ? ` / ${vramGo}` : ""} (pic publié)
                      </span>
                      <div className="fl-vram" aria-hidden="true">
                        <i className={peakPct >= 90 ? "hi" : undefined} style={{ width: `${peakPct}%` }} />
                      </div>
                    </div>
                    {modelPackVramFailureRisk(option, vram) ? (
                      <p className="fl-vram-risk" role="note">
                        {Q8_VRAM_FAILURE_RISK_FR}
                      </p>
                    ) : null}
                  </label>
                );
              })}
              <p className="fl-hint">Vous pourrez changer de modèle plus tard dans Réglages.</p>
            </div>
          </div>

          <div className="fl-foot">
            <div className="fl-license">
              <p>
                YuE2 est sous licence{" "}
                <a href={YUE2_LICENSE_URL} target="_blank" rel="noreferrer">
                  CC BY-NC 4.0
                </a>
                {" "}
                : usage personnel et non commercial uniquement, vous ne pouvez pas vendre
                ou monétiser les morceaux générés.
              </p>
              <label className="fl-cb" htmlFor="fl-license-accept">
                <input
                  id="fl-license-accept"
                  type="checkbox"
                  checked={accepted}
                  disabled={busy}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                J’ai lu et j’accepte la licence
              </label>
            </div>
            <div className="fl-actions">
              {!licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted) ? (
                <p className="fl-license-required" role="status">
                  {LICENSE_REQUIRED_FR}
                </p>
              ) : null}
              <button
                className="fl-btn fl-btn-lg"
                type="button"
                disabled={busy || !licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted)}
                onClick={() => void install()}
              >
                Télécharger ({formatBytesFr(buckets.totalBytes)})
              </button>
              <span className="fl-hint">Reprise automatique si la connexion est coupée</span>
            </div>
          </div>
          {error && view === "gpu" && (
            <p className="fl-inline-error" role="alert">{error}</p>
          )}
        </div>
      )}

      {view === "noGpu" && (
        <div className="fl-card">
          <header className="fl-head">
            <div>
              <p className="fl-eyebrow">Première installation</p>
              <h1 id="fl-title">Préparons Song Maker</h1>
              <p className="fl-lead">
                Choisissez comment vous souhaitez utiliser l’application sur cet ordinateur.
              </p>
            </div>
          </header>

          <div className="fl-alert" role="alert">
            <div className="fl-ai" aria-hidden="true">!</div>
            <div>
              <h2>Attention : aucune carte graphique compatible détectée</h2>
              <p>
                La génération de musique demande une carte graphique <b>NVIDIA</b> (Windows
                ou Linux) ou une puce <b>Apple avec Metal</b> (Mac). Sans elle, le modèle
                YuE2 ne peut pas fonctionner : c’est pourquoi nous ne le téléchargeons pas.
              </p>
            </div>
          </div>

          <div className="fl-alts">
            <section className="fl-alt" aria-labelledby="fl-b1">
              <span className="fl-num">Option 1 · Si vous avez une carte NVIDIA</span>
              <h3 id="fl-b1">Installer ou mettre à jour le pilote NVIDIA</h3>
              <p>Un pilote absent ou trop ancien est la cause la plus fréquente. Après l’installation, relancez la détection.</p>
              <ul>
                <li>Ouvre le site officiel de NVIDIA</li>
                <li>Redémarrage possible</li>
              </ul>
              <div className="fl-sp" />
              <a className="fl-btn fl-btn-sec" href={NVIDIA_DRIVERS_URL} target="_blank" rel="noreferrer">
                Ouvrir la page des pilotes ↗
              </a>
              <button className="fl-btn fl-btn-sec" type="button" onClick={() => void relancer()}>
                ↻ Relancer la détection
              </button>
            </section>

            <section className="fl-alt" aria-labelledby="fl-b2">
              <span className="fl-num">Option 2 · Facultatif</span>
              <h3 id="fl-b2">Utiliser un worker GPU distant</h3>
              <p>Un autre ordinateur ou un serveur GPU que vous contrôlez génère la musique à votre place.</p>
              <ul>
                <li>Désactivé par défaut</li>
                <li>Vos données audio quittent cet ordinateur</li>
              </ul>
              <div className="fl-toggle">
                <span className="fl-sw" aria-hidden="true" />
                Activer le worker distant (désactivé)
              </div>
              <div className="fl-sp" />
              <button className="fl-btn fl-btn-sec" type="button" onClick={ouvrirWorker}>
                Configurer un worker…
              </button>
            </section>

            <section className="fl-alt rec" aria-labelledby="fl-b3">
              <span className="fl-num">Option 3 · Disponible tout de suite</span>
              <h3 id="fl-b3">Continuer sans génération</h3>
              <p>
                Utilisez la <b>séparation de stems</b> et le <b>mixage</b>. Aucun poids YuE2
                ne sera téléchargé.
              </p>
              <ul>
                <li>La génération de musique sera désactivée</li>
                <li>Modifiable plus tard dans les Réglages</li>
              </ul>
              <div className="fl-sp" />
              <button className="fl-btn" type="button" onClick={continuerSansGeneration}>
                Continuer sans génération
              </button>
            </section>
          </div>
          <p className="fl-note-b">
            <span>Aucun modèle lourd ne sera téléchargé sans votre accord.</span>
            <span>Détection : {headline.detail}</span>
          </p>
        </div>
      )}

      {(view === "interrupted" || view === "download") && (
        <div className="fl-card">
          <header className="fl-head">
            <div>
              <p className="fl-eyebrow">Première installation · Téléchargement</p>
              <h1 id="fl-title">
                {view === "download" ? "Téléchargement en cours" : "Téléchargement interrompu"}
              </h1>
              <p className="fl-lead">
                Rien n’est perdu : les fichiers déjà reçus sont conservés et le téléchargement
                reprendra là où il s’est arrêté.
              </p>
            </div>
          </header>

          <div className="fl-files" role="list">
            {rows.map((row) => (
              <div
                key={row.name}
                className={`fl-file${row.status === "error" ? " err" : ""}`}
                role="listitem"
              >
                <div className="fl-file-n">
                  <b>{row.title}</b>
                  <span>{row.hint}</span>
                </div>
                <div>
                  <div
                    className={`fl-pbar${row.status === "error" ? " err" : ""}${row.status === "waiting" ? " wait" : ""}`}
                    role="progressbar"
                    aria-valuenow={row.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={row.title}
                  >
                    <i style={{ width: `${row.percent}%` }} />
                  </div>
                  <div className="fl-pinfo">
                    <span>
                      <b>{formatBytesFr(row.receivedBytes)}</b>
                      {row.totalBytes != null ? ` / ${formatBytesFr(row.totalBytes)}` : ""}
                      {row.percent ? ` · ${row.percent} %` : ""}
                    </span>
                    <span>
                      {row.bytesPerSec
                        ? `Vitesse : ${formatRateFr(row.bytesPerSec)}`
                        : row.status === "error"
                          ? "Vitesse : 0 Mo/s"
                          : `${row.percent} %`}
                    </span>
                  </div>
                </div>
                <div
                  className={`fl-st ${
                    row.status === "complete"
                      ? "ok"
                      : row.status === "error" || row.status === "partial"
                        ? "er"
                        : "wt"
                  }`}
                >
                  <FileStatusLabel
                    status={row.status}
                    etaSeconds={progress?.etaSeconds}
                    etaIsEstimate={Boolean(progress?.etaIsEstimate)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="fl-global">
            <span>
              Total :{" "}
              <b>{formatBytesFr(overallReceived(plan, progress))}</b>
              {overallTotal(plan, progress) != null
                ? ` reçus sur ${formatBytesFr(overallTotal(plan, progress)!)}`
                : " reçus"}
            </span>
            <span>Temps restant : {etaLabel}</span>
          </div>

          {view === "interrupted" && (
            <div className="fl-errbox" role="alert">
              <div className="fl-ai" aria-hidden="true">!</div>
              <div>
                <h2>{errorCopy.title}</h2>
                <p>{errorCopy.body}</p>
                <ol>
                  {errorCopy.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div className="fl-row-actions">
            <button
              className="fl-btn fl-btn-lg"
              type="button"
              disabled={busy || !licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted)}
              onClick={() => void install()}
            >
              {view === "download" ? "Installation en cours…" : "▶ Reprendre le téléchargement"}
            </button>
            <button
              className="fl-btn fl-btn-sec"
              type="button"
              disabled={busy}
              onClick={() => {
                setInterruptDismissed(true);
                setProgress(null);
                setError(null);
              }}
            >
              Annuler et revenir au choix
            </button>
            <details
              className="fl-details"
              open={techOpen}
              onToggle={(event) => setTechOpen(event.currentTarget.open)}
            >
              <summary>Détails techniques</summary>
              <pre>
                {JSON.stringify(
                  {
                    pack,
                    cacheDir: settings?.cacheDir,
                    progress,
                    plan,
                    error,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        </div>
      )}
    </section>
  );
}

export { FirstLaunchScreen as SplashScreen };
