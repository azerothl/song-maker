import { useEffect, useState } from "react";
import {
  mixBakeStatusPhaseOnPendingChange,
  resetMixBakeDonePhase,
  type MixBakeStatusPhase,
} from "../lib/mixBakeStatusAnnouncement";
import { t } from "../ui/i18n";

const DONE_VISIBLE_MS = 2500;

type Props = {
  pending: boolean;
  failed: boolean;
  className?: string;
};

function messageForPhase(phase: MixBakeStatusPhase): string {
  switch (phase) {
    case "pending":
      return t("player.mixBakePending");
    case "done":
      return t("player.mixBakeDone");
    case "error":
      return t("player.mixBakeFailed");
    default:
      return "";
  }
}

/**
 * Indicateur discret + annonces lecteurs d’écran pendant le rebake production.
 * Emplacement à hauteur fixe (évite le reflow) ; `role="status"` toujours monté (R3).
 */
export function MixBakeStatusIndicator({ pending, failed, className }: Props) {
  const [phase, setPhase] = useState<MixBakeStatusPhase>("hidden");

  useEffect(() => {
    setPhase((prev) => mixBakeStatusPhaseOnPendingChange(prev, pending, failed));
  }, [pending, failed]);

  useEffect(() => {
    if (phase !== "done" && phase !== "error") return;
    const timer = window.setTimeout(() => {
      setPhase((prev) => resetMixBakeDonePhase(prev));
    }, DONE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const message = messageForPhase(phase);
  const isError = phase === "error";

  return (
    <div
      className={["player-mix-bake-status-slot", className]
        .filter(Boolean)
        .join(" ")}
    >
      <p
        className="player-mix-bake-status"
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
      >
        {message}
      </p>
    </div>
  );
}
