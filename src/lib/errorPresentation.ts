import { t } from "../ui/i18n";

const TECHNICAL_ERROR_PATTERNS = [
  /\bHTTP\s+\d{3}\b/i,
  /\b(?:server_error|invalid_argument|request_failed)\b/i,
  /\b(?:ENOENT|EACCES|EIO|os error \d+|0x[\da-f]{8})\b/i,
  /\b(?:NotFound|PermissionDenied|ConnectionRefused|TimedOut|InvalidData|AlreadyExists)\b/i,
  /\b(?:raw_os_error|kind|code)\s*[:=]/i,
  /\b(?:failed|failure)\b/i,
  /^\s*(?:error|exception|échec|erreur)\s*[:—-]/i,
  /\b[a-z][a-z\d_]*\.[a-z][a-z\d_]*\s+(?:must|was|is|should|failed|cannot|not)\b/i,
  /(?:stack backtrace:|traceback \(most recent call last\)|\bpanicked at\b)/i,
  /"error"\s*:\s*\{/i,
  /\b(?:std|serde|tokio|tauri|rusqlite)::[\w:]+/i,
  /(?:[A-Z]:\\|\.rs:\d+:\d+|at [\w./-]+:\d+:\d+)/i,
];

const MAX_ERROR_DETAILS_LENGTH = 4000;

function boundedDetails(message: string): string {
  return message.length > MAX_ERROR_DETAILS_LENGTH
    ? `${message.slice(0, MAX_ERROR_DETAILS_LENGTH)}\n…`
    : message;
}

export type ErrorPresentation = {
  message: string;
  details?: string;
};

export function presentGlobalError(rawMessage: string): ErrorPresentation {
  const message = rawMessage.trim();
  if (!message) return { message: t("error.actionFailed") };

  const separationRecoveryMessage = t("separate.run.failed");
  const separationDetailsPrefix = `${separationRecoveryMessage}\n\n`;
  if (message.startsWith(separationDetailsPrefix)) {
    const details = message.slice(separationDetailsPrefix.length).trim();
    return {
      message: separationRecoveryMessage,
      ...(details ? { details: boundedDetails(details) } : {}),
    };
  }

  if (!TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message };
  }

  return {
    message: t("error.actionFailed"),
    details: boundedDetails(message),
  };
}
