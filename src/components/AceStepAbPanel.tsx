import { formatCommercialReservedBadge } from "@song-maker/stem-providers";
import { useEffect, useState } from "react";
import { TakePreviewPlayer } from "./TakePreviewPlayer";
import { pickEngineAbPair } from "../lib/aceStepAb";
import type { GenerationSummary } from "../lib/types";
import { profileLocale, t } from "../ui/i18n";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { useAppStore } from "../store/appStore";

type Side = "yue2" | "aceStep";

type Props = {
  generations: GenerationSummary[];
  busy: boolean;
  takeLabels?: Record<string, string>;
  onGenerateAceStep: () => Promise<void>;
};

export function AceStepAbPanel({
  generations,
  busy,
  takeLabels,
  onGenerateAceStep,
}: Props) {
  const pair = pickEngineAbPair(generations);
  const [side, setSide] = useState<Side>("yue2");
  const settings = useAppStore(s => s.settings);
  const [generationReady, setGenerationReady] = useState(!isTauriRuntime());
  const [checking, setChecking] = useState(isTauriRuntime());
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    setChecking(true);
    void runtimeApi.aceStepInstallInfo().then(info => {
      if (!disposed) setGenerationReady(info.available && info.licenseAccepted);
    }).catch(() => {
      if (!disposed) setGenerationReady(false);
    }).finally(() => {
      if (!disposed) setChecking(false);
    });
    return () => { disposed = true; };
  }, [settings?.aceStepLicenseAccepted]);
  const reserved = formatCommercialReservedBadge(
    "disponible avec réserve",
    profileLocale(),
  );

  const labelFor = (g: GenerationSummary) => takeLabels?.[g.id] ?? g.id;
  const selectedTake = pair ? (side === "yue2" ? pair.yue2 : pair.aceStep) : null;

  return (
    <section className="ace-step-ab" aria-labelledby="ace-step-ab-title">
      <h3 id="ace-step-ab-title">{t("aceStep.ab.title")}</h3>
      <p className="hint">{t("aceStep.ab.hint")}</p>
      <p className="ace-step-ab-badge" role="note">
        {reserved}
      </p>
      {pair ? (
        <>
          <div className="ace-step-ab-sides" role="group" aria-label={t("aceStep.ab.group")}>
            <button
              type="button"
              className="btn"
              aria-pressed={side === "yue2"}
              onClick={() => setSide("yue2")}
            >
              YuE2 · {labelFor(pair.yue2)}
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={side === "aceStep"}
              onClick={() => setSide("aceStep")}
            >
              ACE-Step · {labelFor(pair.aceStep)}
            </button>
          </div>
          {selectedTake?.audioPath && <TakePreviewPlayer audioPath={selectedTake.audioPath} label={labelFor(selectedTake)} />}
        </>
      ) : (
        <p className="hint">{t("aceStep.ab.needBoth")}</p>
      )}
      <button
        type="button"
        className="btn"
        disabled={busy || checking || !generationReady}
        aria-describedby={!generationReady ? "ace-step-ab-install-reason" : undefined}
        onClick={() => void onGenerateAceStep()}
      >
        {t("aceStep.ab.generate")}
      </button>
      {!generationReady && <div id="ace-step-ab-install-reason" role="status">
        <p className="hint">{t(checking ? "aceStep.ab.checking" : "aceStep.ab.installRequired")}</p>
        {!checking && <button type="button" className="btn" onClick={() => useAppStore.getState().openModelSettings("ace_step")}>{t("production.instrumental.openSettings")}</button>}
      </div>}
    </section>
  );
}
