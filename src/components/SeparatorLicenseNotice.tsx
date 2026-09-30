import {
  DEMUCS_327_ISSUE_URL,
  HTDEMUCS_MAINTAINER_STATEMENT_EN,
  separatorLicense,
  type StemProviderId,
} from "@song-maker/stem-providers";

type Props = {
  licenseId: StemProviderId;
  className?: string;
  "data-testid"?: string;
};

function isHtDemucsFamily(id: StemProviderId): boolean {
  return id === "htdemucs" || id === "htdemucs_6s";
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

  if (isHtDemucsFamily(licenseId)) {
    return (
      <p className={className} data-testid={testId}>
        {licenseId === "htdemucs_6s" ? (
          <>Même famille Demucs, licence des poids 6 stems non vérifiée. </>
        ) : null}
        Poids HTDemucs : le mainteneur adefossez a écrit le 23 mai 2022 (
        <a
          className="sep-source-link"
          href={DEMUCS_327_ISSUE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Demucs #327
        </a>
        ) que les poids « {HTDEMUCS_MAINTAINER_STATEMENT_EN} ». Lu le{" "}
        {license.readDate ?? "2026-09-29"}. La fiche audio.cpp indique « MIT,
        usage commercial : oui » mais aucune source amont ne le confirme ; cette
        mention ne doit pas être lue comme la licence des poids. Le code
        d&apos;audio.cpp v0.8.2 est sous Apache-2.0 (les poids gardent leur
        licence d&apos;origine).
      </p>
    );
  }

  return (
    <p className={className} data-testid={testId}>
      {license.noticeFr}
    </p>
  );
}
