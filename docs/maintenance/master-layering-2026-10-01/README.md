# Bandeau master pendant le défilement — 1 octobre 2026

Le bandeau master avait un niveau d'empilement 4, inférieur à la règle (5) et égal au tempo (4). Au défilement extérieur de Production, les zones recouvraient ses contrôles, même sans popover ouvert (#289).

Le bandeau reste désormais au niveau 6 et possède un fond opaque. Les trois zones conservent leur ordre et leur comportement sticky dans la liste interne. Les popovers du master restent au-dessus des zones.

Validation automatisée : 9 tests de comportement passent, dont une exploration du défilement extérieur avec détection des intersections et vérification de l'élément réellement au premier plan à 1280 et 640 px. Le test existant vérifie aussi le popover Exporter et les trois zones sticky dans le défilement interne. Compilation réussie.

Validation native : fenêtre Tauri 1282 × 832, morceau synthétique Audit Production 2026-10-01, automation ouverte, défilement extérieur jusqu'aux champs du point. Le bandeau master et Exporter restent visibles sans texte de tempo peint dessus. Capture `native-after.jpg`. Aucun morceau personnel modifié.

Limites : le défilement extérieur peut naturellement faire passer une zone derrière le master ; cette correction protège le master, sans restructurer les deux conteneurs de défilement. Pas de capture native à 640 px, pas de lecteur d'écran ni de tactile réel contrôlé dans ce lot. Les critères plus larges de #227 restent ouverts.
