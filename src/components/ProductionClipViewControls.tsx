import type { MusicalSubdivision } from "../lib/musicalTime";
import type { ProductionClipViewPrefs } from "../lib/productionClipViewPrefs";
import { formatClipZoomValue } from "../screens/song/shared";
import { t } from "../ui/i18n";

const TIME_SNAP_MS = 50;
const SUBDIVISIONS: MusicalSubdivision[] = [1, 2, 4, 8];

function subdivisionLabel(sub: MusicalSubdivision): string {
  switch (sub) {
    case 1:
      return t("clips.sub.quarter");
    case 2:
      return t("clips.sub.eighth");
    case 4:
      return t("clips.sub.sixteenth");
    case 8:
      return t("clips.sub.thirtysecond");
    default: {
      const _exhaustive: never = sub;
      return String(_exhaustive);
    }
  }
}

export type ProductionClipViewControlsProps = {
  prefs: ProductionClipViewPrefs;
  onChange: (patch: Partial<ProductionClipViewPrefs>) => void;
  /** Quick bar: snap + zoom only. */
  variant?: "full" | "quick";
  idPrefix?: string;
};

export function productionClipViewControlNames(
  prefs: ProductionClipViewPrefs,
  variant: "full" | "quick" = "full",
): string[] {
  const names: string[] = [t("production.settings.snap")];
  if (variant === "full") {
    names.push(t("clips.gridMusical"), t("clips.gridTime"));
    if (prefs.gridMode === "musical") {
      names.push(
        t("clips.sub.quarter"),
        t("clips.sub.eighth"),
        t("clips.sub.sixteenth"),
        t("clips.sub.thirtysecond"),
      );
    }
  }
  names.push(t("clips.zoom"));
  return names;
}

export function ProductionClipViewControls({
  prefs,
  onChange,
  variant = "full",
  idPrefix = "clip-view",
}: ProductionClipViewControlsProps) {
  const zoomReadout = formatClipZoomValue(prefs.zoom);

  return (
    <div className="production-clip-view-controls" data-variant={variant}>
      <button
        type="button"
        className="production-clip-view-btn production-clip-view-snap"
        id={`${idPrefix}-snap`}
        aria-pressed={prefs.snapEnabled}
        onClick={() => onChange({ snapEnabled: !prefs.snapEnabled })}
      >
        <span className="production-density-check" aria-hidden>
          ✓
        </span>
        {t("production.settings.snap")}
      </button>

      {variant === "full" && (
        <>
          <div
            className="production-clip-view-seg"
            role="group"
            aria-label={t("clips.gridMode")}
          >
            <button
              type="button"
              className="production-clip-view-btn"
              aria-pressed={prefs.gridMode === "musical"}
              onClick={() => onChange({ gridMode: "musical" })}
            >
              <span className="production-density-check" aria-hidden>
                ✓
              </span>
              {t("clips.gridMusical")}
            </button>
            <button
              type="button"
              className="production-clip-view-btn"
              aria-pressed={prefs.gridMode === "time"}
              onClick={() => onChange({ gridMode: "time" })}
            >
              <span className="production-density-check" aria-hidden>
                ✓
              </span>
              {t("clips.gridTime")}
            </button>
          </div>

          {prefs.gridMode === "musical" && (
            <div
              className="production-clip-view-seg"
              role="group"
              aria-label={t("clips.subdivision")}
            >
              {SUBDIVISIONS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  className="production-clip-view-btn"
                  aria-pressed={prefs.subdivision === sub}
                  onClick={() => onChange({ subdivision: sub })}
                >
                  <span className="production-density-check" aria-hidden>
                    ✓
                  </span>
                  {subdivisionLabel(sub)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label className="production-clip-view-zoom">
        <span>{t("clips.zoom")}</span>
        <span className="production-clip-view-zoom-value">{zoomReadout}</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.25}
          value={prefs.zoom}
          aria-label={t("clips.zoom")}
          aria-valuetext={zoomReadout}
          onChange={(e) => onChange({ zoom: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

export { TIME_SNAP_MS };
