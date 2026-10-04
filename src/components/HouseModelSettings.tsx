import { houseModelStatus } from "../lib/houseModel";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function HouseModelSettings() {
  const health = useAppStore((s) => s.health);
  const status = houseModelStatus(health?.houseModelRuntime);

  return (
    <section
      className="house-model-settings"
      data-testid="house-model-settings"
      aria-labelledby="house-model-title"
    >
      <h3 id="house-model-title">{t("settings.model.house.title")}</h3>
      <p className="hint">{t("settings.model.house.intro")}</p>
      <fieldset className="settings-engine-options">
        <legend>{t("settings.model.house.choose")}</legend>
        <label className="settings-engine-option">
          <input
            type="radio"
            name="house-model-engine"
            value="house_model"
            checked={false}
            disabled
          />
          <span>
            <strong>{t("settings.model.house.name")}</strong>
            <small>{t("settings.model.house.unavailable")}</small>
          </span>
        </label>
      </fieldset>
      <p className="hint warn" role="status" data-testid="house-model-runtime">
        {t("settings.model.house.runtime", { runtime: status.runtime })}
      </p>
      <p className="hint" role="note">
        {status.messageFr}
      </p>
    </section>
  );
}
