# Chaque fonction, sa nouvelle place

Légende : **[L]** lu dans le code (`origin/main` @ `bfec8bbe2949fb6abccb0217b9dca1c7275efd61`) · **[M]** maquette PNG · **[D]** décisions Loïc 2026-10-01 · **[S]** inféré.

## 11 fonctions demandées (#224 B)

| Fonction | Nouvelle place | Décision |
|----------|----------------|----------|
| Tempo | Zone Tempo sous la règle + popover ([L] `ClipTimeline`) | Placée — #227 |
| Marqueurs | Zone Marqueurs + popover ([L]) | Placée — #227 |
| Découpe | Palette Édition des clips (Découper / Split) ([L]/[M]) | Placée — #228 ; raccourcis V/C/F/M via #299 |
| Fondus | Palette Fondu + champs ms ([L]) | Placée — #228 ; unité ms [D] |
| Automation | Courbe sous la piste + onglet Automation ([L]/[M]) | Placée — #229 |
| Effets | Onglets EQ / Effets du popover piste ([L]/[D]) | Placée — #226 |
| Normalisation | — | **Hors épique** : aucune UI [L] |
| Export | Exporter + `ExportWizard` ([L]) ; planche p9 [M] | Placée — #230 |
| Métadonnées d’export | — | **Hors épique** : aucune UI [L] |
| Historique | Ctrl/⌘+Z via `patchMix` / overlay ([L]) | Placée |
| Séparer / importer | Réglages du mix + menu Ajouter ([L]/[M]) | Placée — #225 / #226 |

## Autres fonctions actuelles

| Fonction | Nouvelle place | Décision |
|----------|----------------|----------|
| Lecture / transport | Bande master + règle slider ([L]/[M]) | Placée |
| Gain master | Bande master ([L]) | Placée |
| Gain / pan par piste | Toujours visibles en en-tête ([L]/[D]/[M]) | Placée — #226 A |
| Muet / Solo piste et groupe | En-tête piste / groupe ([L]) | Placée |
| Groupes repliables | Voix / Rythmique / Harmonie ([L]/[M]) | Placée |
| Densité | Uniquement dans Réglages du mix ([D]) | Placée — #225 / #299 |
| Grille / subdivision / zoom / aimantation | Réglages du mix ([L]/[D]) | Placée — #225 |
| Assistant de mix / Copilote | Un accès provisoire dans Réglages du mix ; fusion hors épique ([D]) | Placée provisoire — #225 |
| Inspecteur de clip | Surface édition clips ([L]) | Placée — #228 |
| Prises (comping) | Planche p8 [M] | Emplacement planche — #230 |
| Étirement `clips.stretch.*` | Planche p8 [M] | Emplacement planche — #230 |
| Sidechain | Planches [M] | Emplacement planche — #230 |
| Routage | Onglet Routage / planches [L]/[M] | Emplacement planche — #230 |
| Mesure du loudness | Planches [M] | Emplacement planche — #230 |
| Enregistrer une piste | Menu Ajouter ([L]/[M]) | Placée — #226 |
| « Enregistré à » | UI existante ([L]) | Placée |
| Raccourcis | Palette V/C/F/M ([D]/[M]) | Placée — #299 / #228 |

## Lignes « à trancher » (état)

| Sujet | Décision écrite |
|-------|-----------------|
| Nom libre des marqueurs | **Repris** — #227 |
| « Déplacer les clips avec le marqueur » | **Repris** (défaut coché) — #227 |
| Navigation entre marqueurs | **Repris** — #227 |
| Position numérique ms marqueur | **Repris** — ms [D] |
| Saisie « À (ms) » tempo | **Repris** — ms [D] |
| « Marqueur au début du clip » | Conservé — #228 |
| « Lire la valeur d’automation » | **Repris** (ms) — #229 |
| « Effacer la courbe » | **Repris** + rétablir — #229 |
| Inspecteur numérique clip | Placée — #228 |
| Bandeau revert séparation | Conservé ([L]) |
| Pastille `EstimatedSeparationMarker` | Conservée |
| `ExportWizard` | Conservé — #230 |
| Panneau latéral / tiroir ajout | **Écartés** [D] |
