# Automation de volume : export natif mesuré — 1 octobre 2026

Refs #229. Complément de preuve, sans fermeture du ticket.

## Parcours réellement effectué

Dans la fenêtre Tauri, morceau synthétique Audit Production 2026-10-01 : trois clips (durée totale 22 secondes), aucun effet, gain de piste/master à 0. Un point Volume à 0 ms a été réglé à -6 dB, sauvegardé dans mix-v001.production.json, puis exporté par Exporter en WAV stéréo PCM 24 bits / 48 kHz. Le même point a ensuite été réglé à 0 dB, sauvegardé, puis le même mix a été exporté à nouveau. Aucun clip, panoramique ou gain n'a été changé entre les deux exports.

## Mesures

Les deux fichiers contiennent 1 056 000 frames, soit 22 secondes. Rapport RMS mesuré : 0,5011872308679344 ; attendu pour -6 dB : 0,5011872336272722. Erreur maximale par échantillon après multiplication du fichier 0 dB par le gain attendu : 8,9284e-8, inférieure à un pas de quantification PCM 24 bits (1,1921e-7). Les SHA256 des deux WAV sont consignés dans metrics.json.

Cette preuve vérifie le trajet interface → overlay sauvegardé → rendu exporté pour une automation constante de volume. Les WAV restent locaux dans le dossier temporaire song-production-export-audit et dans les exports du morceau synthétique. Aucun audio personnel publié.

## Limites

Pas d'écoute subjective effectuée. Cette mesure ne valide pas la courbe variable, le panoramique, les effets avancés, les envois ou le sidechain. Les tests de comportement existants couvrent séparément l'édition, les bornes, le clavier et la restauration d'une courbe. Les critères complets de #229 restent à traiter. Le point du morceau synthétique reste à 0 dB après l'audit.
