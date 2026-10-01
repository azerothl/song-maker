import { PROFILE_NAME_MAX_LENGTH } from "./profileRenameValidation";
import { t } from "../ui/i18n";

export const PROFILE_RENAME_ERROR_EMPTY = "profiles.rename.error.empty";
export const PROFILE_RENAME_ERROR_TOO_LONG = "profiles.rename.error.tooLong";
export const PROFILE_RENAME_ERROR_DUPLICATE = "profiles.rename.error.duplicate";

/** Map Tauri `rename_profile` / `create_profile` error codes to localized UI copy. */
export function formatProfileRenameInvokeError(raw: unknown): string {
  const msg = String(raw);
  switch (msg) {
    case PROFILE_RENAME_ERROR_EMPTY:
      return t(PROFILE_RENAME_ERROR_EMPTY);
    case PROFILE_RENAME_ERROR_TOO_LONG:
      return t(PROFILE_RENAME_ERROR_TOO_LONG, {
        max: String(PROFILE_NAME_MAX_LENGTH),
      });
    case PROFILE_RENAME_ERROR_DUPLICATE:
      return t(PROFILE_RENAME_ERROR_DUPLICATE);
    default:
      return msg;
  }
}

export function isProfileRenameErrorCode(msg: string): boolean {
  return (
    msg === PROFILE_RENAME_ERROR_EMPTY ||
    msg === PROFILE_RENAME_ERROR_TOO_LONG ||
    msg === PROFILE_RENAME_ERROR_DUPLICATE
  );
}
