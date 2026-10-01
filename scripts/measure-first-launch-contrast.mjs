#!/usr/bin/env node
/**
 * Grille rapide alignée sur docs/design/first-launch/contrastes.md (PR #122).
 * Audit complet = Playwright sur la maquette ; ici couples plats pour régression CI locale.
 */

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

function report(label, fg, bg, threshold = 4.5) {
  const ratio = contrastRatio(fg, bg);
  const aa =
    ratio >= threshold
      ? "OK"
      : threshold === 3 && ratio >= 3
        ? "OK (3:1 UI)"
        : "FAIL";
  console.log(`${label}: ${ratio.toFixed(2)}:1 (${aa}) — ${fg} / ${bg}`);
}

console.log("Référence : docs/design/first-launch/contrastes.md\n");

report("Texte principal", "#F3F0FA", "#221E2C");
report("Texte atténué (--muted)", "#BDB6CF", "#221E2C");
report("Sur-titre teal", "#5ED8C9", "#221E2C");
report("Licence", "#E4DEF3", "#1F1B28");
report("Lien licence", "#C4B2FF", "#1F1B28");
report("Bouton primaire (--purple-btn)", "#FFFFFF", "#805CDF");
report("Bouton survol (--purple-btn-h)", "#FFFFFF", "#6A3FD9", 4.5);
report("Alerte titre", "#FFD5CF", "#3A1F26");
report("Focus ring", "#FFD76A", "#221E2C");
report("Bordure btn sec / pbar (--line2)", "#7A6EA1", "#2A2536", 3);
report("Remplissage btn principal / carte", "#805CDF", "#1F1B28", 3);
