import { convertFileSrc } from "@tauri-apps/api/core";
import { formatCommercialReservedBadge } from "@song-maker/stem-providers";
import { useEffect, useRef, useState } from "react";
import { pickEngineAbPair } from "../lib/aceStepAb";
import type { GenerationSummary } from "../lib/types";
import { profileLocale, t } from "../ui/i18n";

type Side = "yue2" | "aceStep";

type Props = {
  generations: GenerationSummary[];
  busy: boolean;
  takeLabels?: Record<string, string>;
  onGenerateAceStep: () => Promise<void>;
};

function audioUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

export function AceStepAbPanel({
  generations,
  busy,
  takeLabels,
  onGenerateAceStep,
}: Props) {
  const pair = pickEngineAbPair(generations);
  const [side, setSide] = useState<Side>("yue2");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reserved = formatCommercialReservedBadge(
    "disponible avec réserve",
    profileLocale(),
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !pair) return;
    const take = side === "yue2" ? pair.yue2 : pair.aceStep;
    const url = audioUrl(take.audioPath);
    if (!url) return;
    el.src = url;
    void el.play().catch(() => {
      /* autoplay may be blocked until the user clicks Play */
    });
  }, [pair, side]);

  const labelFor = (g: GenerationSummary) => takeLabels?.[g.id] ?? g.id;

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
          <audio ref={audioRef} controls className="ace-step-ab-player" />
        </>
      ) : (
        <p className="hint">{t("aceStep.ab.needBoth")}</p>
      )}
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => void onGenerateAceStep()}
      >
        {t("aceStep.ab.generate")}
      </button>
    </section>
  );
}
