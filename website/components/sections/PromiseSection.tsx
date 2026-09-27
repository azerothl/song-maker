import { getTranslations } from "next-intl/server";

export async function PromiseSection() {
  const t = await getTranslations("promise");

  return (
    <section className="section" id="promise" data-animate-section>
      <p className="section-eyebrow">{t("eyebrow")}</p>
      <h2 className="section-title">{t("title")}</h2>
      <p className="section-body" style={{ maxWidth: "40rem" }}>
        {t("body")}
      </p>
    </section>
  );
}
