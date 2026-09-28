# Synchroniser un clip au tempo sans changer la hauteur

Issue [#95](https://github.com/azerothl/song-maker/issues/95).

## Décision

Traitement **local** TypeScript dans `@song-maker/mix-production` (`timeStretch` + placement clips).

| Aspect | Choix |
|---|---|
| Étirement | WSOLA / overlap-add — hauteur préservée |
| Transposition | Indépendante (resample + re-stretch), ±12 demi-tons |
| Tempo projet | `followProjectTempo` + `sourceTempoBpm` / tempo formulaire (`ProjectDoc.tempoBpm`) ; carte mix #94 quand disponible |
| Persistance | Champs optionnels sur `MixClip` (JSON mix) — original WAV intact |
| A/B | `processingEnabled` off → région source brute |
| Bake | `placeClipsOnTimeline` partagé lecture (bake forcé) / export |

## Qualité

| Matériau | Conseil |
|---|---|
| Voix | Ratios proches de 1 et petites transpositions OK |
| Batterie | Éviter > ±15 % ; transitoires floutés |
| Polyphonie | Artifacts possibles hors ±10 % / ±2 demi-tons |
| Extrême | Ratio hors 0,5–2 ou \|transpose\| > 7 → dégradé net |

Pas Rubber Band / SoundTouch — licence et dépendance natives hors v1.

## Dépendance #94

La grille musicale / tempo-map mix (#94) peaufinera la source de tempo ; v1 utilise le BPM projet déjà exposé au delay sync.
