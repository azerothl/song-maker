/** Largeur max. du panneau Créer (~1200 px), voir #131. */
export const CREATE_PANEL_MAX_WIDTH_REM = 75;

/** À partir de cette largeur viewport, la grille passe en deux colonnes. */
export const CREATE_LAYOUT_TWO_COLUMN_MIN_PX = 901;

/**
 * Ordre de tabulation attendu sur l’écran principal (réglages avancés exclus).
 * Doit correspondre à l’ordre DOM dans `CreateWorkspace`.
 */
export const CREATE_PRIMARY_TAB_FIELD_ORDER = [
  "title",
  "style",
  "lyrics",
  "instrumentalMode",
  "advancedSettings",
  "generate",
] as const;

export type CreatePrimaryTabField =
  (typeof CREATE_PRIMARY_TAB_FIELD_ORDER)[number];

export type GenerateShortcutKeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

/**
 * Raccourci documenté sur l’onglet Créer : Ctrl+Entrée (ou ⌘+Entrée).
 * Entrée seule reste disponible dans les paroles (nouvelle ligne).
 */
export function matchesGenerateShortcut(
  event: GenerateShortcutKeyEvent,
): boolean {
  if (event.altKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== "Enter") return false;
  return true;
}
