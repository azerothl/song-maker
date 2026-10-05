import {
  licenseStatusIcon,
  type LicenseStatusKind,
  type SeparatorLicenseInfo,
  type StemProviderId,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

type Props = {
  license: SeparatorLicenseInfo;
  /** Extra class on the badge span. */
  className?: string;
};

function statusClass(status: LicenseStatusKind): string {
  switch (status) {
    case "verified":
      return "sep-license-badge verified";
    case "unverified":
      return "sep-license-badge unverified";
    case "non_commercial":
      return "sep-license-badge nc";
    case "excluded":
      return "sep-license-badge excluded";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function separatorLicenseStatusText(status: LicenseStatusKind): string {
  switch (status) {
    case "verified": return t("separate.license.status.verified");
    case "unverified": return t("separate.license.status.unverified");
    case "non_commercial": return t("separate.license.status.nonCommercial");
    case "excluded": return t("separate.license.status.excluded");
  }
}

export function separatorLicenseBadgeText(id: StemProviderId): string {
  switch (id) {
    case "htdemucs": return t("separate.license.badge.htdemucs");
    case "htdemucs_6s": return t("separate.license.badge.htdemucs6s");
    case "bs_roformer": return t("separate.license.badge.bsRoformer");
    case "mel_band_roformer": return t("separate.license.badge.melRoformer");
  }
}

/**
 * Licence badge with status icon + label (#167).
 * Status is never colour-only: icon + text always present.
 */
export function SeparatorLicenseBadge({ license, className }: Props) {
  const icon = licenseStatusIcon(license.status);
  const statusLabel = separatorLicenseStatusText(license.status);
  const badgeText = separatorLicenseBadgeText(license.id);
  const readDate = license.readDate
    ? t("separate.license.readDate").replace("{date}", license.readDate)
    : null;
  const classes = [statusClass(license.status), className]
    .filter(Boolean)
    .join(" ");
  const title = [
    statusLabel,
    badgeText,
    readDate,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={classes}
      title={title}
      data-license-status={license.status}
      data-testid={`sep-license-badge-${license.id}`}
    >
      <span className="sep-license-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sep-license-status">{statusLabel}</span>
      <span className="sep-license-sep" aria-hidden="true">
        ·
      </span>
      <span className="sep-license-text">{badgeText}</span>
      {license.status === "non_commercial" ? (
        <>
          <span className="sep-license-sep" aria-hidden="true">
            ·
          </span>
          <span>{t("separate.license.nc")}</span>
        </>
      ) : null}
      {license.readDate ? (
        <span className="sep-license-date">
          {" "}
          ({readDate})
        </span>
      ) : null}
    </span>
  );
}
