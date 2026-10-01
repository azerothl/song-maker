# Bandeau master au-dessus de la règle — 1 octobre 2026

## Symptôme (#289)

Sur Tauri Windows (1282×832), après ouverture de l'automation d'une piste et défilement de Production, les zones sticky Tempo / règle (z-index jusqu'à 5) se dessinaient au-dessus du bandeau master (z-index 4). Les contrôles lecture / waveform n'étaient plus utilisables. #284 avait déjà levé le bandeau à 6 uniquement pendant un dialogue d'export ouvert.

## Correction

Le bandeau sticky master reste au niveau 6 en permanence, au-dessus de la règle (5) et de la voie Tempo (4). Les popovers de piste et l'alignement temporel ne changent pas.

## Preuve

Test Chromium du vrai composant Production : hit-testing du bandeau contre règle / Tempo / marqueurs à 1280 et 640 px après défilement avec automation dépliée et un point ajouté. Le test d'export vérifie aussi que le niveau sticky master reste à 6 après fermeture du dialogue.

Clippy : N/A (CSS + test TypeScript uniquement).
