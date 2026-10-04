import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DemoMixer } from "./DemoMixer";
import { APP_VERSION } from "@/lib/releases";
import { localeDocsPath } from "@/lib/docs";
import { type AppLocale } from "@/i18n/routing";
import styles from "./LandingExperience.module.css";

const STEPS = ["idea", "generation", "separation"] as const;
const CAPABILITIES = ["generation", "score", "takes", "instrumental", "batch", "mix", "export"] as const;
const FAQ = ["stems", "local", "hardware", "license", "batch"] as const;

export async function LandingExperience() {
  const t = await getTranslations("landing");
  const locale = (await getLocale()) as AppLocale;
  const newsHref = localeDocsPath(locale, {
    fr: "/docs/nouveautes",
    en: "/docs/whats-new",
  });
  const setupHref = localeDocsPath(locale, {
    fr: "/docs/configuration",
    en: "/docs/setup",
  });
  const batchHref = localeDocsPath(locale, {
    fr: "/docs/generation-batch",
    en: "/docs/batch-generation",
  });

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1>{t("headline")}</h1>
          <p className={styles.lede}>{t("intro")}</p>
          <div className={styles.actions}>
            <Link className="btn btn-primary" href="/docs">{t("installCta")}</Link>
            <a className={styles.textLink} href="#mixer">{t("pathCta")} <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroFootnote}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>{t("localNote")}</span>
          </div>
        </div>

        <DemoMixer />
      </section>

      <div className={styles.factStrip}>
        <div><span className={styles.factIndex}>01</span><span>{t("facts.generation")}</span></div>
        <div><span className={styles.factIndex}>02</span><span>{t("facts.separation")}</span></div>
        <div><span className={styles.factIndex}>03</span><span>{t("facts.privacy")}</span></div>
      </div>

      <section className={styles.release} aria-labelledby="release-title">
        <p className={styles.eyebrow}>{t("news.eyebrow", { version: APP_VERSION })}</p>
        <div className={styles.releaseCopy}>
          <h2 id="release-title">{t("news.title")}</h2>
          <p>{t("news.body")}</p>
        </div>
        <div className={styles.releaseLinks}>
          <Link className={styles.textLink} href={newsHref}>{t("news.whatsNew")} <span aria-hidden="true">→</span></Link>
          <Link className={styles.textLink} href={setupHref}>{t("news.setup")} <span aria-hidden="true">→</span></Link>
          <Link className={styles.textLink} href={batchHref}>{t("news.batch")} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

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
          <Link className={styles.textLink} href={setupHref}>{t("setup.link")} <span aria-hidden="true">→</span></Link>
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
