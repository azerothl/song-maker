import { presentGlobalError } from "../lib/errorPresentation";
import { t } from "../ui/i18n";

type ErrorNoticeProps = {
  message: string;
  className?: string;
  role?: "alert" | "status";
};

export function ErrorNotice({
  message,
  className = "hint error",
  role = "alert",
}: ErrorNoticeProps) {
  const presentation = presentGlobalError(message);

  return (
    <div className={className} role={role}>
      <span>{presentation.message}</span>
      {presentation.details && (
        <details className="error-details">
          <summary>{t("error.technicalDetails")}</summary>
          <pre tabIndex={0}>{presentation.details}</pre>
        </details>
      )}
    </div>
  );
}
