# Intégration Akasha / DeclUI — notes (§18.5)

## Contexte

Le premier build est **desktop local uniquement** (Tauri + `audiocpp_server` + dossiers).  
Akasha, DeclUI, le catalogue de packs et une API musique distincte du TTS sont la **phase 4**.

Le piano roll n’entre pas dans ce contrat d’hôte : il appartient à la phase 2.

## Surfaces prévues

| Surface DeclUI | Phase propriétaire |
|---|---|
| `library`, `song_form`, `mix_transport`, `licenses` | 1 (déjà dans le desktop) |
| `agent_panel` | 4 |

## API musique

Descripteur `song-maker-music` (`kind: "music"`), capacités : génération YuE2, séparation, export mix, liste projets, application LoRA de style.

Ce n’est **pas** une API TTS. Même hôte éventuel → surface séparée.

## Catalogue de packs

Réutilise `@song-maker/lora-packs` (CC BY-NC, hors installeur premier build).  
Pas de poids embarqués dans ce paquet.

## Branchement

1. Livrer phases 1–2 en desktop.
2. Exposer `createAkashaHostBridge().describe()` pour découverte.
3. Remplacer `register()` stub par le SDK Akasha réel quand l’hôte existe.

Voir aussi le README du paquet et `AKASHA_HOST_REGISTRATION` dans le code.
