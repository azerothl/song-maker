import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { api } from "../lib/api";
import { isTauriRuntime } from "../lib/runtimeHost";
import {
  NVIDIA_DRIVERS_URL,
  YUE2_LICENSE_URL,
  HTDEMUCS_LICENSE_URL,
  browserDemoFromHash,
  bucketPlanBytes,
  buildFileRows,
  demoInstallPlan,
  mergeInstallProgress,
  demoProgressError,
  demoSetupGpu,
  detectHeadline,
  downloadAnnounceSnapshot,
  downloadLiveAnnouncementChanged,
  downloadLiveAnnouncementText,
  downloadSequentialLead,
  fileRowNeedsRetry,
  formatBytesFr,
  formatDownloadPercent,
  formatEtaFr,
  formatRateFr,
  formatVramGo,
  gpuDetailLine,
  installErrorCopy,
  isMixOnlySkipped,
  licenseAllowsDownload,
  fileRowLicenseBlocked,
  licensesBlockDownload,
  htdemucsLicenseAllowsDownload,
  modelPackVramFailureRisk,
  overallReceived,
  overallTotal,
  parsePack,
  packModelBytes,
  persistMixOnlySkip,
  queuedFileStatusFr,
  remainingAfterResumeLabel,
  resolveFirstLaunchView,
  setupComplete,
  suggestedPackReasonCopy,
  vramBarPercent,
  yue2PeakMib,
  type FileRowStatus,
  type ModelPack,
} from "../lib/firstLaunch";
import type { InstallPlan, InstallProgress, SetupGpuInfo } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import "./FirstLaunchScreen.css";

/** Indique s’il reste du contenu sous le bord bas d’une zone défilante (#196). */
function useCanScrollMore(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): boolean {
  const [canScrollMore, setCanScrollMore] = useState(false);

  useEffect(() => {
    if (!active) {
      setCanScrollMore(false);
      return undefined;
    }
    const el = ref.current;
    if (!el) return undefined;

    const update = () => {
      setCanScrollMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) {
      ro.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref, active]);

  return canScrollMore;
}

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
  activeTitle,
  licenseBlocked = false,
  installInFlight,
}: {
  status: FileRowStatus;
  etaSeconds: number | null | undefined;
  etaIsEstimate: boolean;
  activeTitle?: string | null;
  licenseBlocked?: boolean;
  installInFlight?: boolean;
}) {
  switch (status) {
    case "complete":
      return (
        <>
          <span aria-hidden="true">✓</span> {t("firstLaunch.status.complete")}
        </>
      );
    case "error":
      return (
        <>
          <span className="fl-st-ico" aria-hidden="true">
            ✕
          </span>
          <span>{t("firstLaunch.status.failed")}</span>
        </>
      );
    case "partial":
      return (
        <span>
          <span className="fl-st-ico" aria-hidden="true">
            ↻
          </span>
          {t("firstLaunch.status.toResume")}
          <small>{remainingAfterResumeLabel(etaSeconds, etaIsEstimate)}</small>
        </span>
      );
    case "active":
      return (
        <>
          <span aria-hidden="true">↓</span> {t("firstLaunch.status.inProgress")}
        </>
      );
    case "waiting":
    case "missing": {
      const copy = queuedFileStatusFr({
        status,
        activeTitle,
        licenseBlocked,
        installInFlight,
      });
      return (
        <>
          {licenseBlocked ? (
            <span className="fl-st-ico" aria-hidden="true">
              ⊘
            </span>
          ) : (
            <span aria-hidden="true">◷</span>
          )}
          <span>
            {copy.primary}
            {copy.secondary ? <small>{copy.secondary}</small> : null}
          </span>
        </>
      );
    }
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
  const [accepted, setAccepted] = useState(
    initialDemo?.yue2LicenseAccepted ?? Boolean(initialDemo?.progress),
  );
  const [htdemucsAccepted, setHtdemucsAccepted] = useState(
    initialDemo?.htdemucsLicenseAccepted ??
      Boolean(settings?.acceptedSeparatorLicenses?.htdemucs),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(
    initialDemo?.progress ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [interruptDismissed, setInterruptDismissed] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const downloadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (browser) return;
    if (settings?.acceptedSeparatorLicenses?.htdemucs) {
      setHtdemucsAccepted(true);
    }
  }, [browser, settings?.acceptedSeparatorLicenses?.htdemucs]);

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
    setAccepted(demo.yue2LicenseAccepted ?? Boolean(demo.progress));
    setHtdemucsAccepted(demo.htdemucsLicenseAccepted ?? false);
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
      setProgress((prev) => mergeInstallProgress(prev, event.payload));
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
  const gridCanScrollMore = useCanScrollMore(gridRef, view === "gpu");
  const downloadCanScrollMore = useCanScrollMore(
    downloadScrollRef,
    view === "interrupted" || view === "download",
  );

  const buckets = useMemo(() => bucketPlanBytes(plan), [plan]);
  const rows = useMemo(() => buildFileRows(plan, progress), [plan, progress]);
  const activeQueueTitle = useMemo(
    () => rows.find((row) => row.status === "active")?.title ?? null,
    [rows],
  );
  const downloadLead = useMemo(
    () =>
      view === "download" ? downloadSequentialLead(progress, rows) : null,
    [view, progress, rows],
  );
  const licenseBlocked = licensesBlockDownload(
    accepted,
    settings?.yue2LicenseAccepted,
    htdemucsAccepted,
    settings?.acceptedSeparatorLicenses?.htdemucs,
  );
  const installInFlight =
    busy ||
    progress?.state === "downloading" ||
    progress?.state === "preparing";
  const announceSnapshot = useMemo(
    () => downloadAnnounceSnapshot(rows, downloadLead),
    [rows, downloadLead],
  );
  const [downloadLiveText, setDownloadLiveText] = useState("");
  const announcePrevRef = useRef<typeof announceSnapshot | null>(null);

  useEffect(() => {
    if (view !== "download" && view !== "interrupted") {
      announcePrevRef.current = null;
      setDownloadLiveText("");
      return;
    }
    if (!downloadLiveAnnouncementChanged(announcePrevRef.current, announceSnapshot)) {
      return;
    }
    announcePrevRef.current = announceSnapshot;
    setDownloadLiveText(
      downloadLiveAnnouncementText({
        lead: downloadLead,
        activeTitle: announceSnapshot.activeTitle,
        errorCount: announceSnapshot.errorCount,
      }),
    );
  }, [view, announceSnapshot, downloadLead]);
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
      if (settings) {
        await api.updateSettings({
          ...settings,
          acceptedSeparatorLicenses: {
            ...(settings.acceptedSeparatorLicenses ?? {}),
            htdemucs: true,
          },
        });
        await refreshSettings();
      }
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
          <p className="fl-eyebrow">{t("firstLaunch.eyebrow")}</p>
          <h1>Song Maker</h1>
          <p className="fl-lead">{t("firstLaunch.loading.lead")}</p>
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
              <p className="fl-eyebrow">{t("firstLaunch.eyebrow")}</p>
              <h1 id="fl-title">{t("firstLaunch.gpu.title")}</h1>
              <p className="fl-lead">{t("firstLaunch.gpu.lead")}</p>
            </div>
          </header>

          <div
            className={`fl-scroll-shell${gridCanScrollMore ? " has-more" : ""}`}
            data-scroll-more={gridCanScrollMore ? "true" : "false"}
          >
            <div
              className="fl-grid"
              ref={gridRef}
              tabIndex={gridCanScrollMore ? 0 : undefined}
              role="region"
              aria-label={
                gridCanScrollMore
                  ? t("firstLaunch.gpu.regionAriaMore")
                  : t("firstLaunch.gpu.regionAria")
              }
            >
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
                <h2>{t("firstLaunch.gpu.recoTitle")}</h2>
                <div className="fl-big">
                  {t("firstLaunch.gpu.recoModel", { pack: suggested.toUpperCase() })}{" "}
                  <span className="fl-chip">{t("firstLaunch.gpu.chipRecommended")}</span>
                </div>
                <p>{suggestedPackReasonCopy(gpu)}</p>
              </div>

              <div className="fl-panel" data-testid="fl-download-summary">
                <h2>{t("firstLaunch.gpu.downloadTitle")}</h2>
                <dl className="fl-sum">
                  <div>
                    <dt>{t("firstLaunch.gpu.sumEngine")}</dt>
                    <dd>{formatBytesFr(buckets.engineBytes)}</dd>
                  </div>
                  <div>
                    <dt>{t("firstLaunch.gpu.sumModel", { pack: pack.toUpperCase() })}</dt>
                    <dd>{formatBytesFr(buckets.modelBytes)}</dd>
                  </div>
                  <div className="fl-sum-total">
                    <dt>{t("firstLaunch.gpu.sumTotal")}</dt>
                    <dd>{formatBytesFr(buckets.totalBytes)}</dd>
                  </div>
                  <div>
                    <dt>
                      {progress?.overallBytesPerSec
                        ? t("firstLaunch.gpu.etaAtRate", {
                            rate: formatRateFr(progress.overallBytesPerSec) ?? "",
                          })
                        : t("firstLaunch.gpu.eta")}
                    </dt>
                    <dd>{etaLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="fl-models" role="radiogroup" aria-label={t("firstLaunch.gpu.modelsAria")}>
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
                        {option === "q4"
                          ? t("firstLaunch.gpu.pack.q4.title")
                          : t("firstLaunch.gpu.pack.q8.title")}{" "}
                        {recommended ? (
                          <span className="fl-chip">{t("firstLaunch.gpu.chipRecommended")}</span>
                        ) : (
                          <span className="fl-chip neutral">{t("firstLaunch.gpu.chipDemanding")}</span>
                        )}
                      </b>
                      <span className="fl-size">
                        {formatBytesFr(packModelBytes(option))}
                      </span>
                    </div>
                    <p>
                      {option === "q4"
                        ? t("firstLaunch.gpu.pack.q4.body")
                        : t("firstLaunch.gpu.pack.q8.body")}
                    </p>
                    <div className="fl-bars">
                      <span>
                        {t("firstLaunch.gpu.vramUsed", {
                          peak: peakGo ?? "—",
                          detected: vramGo
                            ? t("firstLaunch.gpu.vramDetected", { vram: vramGo })
                            : "",
                        })}
                      </span>
                      <div className="fl-vram" aria-hidden="true">
                        <i className={peakPct >= 90 ? "hi" : undefined} style={{ width: `${peakPct}%` }} />
                      </div>
                    </div>
                    {modelPackVramFailureRisk(option, vram) ? (
                      <p className="fl-vram-risk" role="note">
                        {t("firstLaunch.gpu.q8Risk")}
                      </p>
                    ) : null}
                  </label>
                );
              })}
              <p className="fl-hint">{t("firstLaunch.gpu.packHint")}</p>
            </div>
            </div>
            {gridCanScrollMore ? (
              <div className="fl-scroll-hint" aria-hidden="true">
                <span>{t("firstLaunch.scrollMore")}</span>
              </div>
            ) : null}
          </div>

          <div className="fl-foot">
            <div className="fl-license">
              <p>
                {t("firstLaunch.license.yue2Before")}{" "}
                <a href={YUE2_LICENSE_URL} target="_blank" rel="noreferrer">
                  CC BY-NC 4.0
                </a>{" "}
                {t("firstLaunch.license.yue2After")}
              </p>
              <label className="fl-cb" htmlFor="fl-license-accept">
                <input
                  id="fl-license-accept"
                  type="checkbox"
                  checked={accepted}
                  disabled={busy}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                {t("firstLaunch.license.yue2Accept")}
              </label>
              <p className="fl-htdemucs-notice" data-testid="fl-htdemucs-notice">
                {t("firstLaunch.license.htdemucsNotice")}{" "}
                <a
                  className="fl-demucs-link"
                  href={HTDEMUCS_LICENSE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Demucs #327
                </a>
                .
              </p>
              <label className="fl-cb" htmlFor="fl-htdemucs-license-accept">
                <input
                  id="fl-htdemucs-license-accept"
                  type="checkbox"
                  checked={htdemucsAccepted}
                  disabled={busy}
                  aria-label={t("firstLaunch.license.htdemucsAccept")}
                  onChange={(event) => setHtdemucsAccepted(event.target.checked)}
                />
                {t("firstLaunch.license.htdemucsAccept")}
              </label>
            </div>
            <div className="fl-actions">
              {!licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted) ? (
                <p className="fl-license-required" role="status">
                  {t("firstLaunch.license.required")}
                </p>
              ) : null}
              {!htdemucsLicenseAllowsDownload(
                htdemucsAccepted,
                settings?.acceptedSeparatorLicenses?.htdemucs,
              ) ? (
                <p className="fl-license-required" role="status">
                  {t("firstLaunch.license.htdemucsRequired")}
                </p>
              ) : null}
              <button
                className="fl-btn fl-btn-lg"
                type="button"
                disabled={
                  busy ||
                  !licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted) ||
                  !htdemucsLicenseAllowsDownload(
                    htdemucsAccepted,
                    settings?.acceptedSeparatorLicenses?.htdemucs,
                  )
                }
                onClick={() => void install()}
              >
                {t("firstLaunch.gpu.downloadCta", {
                  size: formatBytesFr(buckets.totalBytes),
                })}
              </button>
              <span className="fl-hint">{t("firstLaunch.gpu.resumeHint")}</span>
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
              <p className="fl-eyebrow">{t("firstLaunch.eyebrow")}</p>
              <h1 id="fl-title">{t("firstLaunch.gpu.title")}</h1>
              <p className="fl-lead">{t("firstLaunch.noGpu.lead")}</p>
            </div>
          </header>

          <div className="fl-alert" role="alert">
            <div className="fl-ai" aria-hidden="true">!</div>
            <div>
              <h2>{t("firstLaunch.noGpu.alertTitle")}</h2>
              <p>{t("firstLaunch.noGpu.alertBody")}</p>
            </div>
          </div>

          <div className="fl-alts">
            <section className="fl-alt" aria-labelledby="fl-b1">
              <span className="fl-num">{t("firstLaunch.noGpu.opt1.num")}</span>
              <h3 id="fl-b1">{t("firstLaunch.noGpu.opt1.title")}</h3>
              <p>{t("firstLaunch.noGpu.opt1.body")}</p>
              <ul>
                <li>{t("firstLaunch.noGpu.opt1.li1")}</li>
                <li>{t("firstLaunch.noGpu.opt1.li2")}</li>
              </ul>
              <div className="fl-sp" />
              <a className="fl-btn fl-btn-sec" href={NVIDIA_DRIVERS_URL} target="_blank" rel="noreferrer">
                {t("firstLaunch.noGpu.opt1.drivers")}
              </a>
              <button className="fl-btn fl-btn-sec" type="button" onClick={() => void relancer()}>
                {t("firstLaunch.noGpu.opt1.redetect")}
              </button>
            </section>

            <section className="fl-alt" aria-labelledby="fl-b2">
              <span className="fl-num">{t("firstLaunch.noGpu.opt2.num")}</span>
              <h3 id="fl-b2">{t("firstLaunch.noGpu.opt2.title")}</h3>
              <p>{t("firstLaunch.noGpu.opt2.body")}</p>
              <ul>
                <li>{t("firstLaunch.noGpu.opt2.li1")}</li>
                <li>{t("firstLaunch.noGpu.opt2.li2")}</li>
              </ul>
              <div className="fl-toggle">
                <span className="fl-sw" aria-hidden="true" />
                {t("firstLaunch.noGpu.opt2.toggle")}
              </div>
              <div className="fl-sp" />
              <button className="fl-btn fl-btn-sec" type="button" onClick={ouvrirWorker}>
                {t("firstLaunch.noGpu.opt2.configure")}
              </button>
            </section>

            <section className="fl-alt rec" aria-labelledby="fl-b3">
              <span className="fl-num">{t("firstLaunch.noGpu.opt3.num")}</span>
              <h3 id="fl-b3">{t("firstLaunch.noGpu.opt3.title")}</h3>
              <p>{t("firstLaunch.noGpu.opt3.body")}</p>
              <ul>
                <li>{t("firstLaunch.noGpu.opt3.li1")}</li>
                <li>{t("firstLaunch.noGpu.opt3.li2")}</li>
              </ul>
              <div className="fl-sp" />
              <button className="fl-btn" type="button" onClick={continuerSansGeneration}>
                {t("firstLaunch.noGpu.opt3.cta")}
              </button>
            </section>
          </div>
          <p className="fl-note-b">
            <span>{t("firstLaunch.noGpu.noteNoModel")}</span>
            <span>{t("firstLaunch.noGpu.noteDetect", { detail: headline.detail })}</span>
          </p>
        </div>
      )}

      {(view === "interrupted" || view === "download") && (
        <div className="fl-card fl-card-download">
          <div
            className="sr-only"
            role="status"
            aria-live="polite"
            data-testid="fl-download-live"
          >
            {downloadLiveText}
          </div>
          <div className="fl-download-body">
          <header className="fl-head">
            <div>
              <p className="fl-eyebrow">{t("firstLaunch.download.eyebrow")}</p>
              <h1 id="fl-title">
                {view === "download"
                  ? t("firstLaunch.download.titleActive")
                  : t("firstLaunch.download.titleInterrupted")}
              </h1>
              <p className="fl-lead" data-testid="fl-download-lead">
                {view === "download"
                  ? (downloadLead ??
                    t("firstLaunch.download.leadSequentialFallback"))
                  : t("firstLaunch.download.leadInterrupted")}
              </p>
            </div>
          </header>

          <div
            className={`fl-scroll-shell${downloadCanScrollMore ? " has-more" : ""}`}
            data-scroll-more={downloadCanScrollMore ? "true" : "false"}
          >
            <div
              className="fl-scroll-body"
              ref={downloadScrollRef}
              tabIndex={downloadCanScrollMore ? 0 : undefined}
              role="region"
              aria-label={
                downloadCanScrollMore
                  ? t("firstLaunch.download.regionAriaMore")
                  : t("firstLaunch.download.regionAria")
              }
            >
              <div className="fl-files" role="list">
                {rows.map((row) => {
                  const rowLicenseBlocked = fileRowLicenseBlocked({
                    fileName: row.name,
                    status: row.status,
                    yue2Accepted: accepted,
                    settingsYue2: settings?.yue2LicenseAccepted,
                    htdemucsAccepted: htdemucsAccepted,
                    settingsHtdemucs: settings?.acceptedSeparatorLicenses?.htdemucs,
                  });
                  return (
                  <div
                    key={row.name}
                    className={`fl-file${
                      row.status === "error"
                        ? " err fl-needs-action"
                        : row.status === "partial"
                          ? " fl-needs-action fl-needs-resume"
                          : rowLicenseBlocked
                            ? " fl-blocked-license"
                            : row.status === "waiting"
                              ? " fl-queued"
                              : ""
                    }`}
                    role="listitem"
                    data-fl-status={row.status}
                    data-testid={`fl-file-row-${row.name}`}
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
                          {row.percent ? ` · ${formatDownloadPercent(row.percent)}` : ""}
                        </span>
                        <span>
                          {row.bytesPerSec
                            ? t("firstLaunch.download.speed", {
                                rate: formatRateFr(row.bytesPerSec) ?? "",
                              })
                            : row.status === "error"
                              ? t("firstLaunch.download.speedZero")
                              : formatDownloadPercent(row.percent)}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`fl-st ${
                        row.status === "complete"
                          ? "ok"
                          : row.status === "error" || row.status === "partial"
                            ? "er fl-st-action"
                            : "wt"
                      }`}
                    >
                      <FileStatusLabel
                        status={row.status}
                        etaSeconds={progress?.etaSeconds}
                        etaIsEstimate={Boolean(progress?.etaIsEstimate)}
                        activeTitle={
                          row.status === "waiting" || row.status === "missing"
                            ? activeQueueTitle
                            : null
                        }
                        licenseBlocked={rowLicenseBlocked}
                        installInFlight={installInFlight}
                      />
                      {fileRowNeedsRetry(row.status) ? (
                        <>
                          {licenseBlocked ? (
                            <p
                              className="fl-retry-blocked-reason"
                              id={`fl-retry-reason-${row.name}`}
                            >
                              {t("firstLaunch.retryFileBlockedReason")}
                            </p>
                          ) : null}
                          <button
                            className="fl-btn fl-btn-sec fl-btn-row-retry"
                            type="button"
                            data-testid="fl-retry-file"
                            disabled={busy || licenseBlocked}
                            aria-describedby={
                              licenseBlocked ? `fl-retry-reason-${row.name}` : undefined
                            }
                            onClick={() => void install()}
                          >
                            {t("firstLaunch.retryFile")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="fl-global">
                <span>
                  {overallTotal(plan, progress) != null
                    ? t("firstLaunch.download.totalKnown", {
                        received: formatBytesFr(overallReceived(plan, progress)),
                        total: formatBytesFr(overallTotal(plan, progress)!),
                      })
                    : t("firstLaunch.download.totalPartial", {
                        received: formatBytesFr(overallReceived(plan, progress)),
                      })}
                </span>
                <span>
                  {t("firstLaunch.download.timeRemaining", { eta: etaLabel })}
                </span>
              </div>

              {view === "interrupted" && (
                <div className="fl-errbox" role="alert">
                  <div className="fl-ai" aria-hidden="true">!</div>
                  <div>
                    <h2>{errorCopy.title}</h2>
                    <p>{errorCopy.body}</p>
                    {(progress?.error?.message ?? error) && (
                      <details className="fl-error-details">
                        <summary>{t("firstLaunch.error.details")}</summary>
                        <p>{progress?.error?.message ?? error}</p>
                      </details>
                    )}
                    <ol>
                      {errorCopy.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
            {downloadCanScrollMore ? (
              <div className="fl-scroll-hint" aria-hidden="true">
                <span>{t("firstLaunch.scrollMore")}</span>
              </div>
            ) : null}
          </div>
          </div>

          <div className="fl-foot fl-row-actions">
            <button
              className="fl-btn fl-btn-lg"
              type="button"
              data-testid="fl-resume-download"
              disabled={
                busy ||
                !licenseAllowsDownload(accepted, settings?.yue2LicenseAccepted) ||
                !htdemucsLicenseAllowsDownload(
                  htdemucsAccepted,
                  settings?.acceptedSeparatorLicenses?.htdemucs,
                )
              }
              onClick={() => void install()}
            >
              {view === "download" ? t("firstLaunch.installBusy") : t("firstLaunch.resumeDownload")}
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
              {t("firstLaunch.download.cancelBack")}
            </button>
            <details
              className="fl-details"
              open={techOpen}
              onToggle={(event) => setTechOpen(event.currentTarget.open)}
            >
              <summary>{t("firstLaunch.download.techDetails")}</summary>
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
