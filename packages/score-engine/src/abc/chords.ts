import { ACCEPTED_CHORD_SUFFIXES } from "../constants.js";

const ROOT = "([A-G](?:#|b)?)";
const SUFFIX_ALT = ACCEPTED_CHORD_SUFFIXES.filter((s) => s.length > 0)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join("|");

const CHORD_RE = new RegExp(
  `^${ROOT}(?:${SUFFIX_ALT})?(?:/${ROOT})?$`,
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns null if the symbol is in the YuE2 chord vocabulary (§7.6).
 * Otherwise returns a refusal reason naming the symbol.
 */
export function validateChordSymbol(symbol: string): string | null {
  if (!CHORD_RE.test(symbol)) {
    return `accord refusé: ${symbol}`;
  }
  // Reject extensions not in the allow-list even if they look chord-like
  if (/13|9|11|:/.test(symbol)) {
    return `accord refusé: ${symbol}`;
  }
  return null;
}

export function isAcceptedChordSymbol(symbol: string): boolean {
  return validateChordSymbol(symbol) === null;
}
