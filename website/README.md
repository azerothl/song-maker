# Song Maker — site marketing

Package Next.js (App Router) bilingue **FR / EN** pour présenter Song Maker : landing animée, frames UI reconstruites, exemples audio, documentation MDX.

## Lancer en local

Depuis la racine du monorepo :

```bash
pnpm install
pnpm --filter website dev
```

Ouvrir [http://localhost:3000/fr](http://localhost:3000/fr) (redirection `/` → `/fr`).

```bash
pnpm --filter website build
pnpm --filter website start
```

## Déploiement

### Vercel (recommandé, authentifié)

Connecter le repo avec **Root Directory = `website`**, install `pnpm install`, build `pnpm build`.  
Config Next : `website/vercel.json`.

Avec un token CLI :

```bash
# depuis website/, compte Vercel lié
vercel link
vercel --prod
```

### Export statique

```bash
OUTPUT=export pnpm --filter website build
# fichiers dans website/out/
# cleanUrls : copier vercel.static.json → out/vercel.json avant upload
cp vercel.static.json out/vercel.json
vercel deploy out --prod   # ou --temporary (anonyme, expire ~60 min)
```

## Exemples audio — honnêteté

Les fichiers sous `public/examples/*.wav` sont des **lits synthétiques courts** générés en Python (sinusoïdes / motifs). Ce **ne sont pas** des rendus YuE2 réels. Ils servent à démontrer le player Web Audio et les waveforms. Chaque piste est étiquetée « Démo synthétique » / « Synthetic demo » dans l’UI.

## Direction visuelle

Studio sombre, lumière console ambre/chaude, typo Fraunces + Source Sans 3 + IBM Plex Mono — alignée sur l’app, sans look violet/indigo générique ni cream+terracotta.

## Structure

- `app/[locale]/` — landing + docs
- `components/frames/` — reconstitutions marketing (splash, library, editor, piano roll, compare, settings)
- `content/docs/{fr,en}/` — MDX bilingue
- `messages/{fr,en}.json` — i18n UI (`next-intl`)
- `styles/tokens.css` — design tokens
