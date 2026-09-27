import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { InstallProgress } from "../lib/types";
import { useAppStore } from "../store/appStore";

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} Go`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} Mo`;
  return `${Math.round(value / 1024)} Ko`;
}

export function SplashScreen() {
  const health = useAppStore((s) => s.health);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const [loading, setLoading] = useState(true);
  const [pack, setPack] = useState<"q4" | "q8">("q4");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([refreshHealth(), refreshSettings()]).then(() => {
      if (!active) return;
      const current = useAppStore.getState();
      const ready = current.health?.modelsOk && current.health?.binaryOk;
      if (ready) setScreen("library");
      setPack(current.settings?.modelPack === "q8" ? "q8" : current.health?.suggestedPack === "q8" ? "q8" : "q4");
      setAccepted(current.settings?.yue2LicenseAccepted ?? false);
      setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(String(reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [refreshHealth, refreshSettings, setScreen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("setup-progress", (event) => setProgress(event.payload))
      .then((dispose) => { unlisten = dispose; })
      .catch((reason) => setError(String(reason)));
    return () => unlisten?.();
  }, []);

  const percent = useMemo(() => {
    if (!progress || progress.fileCount === 0) return 0;
    if (progress.state === "complete") return 100;
    const within = progress.totalBytes
      ? Math.min(1, progress.receivedBytes / progress.totalBytes)
      : 0;
    return Math.round(Math.min(99, ((Math.max(0, progress.fileIndex - 1) + within) / progress.fileCount) * 100));
  }, [progress]);

  async function install() {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await api.installRequiredAssets(pack, accepted);
      await Promise.all([refreshHealth(), refreshSettings()]);
      setScreen("library");
    } catch (reason) {
      setError(String(reason));
      await refreshHealth();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="setup-screen" aria-live="polite"><h1>Song Maker</h1><p>Vérification des composants nécessaires…</p></section>;
  }

  const ready = health?.modelsOk && health?.binaryOk;
  if (ready) return null;
  const missing: string[] = [];
  if (!health?.binaryOk) missing.push("moteur audio");
  if (!health?.modelsOk) missing.push("modèles YuE2, VAE et HTDemucs");

  return (
    <section className="setup-screen" aria-labelledby="setup-title">
      <div className="setup-card">
        <div className="setup-mark" aria-hidden="true">♫</div>
        <p className="setup-eyebrow">Première installation</p>
        <h1 id="setup-title">Préparons Song Maker</h1>
        <p className="setup-intro">
          {`L’application a besoin de télécharger ${missing.join(" et ")}. Cela représente plusieurs gigaoctets. Cette étape ne se fait qu’une fois.`}
        </p>

        {health?.gpuName && <p className="setup-device">Accélération détectée : <strong>{health.gpuName}</strong>{health.vramMib ? ` · ${Math.round(health.vramMib / 1024)} Go de mémoire vidéo` : ""}</p>}
        {!health?.cudaAvailable && <p className="setup-warning" role="alert">Aucune accélération prise en charge n’a été détectée. Song Maker demande un GPU NVIDIA sous Windows/Linux ou Apple Metal sous macOS.</p>}

        <fieldset className="setup-packs" disabled={busy}>
          <legend>Choisissez la taille du modèle</legend>
          <label className={`setup-pack ${pack === "q4" ? "selected" : ""}`}>
            <input type="radio" name="model-pack" value="q4" checked={pack === "q4"} onChange={() => setPack("q4")} />
            <span><strong>Q4 · recommandé</strong><small>Fichier plus léger, adapté aux cartes avec moins de mémoire.</small></span>
          </label>
          <label className={`setup-pack ${pack === "q8" ? "selected" : ""}`}>
            <input type="radio" name="model-pack" value="q8" checked={pack === "q8"} onChange={() => setPack("q8")} />
            <span><strong>Q8 · meilleure précision</strong><small>Modèle plus volumineux, recommandé avec au moins 12 Go de mémoire vidéo.</small></span>
          </label>
        </fieldset>

        <label className="setup-consent">
          <input type="checkbox" checked={accepted} disabled={busy} onChange={(event) => setAccepted(event.target.checked)} />
          <span>J’accepte la licence <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">CC BY-NC 4.0</a> de YuE2 et comprends que ce modèle n’autorise pas les usages commerciaux.</span>
        </label>

        {busy && progress && (
          <div className="setup-progress" aria-live="polite">
            <div className="setup-progress-copy"><span>{progress.state === "preparing" ? progress.label : `Téléchargement : ${progress.label}`}</span><strong>{percent}%</strong></div>
            <progress max={100} value={percent} aria-label="Progression de l’installation" />
            <small>{progress.state === "downloading" ? `Fichier ${progress.fileIndex} sur ${progress.fileCount}${progress.totalBytes ? ` · ${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)}` : ""}. Les fichiers incomplets seront repris automatiquement.` : "Préparation des fichiers…"}</small>
          </div>
        )}
        {error && <p className="setup-error" role="alert">{error}</p>}

        <button className="btn primary setup-install" type="button" disabled={busy || !accepted || !health?.cudaAvailable} onClick={() => void install()}>
          {busy ? "Installation en cours…" : "Télécharger et installer"}
        </button>
        <p className="setup-footnote">Les fichiers sont téléchargés depuis les dépôts officiels épinglés par Song Maker et vérifiés par empreinte. Une interruption permet de reprendre le téléchargement au prochain essai.</p>
      </div>
    </section>
  );
}
