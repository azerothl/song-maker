# Automation sous chaque piste

La bascule du popover de piste ouvre maintenant une courbe Volume/Panoramique sous cette piste. Ajout à la position de lecture ou à un temps saisi, clic sur la courbe, déplacement par glisser, champs numériques et flèches clavier. Temps en millisecondes, volume borné de -24 à +12 dB, pan de -1 à +1. Une courbe vide est permise et conserve les réglages de base ; un effacement peut être rétabli. Les cibles avancées et la lecture de valeur restent dans le rack avancé.

Données : mêmes volumePointsByTrack / panPointsByTrack, même productionState et même toolkit que lecture/export ; pas de migration. L'éditeur avancé se synchronise avec les modifications par piste.

Validation observée : tests Chromium Windows FR/1280 et EN/640, ajout, déplacement clavier, bornes, effacement/rétablissement, séparation des cibles, restauration après rechargement ; sampleAt vérifié numériquement à -24 dB après modification. Captures de la vue React avec pistes synthétiques dans captures/. Aucun test natif Tauri, écoute de stems réels, audit de lecteur d'écran ou campagne de mutations revendiqués. Ces preuves restent à réunir pour clôturer #229.