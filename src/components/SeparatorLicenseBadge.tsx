import {
  licenseStatusIcon,
  licenseStatusLabelFr,
  type SeparatorLicenseInfo,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

type Props = {
  license: SeparatorLicenseInfo;
  className?: string;
};

/** Badge licence séparateur : icône + texte (#167). */
export function SeparatorLicenseBadge({ license, className }: Props) {
  const statusLabel = licenseStatusLabelFr(license.status);
  const icon = licenseStatusIcon(license.status);
  const nc =
    license.status === "non_commercial"
      ? ` · ${t("separate.license.nc")}`
      : "";
  const classes = [
    "sep-license-badge",
    license.status === "non_commercial" ? "nc" : "",
    license.status === "unverified" ? "unverified" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-license-status={license.status}>
      <span className="sep-license-badge-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sep-license-badge-text">
        {license.badgeFr || statusLabel}
        {nc}
      </span>
    </span>
  );
}
