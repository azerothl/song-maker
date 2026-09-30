import { buildCommercialEngineRowsUi } from "../lib/commercialEnginesUi";
import { t } from "../ui/i18n";

export function CommercialEnginesPanel() {
  const rows = buildCommercialEngineRowsUi();
  const reserved = rows.filter((r) => r.availability === "reserved");
  const grayed = rows.filter((r) => r.availability === "grayed");

  return (
    <section
      className="commercial-engines-panel"
      data-testid="commercial-engines-panel"
      aria-labelledby="commercial-engines-title"
    >
      <header className="commercial-engines-header">
        <h2 id="commercial-engines-title">{t("profiles.engines.title")}</h2>
        <span className="profile-kind-badge commercial">
          {t("profiles.engines.commercialBadge")}
        </span>
      </header>
      {reserved.length > 0 ? (
        <ul className="commercial-engines-list reserved">
          {reserved.map((row) => (
            <li key={row.id} data-testid={`engine-row-${row.id}`}>
              <div className="engine-row-head">
                <strong>{row.name}</strong>
                {row.reservedBadge ? (
                  <span className="engine-badge reserved">{row.reservedBadge}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="commercial-engines-gray-title">
        {t("profiles.engines.graySection")}
      </h3>
      <ul className="commercial-engines-list grayed">
        {grayed.map((row) => (
          <li
            key={row.id}
            className="commercial-engine-grayed"
            data-testid={`engine-row-${row.id}`}
          >
            <div className="engine-row-head">
              <span className="engine-category">{row.categoryLabel}</span>
              <strong>{row.name}</strong>
              <span className="engine-status">{t("profiles.engines.unavailable")}</span>
            </div>
            <p className="engine-gray-reason">{row.reasonLabel}</p>
            {row.whyHref ? (
              <a
                className="engine-why-link profile-focusable"
                href={row.whyHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`engine-why-${row.id}`}
              >
                {t("profiles.engines.why")} — {row.whyLabel}
              </a>
            ) : (
              <span className="engine-why-missing">{row.whyLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
