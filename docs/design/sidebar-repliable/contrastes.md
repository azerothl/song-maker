# Sidebar repliable — contraste survol

## Survol item menu (fond `#2F2A3D`, texte `#F3F0FA`)

| Source | Détail |
|--------|--------|
| **Constantes maquette** | `SIDEBAR_HOVER_TEXT` / `SIDEBAR_HOVER_BG` dans `src/lib/sidebarContrast.ts` → ratio `SIDEBAR_HOVER_CONTRAST_RATIO` (~12,28:1). Utilisé dans `metrics.json` lorsque aucun survol actif n’est mesuré. |
| **Mesure DOM** | Sur la capture replié + survol, `getComputedStyle` sur le bouton survolé et sur l’infobulle (voir `tooltip` / `hoverContrast.source: "dom"` dans `captures-react/metrics.json`). |

Test automatisé tokens : `src/lib/sidebarContrast.test.ts`.
