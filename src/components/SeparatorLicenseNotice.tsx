import {
  separatorLicense,
  type StemProviderId,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

type Props = {
  licenseId: StemProviderId;
  className?: string;
  "data-testid"?: string;
};

export function separatorLicenseNoticeText(id: StemProviderId): string {
  switch (id) {
    case "htdemucs": return t("separate.license.notice.htdemucs");
    case "htdemucs_6s": return t("separate.license.notice.htdemucs6s");
    case "bs_roformer": return t("separate.license.notice.bsRoformer");
    case "mel_band_roformer": return t("separate.license.notice.melRoformer");
  }
}

export function separatorLicenseSourceText(id: StemProviderId): string {
  switch (id) {
    case "htdemucs":
    case "htdemucs_6s": return t("separate.license.source.demucs");
    case "bs_roformer": return t("separate.license.source.bsRoformer");
    case "mel_band_roformer": return t("separate.license.source.melRoformer");
  }
}

export function separatorDisplayNameText(id: StemProviderId): string {
  switch (id) {
    case "htdemucs": return t("phase3.separator.model.htdemucs");
    case "htdemucs_6s": return t("phase3.separator.model.htdemucs6s");
    case "bs_roformer": return t("phase3.separator.model.bsRoformer");
    case "mel_band_roformer": return t("phase3.separator.model.melRoformer");
  }
}

/**
 * Notice licence séparateur — lien Demucs #327 cliquable (même pattern que sep-source-link).
 */
export function SeparatorLicenseNotice({
  licenseId,
  className,
  "data-testid": testId,
}: Props) {
  const license = separatorLicense(licenseId);
  if (!license) return null;

  return (
    <p className={className} data-testid={testId}>
      {separatorLicenseNoticeText(licenseId)}{" "}
      <a
        className="sep-source-link"
        href={license.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {separatorLicenseSourceText(licenseId)}
      </a>
    </p>
  );
}
