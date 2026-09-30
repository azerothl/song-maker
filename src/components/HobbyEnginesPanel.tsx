import { buildHobbyEngineOffers } from "@song-maker/stem-providers";
import { profileLocale, t } from "../ui/i18n";

export function HobbyEnginesPanel() {
  const offers = buildHobbyEngineOffers();
  const locale = profileLocale();

  return (
    <section
      className="hobby-engines-panel"
      data-testid="hobby-engines-panel"
      aria-labelledby="hobby-engines-title"
    >
      <header className="commercial-engines-header">
        <h2 id="hobby-engines-title">{t("profiles.engines.hobbyTitle")}</h2>
      </header>
      <p className="hint">{t("profiles.engines.hobbyIntro")}</p>
      <ul className="commercial-engines-list hobby-offered">
        {offers.map(({ engine, usageNoticeFr }) => (
          <li key={engine.id} data-testid={`hobby-engine-row-${engine.id}`}>
            <div className="engine-row-head">
              <span className="engine-category">
                {engine.category === "generation"
                  ? t("profiles.engines.category.generation")
                  : engine.category === "separation"
                    ? t("profiles.engines.category.separation")
                    : t("profiles.engines.category.transcription")}
              </span>
              <strong>
                {locale === "en" ? engine.displayNameEn : engine.displayNameFr}
              </strong>
              {usageNoticeFr ? (
                <span className="engine-nc-badge" data-testid={`hobby-engine-nc-${engine.id}`}>
                  {locale === "en" ? "Non-commercial use" : usageNoticeFr}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
