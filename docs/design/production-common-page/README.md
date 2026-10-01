# Production commune : livraison intermédiaire

Décision utilisateur du 1 octobre 2026 : conserver toutes les fonctions dans la vue commune, réglages avancés repliables, gain/pan visibles, popovers et temps en ms.

La navigation Mix / Clips / Outils est retirée. Les contrôles de mix, la timeline éditable (tempo et marqueurs compris) et le rack avancé partagent une page. Le rack se replie au clavier ; les assistants, effets, routage, sidechain, loudness et export restent accessibles. Aucun stockage de production ni calcul audio ne change.

Mesuré dans Chromium sous Windows : rendu du composant React réel à 1280×720 et 640×720, présence des régions mix/clips, absence de sous-onglets, ouverture/fermeture clavier du rack et maintien du focus, PageDown dans la timeline et déplacement clavier d'un clip, fenêtres non modales et priorité d'Échap. Captures régénérables avec `pnpm exec tsx scripts/capture-production-common.mts` ; les pistes et l'audio sont synthétiques. `captures/metrics.json` contient les coordonnées/hit tests des clips. Aucune preuve native Tauri ni audio de stems réels n'est revendiquée.

Restent ouverts dans #223–#230 : une règle temporelle réellement partagée entre waveforms et clips, la courbe sous chaque piste (la courbe existante reste dans le rack avancé), les gestes de trim/fondu et leurs cibles tactiles à vérifier, les captures natives et la revue finale complète. Cette livraison ne clôt pas ces tickets.