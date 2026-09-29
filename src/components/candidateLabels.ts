import { t } from "../ui/i18n";

/** Libellé du bouton de génération de candidats (#133 suivi). */
export function candidateGenerateLabel(count: number): string {
  if (count === 1) return t("candidates.generateOne");
  return t("candidates.generateMany", { count: String(count) });
}
