## Constat

Sous Windows, `npm run tauri dev` laisse Vite n’écouter que sur IPv6 :

```text
TCP    [::1]:1420             [::]:0                 LISTENING
```

Vérifications locales (2026-10-02, branche `main`) :

| URL | Résultat |
|---|---|
| `http://127.0.0.1:1420/` | connexion refusée |
| `http://localhost:1420/` | 200 |
| `http://[::1]:1420/` | 200 |

`vite.config.ts` utilise `server.host: host || false` (localhost). Avec Vite 6.4.3, ça se traduit par un bind **`[::1]` uniquement**, pas dual-stack `0.0.0.0` / `127.0.0.1`.

`tauri.conf.json` pointe `devUrl` sur `http://localhost:1420`. Selon la résolution `localhost` (IPv4 vs IPv6) du processus WebView2 / des outils, la fenêtre Tauri peut donc joindre Vite… ou échouer.

## Impact

- La fenêtre Song Maker peut rester ouverte alors que le front n’est pas joignable en IPv4.
- Les sondes / scripts qui appellent `127.0.0.1:1420` concluent à tort que Vite est mort.
- Symptôme observé côté UI : page blanche / contenu illisible (en-têtes HTTP bruts + octets binaires affichés comme texte) alors que `song-maker.exe` répond encore (`MainWindowTitle = Song Maker`).

Capture de la fenêtre au moment du diagnostic : `bench/tauri-window-probe.png` (bandeau de texte brut `HTTP/1.1 200 OK`, `Content-Type: text/javascript`, corps binaire, fond blanc).

## Attendu

En `tauri dev` sous Windows, Vite doit être joignable de façon fiable pour WebView2 **et** pour `127.0.0.1` (bind dual-stack ou `host: true` / `0.0.0.0` documenté), ou `devUrl` doit être aligné explicitement sur l’adresse réellement écoutée.

## Pistes

- Forcer `server.host` / `server.dns` pour dual-stack en dev Tauri.
- Ou documenter / fixer `devUrl` sur `http://[::1]:1420` (moins portable).
- Faire échouer clairement le démarrage si `devUrl` n’est pas joignable au lieu d’afficher une WebView corrompue.
