# Intégration Akasha / DeclUI — notes (§18.5)

## Contexte

Le premier build est **desktop local uniquement** (Tauri + `audiocpp_server` + dossiers).  
Akasha, DeclUI, le catalogue de packs et une API musique distincte du TTS sont la **phase 4**.

Le piano roll n’entre pas dans ce contrat d’hôte : il appartient à la phase 2.  
**SheetSage2** n’est pas dans l’installeur et n’est pas branché ici.

## Mode hôte (Paramètres)

L’écran Paramètres expose « Mode hôte (Akasha / DeclUI) » :

1. Défaut : **desktop** — génération phase 1 inchangée, 100 % locale.
2. Opt-in : `getSharedAkashaHostBridge().enableHostMode()` active un **adaptateur local** qui expose `describe()` / `AKASHA_HOST_REGISTRATION` pour découverte.
3. Aucun processus Akasha distant n’est démarré. Aucun socket. Désactiver revient au desktop.

```ts
import { getSharedAkashaHostBridge } from "@song-maker/akasha-declui";

const bridge = getSharedAkashaHostBridge();
const result = await bridge.enableHostMode();
// result.messageFr → statut UI
```

## Surfaces DeclUI

| Surface DeclUI | Phase propriétaire |
|---|---|
| `library`, `song_form`, `mix_transport`, `licenses` | 1 (déjà dans le desktop) |
| `agent_panel` | 4 |

## API musique

Descripteur `song-maker-music` (`kind: "music"`), capacités : génération YuE2, séparation, export mix, liste projets, application LoRA de style.

Ce n’est **pas** une API TTS. Même hôte éventuel → surface séparée.

## Catalogue de packs

Réutilise `@song-maker/lora-packs` (CC BY-NC, hors installeur premier build).  
Les packs de **style** (ex. chanson française) sont listés dans Paramètres → catalogue phase 4.

## Suite éventuelle

Remplacer l’adaptateur local par le SDK Akasha réel quand l’hôte existe, sans changer `MusicApiDescriptor` ni casser le chemin desktop.
