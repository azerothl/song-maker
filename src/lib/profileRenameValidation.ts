/** Max profile name length (Unicode scalar values), aligned with Rust `PROFILE_NAME_MAX_CHARS`. */
export const PROFILE_NAME_MAX_LENGTH = 80;

export function profileNameCharCount(name: string): number {
  return [...name].length;
}

export function profileNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function profileNamesCollide(a: string, b: string): boolean {
  return profileNameKey(a) === profileNameKey(b);
}
