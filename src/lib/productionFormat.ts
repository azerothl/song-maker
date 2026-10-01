import { t } from "../ui/i18n";

/** Nombre affiché avec séparateur décimal selon la locale (#226 B4). */
export function formatProductionDecimal(
  value: number,
  fractionDigits = 1,
): string {
  const dec = t("production.num.decimal");
  const fixed = value.toFixed(fractionDigits);
  return dec === "," ? fixed.replace(".", ",") : fixed;
}

/** Valeur absolue en dB avec unité i18n (ex. « −3,0 dB » / « -3.0 dB »). */
export function formatProductionDb(db: number, fractionDigits = 1): string {
  const rounded = Math.round(db * 10 ** fractionDigits) / 10 ** fractionDigits;
  const abs = formatProductionDecimal(Math.abs(rounded), fractionDigits);
  const body =
    rounded > 0 ? `+${abs}` : rounded < 0 ? `−${abs}` : abs;
  return t("production.unit.db", { value: body });
}

export function formatProductionDbPerOct(slope: 12 | 24): string {
  return t("production.unit.dbPerOct", { value: String(slope) });
}
