# Squelette d’ouverture portée (#249)

Pendant le gel synchrone d’ouverture d’une partition longue (~200–250 ms sur `main`), afficher un squelette à hauteur réservée (CLS 0) et une annonce lecteur d’écran.

## Captures

| Fichier | Locale | Viewport |
| --- | --- | --- |
| `captures/skeleton-fr-1280x720.png` | FR | 1280×720 |
| `captures/skeleton-fr-640x720.png` | FR | 640×720 |
| `captures/skeleton-en-1280x720.png` | EN | 1280×720 |
| `captures/skeleton-en-640x720.png` | EN | 640×720 |

Génération : `pnpm exec tsx scripts/capture-score-staff-skeleton.mts` (`?staffSkeleton=1` force le squelette).

## Mesures

| Critère | Statut | Détail |
| --- | --- | --- |
| Annonce FR/EN | **MESURÉ** | clés `score.staff.loading` / `loadingRegion` ; `role="status"` + `aria-busy` |
| CLS 0 | **CALCULÉ** | `min-height` / `height` alignés sur `.abc-staff-scroll` (`min(280px, 40vh)`) |
| Gel réduit | **NON TESTÉ** | le squelette peint avant `buildStaffAbc` / abcjs (2× rAF) ; durée du gel inchangée en ordre de grandeur |
