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

Le mini-mixeur de la page d’accueil utilise des extraits réels d’une génération YuE2 et de sa séparation expérimentale en six pistes. Les pistes guitare et piano sont des estimations, avec des fuites possibles. Les fichiers synthétiques `public/examples/*-demo.wav` ne sont pas présentés comme des rendus Song Maker.

## Direction visuelle

Studio sombre, lumière console ambre/chaude, typo Fraunces + Source Sans 3 + IBM Plex Mono — alignée sur l’app, sans look violet/indigo générique ni cream+terracotta.

## Structure

- `app/[locale]/` — landing + docs
- `components/frames/` — reconstitutions marketing (splash, library, editor, piano roll, compare, settings)
- `content/docs/{fr,en}/` — MDX bilingue
- `messages/{fr,en}.json` — i18n UI (`next-intl`)
- `styles/tokens.css` — design tokens
