import {
  licenseStatusIcon,
  licenseStatusLabelFr,
  type LicenseStatusKind,
  type SeparatorLicenseInfo,
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

/**
 * Licence badge with status icon + label (#167).
 * Status is never colour-only: icon + text always present.
 */
export function SeparatorLicenseBadge({ license, className }: Props) {
  const icon = licenseStatusIcon(license.status);
  const statusLabel = licenseStatusLabelFr(license.status);
  const classes = [statusClass(license.status), className]
    .filter(Boolean)
    .join(" ");
  const title = [
    statusLabel,
    license.badgeFr,
    license.readDate ? `lu le ${license.readDate}` : null,
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
      <span className="sep-license-text">{license.badgeFr}</span>
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
          ({t("separate.license.readDate").replace("{date}", license.readDate)})
        </span>
      ) : null}
    </span>
  );
}
