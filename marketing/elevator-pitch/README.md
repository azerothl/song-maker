# Song Maker — pitch vidéo

- **Vidéo :** `song-maker-pitch-30s.mp4` — 30 s, 1920 × 1080, 30 i/s, H.264 + AAC stéréo.
- **Ambiance sonore :** composition électronique originale synthétisée pour cette vidéo (`original-soundtrack.wav`), sans extrait du modèle YuE2.
- **Visuels :** interface illustrative dessinée pour le pitch, pas une capture de l’application en fonctionnement. Les fonctions montrées suivent la documentation du dépôt.
- **Aperçu :** `storyboard-preview.png`.

Le récit suit l’idée et les paroles, la génération YuE2 sur l’ordinateur, la comparaison de prises, la séparation standard HTDemucs en voix / batterie / basse / autres sons, le réglage du mix et les exports WAV / FLAC / MP3.

Pour régénérer la vidéo : Python avec Pillow et NumPy, ainsi que FFmpeg sur le `PATH`, puis `python render_pitch.py` depuis ce dossier.
