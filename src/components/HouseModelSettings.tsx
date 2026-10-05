import { t } from "../ui/i18n";

export function HouseModelSettings() {
  return (
    <details
      className="house-model-settings"
      data-testid="house-model-settings"
      aria-labelledby="house-model-title"
    >
      <summary id="house-model-title">{t("settings.model.house.title")}</summary>
      <p className="hint">{t("settings.model.house.intro")}</p>
    </details>
  );
}
