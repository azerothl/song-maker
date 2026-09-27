import { getTranslations } from "next-intl/server";

const GITHUB = "https://github.com/azerothl/song-maker";

export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <div className="brand">Song Maker</div>
          <div>{t("tagline")}</div>
        </div>
        <a href={GITHUB} target="_blank" rel="noreferrer">
          {t("github")}
        </a>
      </div>
    </footer>
  );
}
