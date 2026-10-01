/** Touches qui activent un bouton M/S (comportement natif des `<button>`). */
export function isMixMsActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}
