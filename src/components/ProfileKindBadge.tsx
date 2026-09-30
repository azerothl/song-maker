import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

type Props = {
  className?: string;
};

export function ProfileKindBadge({ className = "" }: Props) {
  const profilesState = useAppStore((s) => s.profilesState);
  const active = profilesState?.profiles.find((p) => p.isActive);
  if (!active) return null;

  const label =
    active.kind === "commercial"
      ? t("profiles.onboarding.type.commercial")
      : t("profiles.onboarding.type.hobby");

  return (
    <span
      className={`profile-title-badge ${active.kind}${className ? ` ${className}` : ""}`}
      data-testid="profile-title-badge"
    >
      <span className="profile-title-badge-icon" aria-hidden="true">
        {active.kind === "commercial" ? "💼" : "🏠"}
      </span>
      {label}
    </span>
  );
}
