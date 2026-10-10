import type { ErrorPresentation } from "../lib/errorPresentation";
import { t } from "../ui/i18n";

type ErrorBannerProps = {
  presentation: ErrorPresentation;
  onDismiss: () => void;
};

export function ErrorBanner({ presentation, onDismiss }: ErrorBannerProps) {
  return (
    <div className="banner error">
      <div className="banner-error-copy">
        <span role="alert">{presentation.message}</span>
        {presentation.details && (
          <details className="error-details">
            <summary>{t("error.technicalDetails")}</summary>
            <pre tabIndex={0}>{presentation.details}</pre>
          </details>
        )}
      </div>
      <button
        type="button"
        aria-label={t("error.dismiss")}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
