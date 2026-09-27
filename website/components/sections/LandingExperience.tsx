import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "./LandingExperience.module.css";

const STEMS = ["voice", "drums", "bass", "other"] as const;
const STEPS = ["idea", "generation", "separation"] as const;
const CAPABILITIES = ["generation", "score", "takes", "mix", "export"] as const;
const FAQ = ["stems", "local", "hardware", "license"] as const;

const WAVE_PATHS = [
  "M0 21 5 20 10 22 15 12 20 9 25 17 30 6 35 14 40 4 45 11 50 10 55 20 60 14 65 22 70 17 75 20 80 13 85 21 90 16 95 22 100 18 105 20 110 15 115 22 120 17 125 20 130 13 135 19 140 16 145 21 150 18 155 22 160 17 165 20 170 14 175 21 180 17 185 20 190 16 195 21 200 18",
  "M0 20 5 19 10 20 15 11 20 18 25 6 30 14 35 3 40 17 45 8 50 21 55 13 60 19 65 9 70 21 75 15 80 19 85 6 90 18 95 12 100 21 105 15 110 20 115 10 120 18 125 6 130 20 135 13 140 19 145 8 150 21 155 14 160 19 165 6 170 18 175 11 180 20 185 15 190 19 195 9 200 20",
  "M0 21 5 18 10 22 15 15 20 20 25 10 30 19 35 7 40 16 45 13 50 21 55 17 60 20 65 11 70 18 75 15 80 22 85 12 90 19 95 16 100 20 105 9 110 17 115 14 120 21 125 10 130 19 135 15 140 22 145 12 150 18 155 14 160 21 165 11 170 20 175 15 180 22 185 13 190 18 195 16 200 20",
  "M0 21 5 20 10 22 15 17 20 21 25 14 30 19 35 11 40 20 45 15 50 22 55 18 60 20 65 13 70 19 75 16 80 22 85 14 90 21 95 17 100 20 105 12 110 18 115 16 120 22 125 13 130 19 135 16 140 22 145 14 150 20 155 17 160 22 165 13 170 19 175 16 180 22 185 14 190 20 195 17 200 21",
];

export async function LandingExperience() {
  const t = await getTranslations("landing");

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1>{t("headline")}</h1>
          <p className={styles.lede}>{t("intro")}</p>
          <div className={styles.actions}>
            <Link className="btn btn-primary" href="/docs">{t("installCta")}</Link>
            <a className={styles.textLink} href="#parcours">{t("pathCta")} <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroFootnote}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>{t("localNote")}</span>
          </div>
        </div>

        <figure className={styles.flowCard} aria-labelledby="flow-title flow-caption">
          <div className={styles.flowHeader}>
            <span className={styles.flowKicker}>{t("diagram.kicker")}</span>
            <span className={styles.flowTitle} id="flow-title">{t("diagram.title")}</span>
          </div>
          <div className={styles.flowBody}>
            <div className={styles.inputCard}>
              <span className={styles.miniLabel}>{t("diagram.inputLabel")}</span>
              <strong>{t("diagram.inputStyle")}</strong>
              <span className={styles.paperLines} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.inputLyrics}>{t("diagram.inputLyrics")}</span>
            </div>
            <span className={styles.connector} aria-hidden="true">→</span>
            <div className={styles.renderCard}>
              <div className={styles.renderMeta}><span>{t("diagram.renderLabel")}</span><span className={styles.waveDot} /></div>
              <svg viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true" className={styles.mainWave}>
                <path d={WAVE_PATHS[0]} />
              </svg>
              <div className={styles.renderFooter}><span>{t("diagram.model")}</span><span>{t("diagram.stereo")}</span></div>
            </div>
            <span className={styles.connector} aria-hidden="true">→</span>
            <div className={styles.stemStack}>
              <span className={styles.miniLabel}>{t("diagram.stemsLabel")}</span>
              {STEMS.map((stem, index) => (
                <div className={`${styles.stem} ${styles[`stem${index}`]}`} key={stem}>
                  <span className={styles.stemName}>{t(`diagram.stems.${stem}`)}</span>
                  <svg viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true">
                    <path d={WAVE_PATHS[index]} />
                  </svg>
                </div>
              ))}
            </div>
          </div>
          <figcaption className={styles.flowCaption} id="flow-caption">
            <span>{t("diagram.caption")}</span>
            <span className={styles.caveat}>{t("diagram.caveat")}</span>
          </figcaption>
        </figure>
      </section>

      <div className={styles.factStrip}>
        <div><span className={styles.factIndex}>01</span><span>{t("facts.generation")}</span></div>
        <div><span className={styles.factIndex}>02</span><span>{t("facts.separation")}</span></div>
        <div><span className={styles.factIndex}>03</span><span>{t("facts.privacy")}</span></div>
      </div>

      <section className={styles.process} id="parcours">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>{t("process.eyebrow")}</p><h2>{t("process.title")}</h2></div>
          <p>{t("process.intro")}</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`process.steps.${step}.title`)}</h3>
              <p>{t(`process.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.capabilities} id="features">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>{t("capabilities.eyebrow")}</p><h2>{t("capabilities.title")}</h2></div>
          <p>{t("capabilities.intro")}</p>
        </div>
        <div className={styles.capabilityGrid}>
          {CAPABILITIES.map((item, index) => (
            <article key={item} className={styles.capability}>
              <span className={styles.capabilityIndex}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`capabilities.items.${item}.title`)}</h3>
              <p>{t(`capabilities.items.${item}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.setup} id="configuration">
        <div className={styles.setupCopy}>
          <p className={styles.eyebrow}>{t("setup.eyebrow")}</p>
          <h2>{t("setup.title")}</h2>
          <p>{t("setup.intro")}</p>
          <Link className={styles.textLink} href="/docs">{t("setup.link")} <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.setupSpecs}>
          <div><span>{t("setup.systemLabel")}</span><strong>{t("setup.systems")}</strong></div>
          <div><span>{t("setup.gpuLabel")}</span><strong>{t("setup.gpu")}</strong></div>
          <div><span>{t("setup.licenseLabel")}</span><strong>{t("setup.license")}</strong></div>
          <p>{t("setup.licenseNote")}</p>
        </div>
      </section>

      <section className={styles.faq} id="resources">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>{t("faq.eyebrow")}</p><h2>{t("faq.title")}</h2></div>
          <Link className={styles.textLink} href="/docs">{t("faq.link")} <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.questions}>
          {FAQ.map((item) => (
            <details key={item}>
              <summary>{t(`faq.items.${item}.question`)}</summary>
              <p>{t(`faq.items.${item}.answer`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>{t("closing.eyebrow")}</p>
        <div><h2>{t("closing.title")}</h2><p>{t("closing.body")}</p></div>
        <Link className="btn btn-primary" href="/docs">{t("installCta")}</Link>
      </section>
    </>
  );
}
