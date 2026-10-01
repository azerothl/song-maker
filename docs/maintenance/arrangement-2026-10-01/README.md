# Marqueurs et tempo — 1 octobre 2026

## Bugs reproduits

- #276 : sur une règle de 30 000 ms, saisir 60 000 ms déplaçait le marqueur hors de la durée et agrandissait la règle.
- #277 : après application de 150 BPM à 8 000 ms, la saisie revenait au premier tempo (120 BPM). Appliquer à nouveau modifiait donc involontairement cet événement.

Les tests de reproduction échouaient avant correction. Les marqueurs et les nouveaux événements de tempo sont désormais bornés à la règle. Le tempo appliqué reste dans la saisie ; les changements de projet réinitialisent cette saisie.

## Vérification

Trois tests de comportement utilisent le vrai composant React ClipTimeline dans Chromium : borne de marqueur sans modification des pistes, ajout et suppression de tempo avec conservation de la saisie, déplacement au clavier et suppression avec retour du focus. Les flèches avec Maj déplacent de 50 ms ; Début et Fin atteignent les bornes. Les actions produisent un message accessible traduit.

La suite complète passe : 419 tests, aucune erreur. La compilation de production passe. Les captures FR/EN à 1280 et 640 px proviennent de cette même fixture React ; leurs mesures et empreintes figurent dans `captures-react/metrics.json`. Elles vérifient la conservation des pistes et de la durée. Elles ne constituent pas une validation native Tauri.

## Portée restante

Après fusion de #278, le parcours a aussi été rejoué dans Tauri Windows, sur un nouveau projet « Audit Production 2026-10-01 » et un WAV synthétique importé de 12 s : ajout du marqueur, désactivation du déplacement des clips, saisie 60 000 ms ramenée à 30 000 ms. Le JSON sauvegardé contient le marqueur à 30 000 ms et le clip inchangé (début 0, offset 0, durée 12 000 ms). `native-marker-bounded.jpg` (1282×832) montre le drapeau à la borne. Cette observation ne valide pas encore le tempo natif ni les formats natifs à 640 px.

Ce lot corrige #276 et #277 et contribue à #227. Il ne termine pas #227 : déplacement à la souris, organisation finale de la barre d'arrangement, vérification native et revue exhaustive des fonctions restent à traiter. Il ne démontre pas non plus une traduction exhaustive de toute la page Production.
