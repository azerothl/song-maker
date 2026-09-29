# Captures React — barre latérale repliable

Captures **réelles** (`sidebar-capture.html`, mock Tauri), mesures `getBoundingClientRect` dans `metrics.json`.

## Génération

```bash
pnpm exec tsx docs/design/sidebar-repliable/captures-react/capture.mts
```

## Contraste survol (documenté)

Voir `src/lib/sidebarContrast.ts` : texte `#F3F0FA` sur fond survol `#2F2A3D` (maquette), ratio ≥ 4,5:1 (WCAG AA).

## Fichiers

| PNG | Scénario |
|-----|----------|
| `sidebar-react-deplie-1280x720.png` | `#expanded` |
| `sidebar-react-replie-1280x720.png` | `#collapsed` |
| `sidebar-react-replie-tooltip-1280x720.png` | replié + survol Bibliothèque |
| `sidebar-react-focus-toggle-1280x720.png` | focus clavier sur la bascule |
| `sidebar-react-auto-1024x700.png` | `#auto` viewport 1024×700 |
