#!/usr/bin/env node
/** Mesure les ratios de contraste WCAG AA pour l’écran premier lancement. */

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  ["Texte principal", "#F3F0FA", "#221E2C"],
  ["Sur-titre teal", "#5ED8C9", "#1F2D2F"],
  ["Texte atténué (--line2)", "#7A6EA1", "#221E2C"],
  ["Licence", "#E4DEF3", "#221E2C"],
  ["Bouton primaire", "#FFFFFF", "#805CDF"],
  ["Bouton survol", "#FFFFFF", "#6A3FD9"],
  ["Alerte titre", "#FFD5CF", "#3A1F26"],
  ["Focus ring", "#FFD76A", "#221E2C"],
  ["Lien licence", "#C4B2FF", "#221E2C"],
];

for (const [label, fg, bg] of pairs) {
  const ratio = contrastRatio(fg, bg);
  const aa = ratio >= 4.5 ? "AA OK" : ratio >= 3 ? "AA grand texte" : "FAIL";
  console.log(`${label}: ${ratio.toFixed(2)}:1 (${aa}) — ${fg} / ${bg}`);
}
