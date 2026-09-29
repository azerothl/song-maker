import type { Dispatch, SetStateAction } from "react";
import { t } from "../../ui/i18n";
import type { FormInput } from "../../lib/types";
import type { ScoreDocument, ScoreGate } from "../../lib/score";
import {
  advancedSettingsIntro,
  advancedSettingsTitle,
  DURATION_SEC_MAX,
  DURATION_SEC_MIN,
  DURATION_SEC_STEP,
  formatDurationLabel,
  METERS,
  snapDurationSec,
  soundSummaryValue,
  TONIC_LABELS,
  TONICS,
  workspaceIntro,
  workspaceTitle,
  type AdvancedSettingsPage, FormFieldErrors
} from "./shared";

/** Onglet Create : formulaire de génération, réglages avancés et reprise. */
type CreateWorkspaceProps = {
  advancedSettingsPage: AdvancedSettingsPage;
  advancedSummary: string;
  busy: boolean;
  form: FormInput;
  formFieldErrors: FormFieldErrors;
  onGenerate: () => Promise<void>;
  scoreDocument: ScoreDocument | null;
  scoreGate: ScoreGate;
  setAdvancedSettingsPage: Dispatch<SetStateAction<AdvancedSettingsPage>>;
  setForm: (patch: Partial<FormInput>) => void;
  showFormErrors: boolean;
};

export function CreateWorkspace({
  advancedSettingsPage,
  advancedSummary,
  busy,
  form,
  formFieldErrors,
  onGenerate,
  scoreDocument,
  scoreGate,
  setAdvancedSettingsPage,
  setForm,
  showFormErrors,
}: CreateWorkspaceProps) {
  return (
    <section
      className="song-workspace-panel"
      role="tabpanel"
      id="song-panel-create"
      aria-labelledby="song-tab-create"
    >
      <div className="song-form">
        <header className="song-form-heading song-workspace-heading">
          {advancedSettingsPage !== null && (
            <button
              type="button"
              className="btn ghost form-page-back"
              onClick={() =>
                setAdvancedSettingsPage(
                  advancedSettingsPage === "index" ? null : "index",
                )
              }
            >
              {advancedSettingsPage === "index"
                ? t("form.backToSong")
                : t("form.backToAdvanced")}
            </button>
          )}
          <h2>
            {advancedSettingsPage === null
              ? workspaceTitle("create")
              : advancedSettingsTitle(advancedSettingsPage)}
          </h2>
          <p className="hint">
            {advancedSettingsPage === null
              ? workspaceIntro("create")
              : advancedSettingsIntro(advancedSettingsPage)}
          </p>
        </header>

        {advancedSettingsPage === null && (
          <div className="song-primary-settings">
            <label className="form-field">
              {t("form.title")}
              <input
                value={form.title}
                onChange={(e) => setForm({ title: e.target.value })}
                maxLength={120}
                aria-invalid={
                  showFormErrors && Boolean(formFieldErrors.title)
                }
              />
              {showFormErrors && formFieldErrors.title && (
                <span className="hint error" role="alert">
                  {formFieldErrors.title}
                </span>
              )}
            </label>
            <label className="form-field">
              {t("form.style")}
              <textarea
                value={form.style}
                onChange={(e) => setForm({ style: e.target.value })}
                rows={3}
                aria-invalid={
                  showFormErrors && Boolean(formFieldErrors.style)
                }
              />
              <span className="counter">{form.style.length}/1000</span>
              <span className="hint">
                {t(
                  form.instrumentalMode
                    ? "form.style.hintInstrumental"
                    : "form.style.hint",
                )}
              </span>
              {showFormErrors && formFieldErrors.style && (
                <span className="hint error" role="alert">
                  {formFieldErrors.style}
                </span>
              )}
            </label>
            <label className="instrumental-choice">
              <input
                type="checkbox"
                checked={form.instrumentalMode}
                onChange={(e) =>
                  setForm({ instrumentalMode: e.target.checked })
                }
              />
              <span>
                <strong>{t("form.instrumental")}</strong>
                <small>{t("form.instrumental.hint")}</small>
              </span>
            </label>
            {form.instrumentalMode && (
              <p className="hint ok" role="status">
                {t("form.instrumental.active")}
              </p>
            )}
            <label className="form-field">
              {t(
                form.instrumentalMode
                  ? "form.lyrics.optional"
                  : "form.lyrics",
              )}
              <textarea
                value={form.lyrics}
                onChange={(e) => setForm({ lyrics: e.target.value })}
                rows={10}
                placeholder={
                  form.instrumentalMode
                    ? t("form.lyrics.instrumentalPlaceholder")
                    : undefined
                }
                aria-invalid={
                  showFormErrors && Boolean(formFieldErrors.lyrics)
                }
              />
              <span className="counter">{form.lyrics.length}/4000</span>
              <span className="hint">
                {t(
                  form.instrumentalMode
                    ? "form.lyrics.tagsInstrumental"
                    : "form.lyrics.tags",
                )}
              </span>
              {showFormErrors && formFieldErrors.lyrics && (
                <span className="hint error" role="alert">
                  {formFieldErrors.lyrics}
                </span>
              )}
            </label>

            <div className="song-actions song-actions-sticky">
              <div className="btn-row song-actions-primary">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || Boolean(scoreGate.error)}
                  onClick={() => void onGenerate()}
                >
                  {t("generate.button")}
                </button>
              </div>
              {scoreGate.error && (
                <p className="hint error">{scoreGate.error}</p>
              )}
              {scoreDocument && !scoreGate.error && (
                <p className="hint ok">{t("score.willSendAbc")}</p>
              )}
              {!scoreDocument && (
                <p className="hint">{t("score.phase1Path")}</p>
              )}
            </div>

            <button
              type="button"
              className="form-advanced-entry"
              onClick={() => setAdvancedSettingsPage("index")}
            >
              <span className="form-advanced-entry-title">
                {t("form.advanced")}
              </span>
              <span className="hint">{t("form.advanced.cardHint")}</span>
              <span className="form-advanced-summary">{advancedSummary}</span>
              <span className="form-advanced-entry-action">
                {t("settings.openPage")}
              </span>
            </button>
          </div>
        )}

        {advancedSettingsPage === "index" && (
          <nav
            className="form-parameter-grid"
            aria-label={t("form.advanced")}
          >
            <FormParameterCard
              title={t("form.parameter.sound.title")}
              description={t("form.parameter.sound.cardHint")}
              value={soundSummaryValue(form)}
              onClick={() => setAdvancedSettingsPage("sound")}
            />
            <FormParameterCard
              title={t("form.plan")}
              description={t("form.parameter.plan.cardHint")}
              value={t(
                form.cot === "off"
                  ? "form.plan.off"
                  : form.cot === "melody"
                    ? "form.plan.melody"
                    : "form.plan.full",
              )}
              onClick={() => setAdvancedSettingsPage("plan")}
            />
            <FormParameterCard
              title={t("form.key")}
              description={t("form.parameter.key.cardHint")}
              value={
                form.key
                  ? `${TONIC_LABELS[form.key.tonic] ?? form.key.tonic} · ${t(form.key.mode === "minor" ? "form.key.minor" : "form.key.major")}`
                  : t("form.automatic")
              }
              onClick={() => setAdvancedSettingsPage("key")}
            />
            <FormParameterCard
              title={t("form.meter")}
              description={t("form.parameter.meter.cardHint")}
              value={
                form.meter
                  ? `${form.meter.numerator}/${form.meter.denominator}`
                  : t("form.automatic")
              }
              onClick={() => setAdvancedSettingsPage("meter")}
            />
            <FormParameterCard
              title={t("form.seed")}
              description={t("form.parameter.seed.cardHint")}
              value={
                form.seed == null
                  ? t("form.automatic")
                  : String(form.seed)
              }
              onClick={() => setAdvancedSettingsPage("seed")}
            />
          </nav>
        )}

        {advancedSettingsPage === "sound" && (
          <section className="form-parameter-page">
            <fieldset className="form-section">
              <legend>{t("form.section.sound")}</legend>
              <div className="form-grid">
                <label className="form-field">
                  {t("form.language")}
                  <input
                    placeholder={t("form.language.placeholder")}
                    value={form.singingLanguage ?? ""}
                    onChange={(e) =>
                      setForm({ singingLanguage: e.target.value || null })
                    }
                    maxLength={40}
                  />
                  <span className="hint">{t("form.language.hint")}</span>
                </label>
                <label className="form-field">
                  {t("form.tempo")}
                  <input
                    type="number"
                    min={40}
                    max={220}
                    placeholder={t("form.tempo.placeholder")}
                    value={form.tempoBpm ?? ""}
                    onChange={(e) =>
                      setForm({
                        tempoBpm: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
              </div>
              <span className="hint">{t("form.tempo.hint")}</span>
              <div className="duration-control">
                <div className="duration-heading">
                  <label htmlFor="target-duration">{t("form.duration")}</label>
                  <output
                    htmlFor="target-duration"
                    className="duration-value"
                  >
                    {formatDurationLabel(form.targetDurationSec)}
                  </output>
                </div>
                <input
                  id="target-duration"
                  type="range"
                  className="duration-slider"
                  min={DURATION_SEC_MIN}
                  max={DURATION_SEC_MAX}
                  step={DURATION_SEC_STEP}
                  value={form.targetDurationSec}
                  onChange={(e) =>
                    setForm({
                      targetDurationSec: snapDurationSec(
                        Number(e.target.value),
                      ),
                    })
                  }
                  aria-invalid={
                    showFormErrors && Boolean(formFieldErrors.duration)
                  }
                />
                <div className="duration-range" aria-hidden="true">
                  <span>{formatDurationLabel(DURATION_SEC_MIN)}</span>
                  <span>{formatDurationLabel(DURATION_SEC_MAX)}</span>
                </div>
                {showFormErrors && formFieldErrors.duration && (
                  <p className="hint error" role="alert">
                    {formFieldErrors.duration}
                  </p>
                )}
                <p className="hint">
                  {t(
                    form.preferFullLyrics
                      ? "form.duration.hint"
                      : "form.duration.strictActiveHint",
                  )}
                </p>
                <fieldset className="duration-policy">
                  <legend className="sr-only">
                    {t("form.duration.policy")}
                  </legend>
                  <label className="duration-choice">
                    <input
                      type="radio"
                      name="duration-policy"
                      checked={form.preferFullLyrics}
                      onChange={() => setForm({ preferFullLyrics: true })}
                    />
                    <span>
                      <strong>{t("form.duration.preferLyrics")}</strong>
                      <small>{t("form.duration.preferLyricsHint")}</small>
                    </span>
                  </label>
                  <label className="duration-choice">
                    <input
                      type="radio"
                      name="duration-policy"
                      checked={!form.preferFullLyrics}
                      onChange={() =>
                        setForm({ preferFullLyrics: false })
                      }
                    />
                    <span>
                      <strong>{t("form.duration.strict")}</strong>
                      <small>{t("form.duration.strictHint")}</small>
                    </span>
                  </label>
                </fieldset>
              </div>
            </fieldset>
          </section>
        )}

        {advancedSettingsPage === "plan" && (
          <section className="form-parameter-page">
            <p className="hint">
              {t(
                form.cot === "off"
                  ? "form.plan.offHint"
                  : form.cot === "melody"
                    ? "form.plan.melodyHint"
                    : "form.plan.fullHint",
              )}
            </p>
            <label className="form-field">
              {t("form.plan")}
              <select
                value={form.cot}
                onChange={(e) => setForm({ cot: e.target.value })}
              >
                <option value="full">{t("form.plan.full")}</option>
                <option value="melody">{t("form.plan.melody")}</option>
                <option value="off">{t("form.plan.off")}</option>
              </select>
            </label>
          </section>
        )}

        {advancedSettingsPage === "key" && (
          <section className="form-parameter-page">
            <label className="form-field">
              {t("form.key")}
              <div className="row">
                <select
                  value={form.key?.tonic ?? ""}
                  onChange={(e) => {
                    const tonic = e.target.value;
                    if (!tonic) setForm({ key: null });
                    else
                      setForm({
                        key: {
                          tonic,
                          mode: form.key?.mode ?? "major",
                        },
                      });
                  }}
                >
                  <option value="">{t("form.automatic")}</option>
                  {TONICS.map((tonic) => (
                    <option key={tonic} value={tonic}>
                      {TONIC_LABELS[tonic]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("form.key.mode")}
                  value={form.key?.mode ?? "major"}
                  disabled={!form.key}
                  onChange={(e) =>
                    form.key &&
                    setForm({
                      key: { ...form.key, mode: e.target.value },
                    })
                  }
                >
                  <option value="major">{t("form.key.major")}</option>
                  <option value="minor">{t("form.key.minor")}</option>
                </select>
              </div>
            </label>
          </section>
        )}

        {advancedSettingsPage === "meter" && (
          <section className="form-parameter-page">
            <label className="form-field">
              {t("form.meter")}
              <select
                value={
                  form.meter
                    ? `${form.meter.numerator}/${form.meter.denominator}`
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setForm({ meter: null });
                  else {
                    const [n, d] = v.split("/").map(Number);
                    setForm({
                      meter: { numerator: n, denominator: d },
                    });
                  }
                }}
              >
                {METERS.map((m) => (
                  <option key={m || "none"} value={m}>
                    {m || t("form.automatic")}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {advancedSettingsPage === "seed" && (
          <section className="form-parameter-page">
            <label className="form-field">
              {t("form.seed")}
              <input
                type="number"
                min={0}
                max={4294967295}
                placeholder={t("form.seed.placeholder")}
                value={form.seed ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) {
                    setForm({ seed: null });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) {
                    setForm({ seed: null });
                    return;
                  }
                  setForm({
                    seed: Math.min(Math.trunc(n), 4294967295),
                  });
                }}
              />
            </label>
          </section>
        )}

        {advancedSettingsPage !== null && (
          <div className="song-actions">
            <div className="btn-row song-actions-primary">
              <button
                type="button"
                className="btn primary"
                disabled={busy || Boolean(scoreGate.error)}
                onClick={() => void onGenerate()}
              >
                {t("generate.button")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FormParameterCard({
  title,
  description,
  value,
  onClick,
}: {
  title: string;
  description: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="form-parameter-card" onClick={onClick}>
      <strong>{title}</strong>
      <span className="form-parameter-description">{description}</span>
      <span className="form-parameter-value">{value}</span>
      <span className="form-parameter-open">{t("settings.openPage")}</span>
    </button>
  );
}
