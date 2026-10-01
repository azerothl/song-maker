# Captures React — boutons primaires

Application React réelle (Vite + mock Tauri), 1280×720. Exécution du 1er octobre 2026 après passage à la vue Production commune. Les 15 scénarios couvrent 22 usages de l'inventaire ; 17 usages restent non vérifiés. Le scénario de contrôle `regeneration-gate-blocked` est un harnais volontairement en échec, exclu du résultat produit.

## Régénérer

```powershell
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Le serveur utilise le démarrage Vite partagé et le Chromium Playwright déjà installé. Les panneaux avancés sont ouverts pour mesurer leurs boutons dans la vue commune.

## Méthode

- Focus : Tab et souris hors cible ; pixels cyan requis dans le clip bouton (14 px de marge, 22 px en focus).
- Distinction normal, survol et focus : SHA-256 différents sur le clip bouton.
- `metrics.json` contient les mesures DOM dans `screens`. `manualReviewAlphonse` est vide : aucune nouvelle revue manuelle n'a été effectuée. Les anciennes valeurs ne sont pas attribuées aux nouvelles images.
- Exporter I3 : `production-exporter-bar-focus-i3-clip.png`, bouton du bandeau master, focus Tab et cyan requis.
- Désactivation réelle : génération occupée, export occupé, zéro piste sélectionnée dans la popin Exporter (`aria-disabled`). D'autres états désactivés sont forcés par le harnais et identifiés dans les mesures.

## Limites

Ces captures ne constituent pas une utilisation native Tauri. WebKitGTK, lecteur d'écran, `forced-colors`, les 17 usages restants et les interactions audio ne sont pas vérifiés par ce script. L'inventaire conserve ces limites. Le rapport `../contrastes.md` est généré à partir des nouvelles mesures.