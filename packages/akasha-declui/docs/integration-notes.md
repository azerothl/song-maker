# Intégration Akasha / DeclUI — notes (§18.5 / #66)

## Contexte

Le premier build est **desktop local uniquement** (Tauri + `audiocpp_server` + dossiers).  
Akasha, DeclUI, le catalogue de packs et une API musique distincte du TTS sont la **phase 4**.

Le piano roll n’entre pas dans ce contrat d’hôte : il appartient à la phase 2.  
**SheetSage2** n’est pas dans l’installeur et n’est pas branché ici.

## Capacités réellement supportées

| Capacité | Desktop local | Hôte Akasha connecté |
|---|---|---|
| `generate_yue2` | oui (chemin Tauri) | invocation via `/v1/host/invoke` si l’hôte l’expose |
| `separate_stems` | oui | idem |
| `export_mix` | oui | idem |
| `list_projects` | oui | idem |
| `apply_style_lora` | oui (catalogue + settings) | idem |
| TTS | **non** — API musique distincte | doit rester séparée côté hôte |

Sans hôte joignable : le mode est **`unavailable`** (message clair), jamais un faux « activé / connecté ».

## Mode hôte (Paramètres)

1. Défaut : **desktop** — génération phase 1 inchangée, **zéro** appel réseau.
2. Opt-in + URL (`SONG_MAKER_AKASHA_HOST_URL` ou champ Paramètres) → `enableHostMode({ hostOptIn: true, hostUrl })` appelle `GET /v1/host/discover`.
3. Succès → mode **`connected`** ; échec / URL absente → **`unavailable`**.
4. `disableHostMode()` revient au desktop. `resumeHostMode()` redispatche la découverte.
5. Aucun processus distant sans opt-in explicite.

```ts
import { getSharedAkashaHostBridge } from "@song-maker/akasha-declui";

const bridge = getSharedAkashaHostBridge();
const result = await bridge.enableHostMode({
  hostOptIn: true,
  hostUrl: "https://akasha.example",
});
// result.mode → "connected" | "unavailable" | "desktop"
```

## Protocole hôte

Voir [`host-protocol.md`](./host-protocol.md) pour les schémas, permissions et erreurs typées.

## Surfaces DeclUI

| Surface DeclUI | Phase propriétaire |
|---|---|
| `library`, `song_form`, `mix_transport`, `licenses` | 1 (déjà dans le desktop) |
| `agent_panel` | 4 |

## Catalogue de packs

Réutilise `@song-maker/lora-packs` (CC BY-NC, hors installeur premier build).  
Les packs de **style** (ex. chanson française) sont listés dans Paramètres → catalogue phase 4.

## SDK

It n’existe pas de SDK Akasha/DeclUI publié pour Song Maker dans ce dépôt.  
L’intégration passe par le protocole HTTP ci-dessus.

## Hôte embarqué (#343)

Le binaire desktop peut démarrer un **processus HTTP local** (`127.0.0.1`, port éphémère) qui implémente `GET /v1/host/discover` et `POST /v1/host/invoke`.

| Invocation | Comportement |
|---|---|
| `list_projects` | Liste réelle de la bibliothèque locale |
| `generate_yue2`, `separate_stems`, `export_mix`, `apply_style_lora` | Erreur typée `capability_denied` — ces actions restent le chemin Tauri desktop, pas un relais |
| autre | `capability_unknown` |

Sans démarrer cet hôte et sans URL externe joignable, le mode reste **`unavailable`** après opt-in, jamais un faux « connecté ». Aucun bind hors loopback. L’opt-in Paramètres est toujours requis avant `enableHostMode`.
