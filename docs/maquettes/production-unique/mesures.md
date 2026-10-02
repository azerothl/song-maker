# Mesures — captures maquette Production unique

Légende : **[M]** mesuré sur les PNG versionnés · **[C]** calculé · **[S]** supposé · **[L]** lu dans le code produit.

## Empreintes

- Fichier machine : [`metrics.json`](./metrics.json)
- SHA-256 de `metrics.json` : `4b337af1916e8414690740b6dc968a823cf6f475736294c739b1e501bfe580e9`
- Scènes PNG présentes : **21 / 33** attendues (critère A)
- Planches `emplacements/` : **12**
- Toutes les empreintes PNG (scènes + planches) sont **distinctes** ([C] `sha256sum`)

### Scènes (sha256)

| Fichier | sha256 |
|---------|--------|
| `01-vue-par-defaut-1280x720.png` | `c9e563a151d9b2b6664212ff7c483557bb009c8d2868cf2d9259ee086a9cb126` |
| `02-outil-decouper-1280x720.png` | `74c8cdb12416e5a17f429feea115c972f0eac8f165d6df4ff5176ef62635a18b` |
| `03-popover-reglages-piste-1280x720.png` | `81a28e6406ff71bad071d847b8e28a46ba290b32f32d2d9f5f9aaf296c28d212` |
| `05-automation-depliee-1280x720.png` | `72f3a469ceb0d76f8b1b491e51621e0d4e52ecc893dcace45f6b6fb3ac525361` |
| `06-reglages-du-mix-1280x720.png` | `20f02710ae6e25378e0c0b41b54cf2c66054b39e3f8067504550b08d1401b1da` |
| `07b-640-replie-640x720.png` | `e296bfe1eb82717704c5dbcb28da0652d1e7eac75127cea4233febda9bec9cfc` |
| `07c-640-reglages-du-mix-640x720.png` | `08d8eb7d3791cfc0df14a54c6e6b3cced32c87fcc1f3c67e9feb9e0412325437` |
| `07d-640-popover-piste-640x720.png` | `cfb297f7073ce96a912576fa9f0ee2ac96a3fade4f7b780cdf18d8210909a64a` |
| `08-clavier-focus-palette-1280x720.png` | `35b649385ccf3d32357d18e1979ffbd8c7fbaa7d8b6a893c70633b138e703e12` |
| `09-gain-pan-clavier-focus-1280x720.png` | `b4fa8d3a4a2ec8c729effdf595e30f73ae99786a42bdcd9db308d5807459f2a8` |
| `10-saisie-numerique-pan-1280x720.png` | `9b95bd7592b35051e78a54b6987a17fc605b938fe34839eaf380936d152ba5e1` |
| `11-640-saisie-gain-2-lignes-640x720.png` | `d1e86457b49264e62a2fb927225ead406500b89f39dd8d97aae5c36a2fb513b6` |
| `12-ajout-menu-ouvert-1280x720.png` | `3dad5341049ab360060d597b34ba6473090bafbb8d56d69320db5d1677b13faf` |
| `16-ajout-menu-ouvert-640x720.png` | `6e7b51621d7a90522ba0433653cccfc0fcb5d9e36c2a37e42f309d7fa79cc50b` |
| `22-egaliseur-popover-ouvert-1280x720.png` | `365f2703b4bef0f061df5e4272207772f074f2c9c4db1cf036ed593f9c377904` |
| `24-640-egaliseur-popover-ouvert-640x720.png` | `bd29041df7b45f0835e5a3cd839a20c3b06dccff28bc0d8f7af25333a95ea055` |
| `26-automation-popover-1280x720.png` | `f12a8bf04cfd066c9812c9804b53739b17bde6493af3a084aee1b8d7f038b364` |
| `27-640-automation-popover-640x720.png` | `1e3f9d022dd57adc2478886da7280b5ad05a75918654dac3701f18a5dba66579` |
| `28-separer-avis-licence-ouvert-1280x720.png` | `c880e5219c9fbd2e0a349d961648d422784849ca8869808f5e6f223e30760d23` |
| `30-640-separer-avis-licence-ouvert-640x720.png` | `2f7f3ab483ae1b5aeb335500eff7f79786f03b26e8558aa874a6c8d2aea35fb5` |
| `33-en-outil-split-1280x720.png` | `a4a5969d077e75748f38e820f2b21cce1c9e91ccc2756be817e87253fbcdb2fe` |

Régénération : `sha256sum docs/maquettes/production-unique/*.png docs/maquettes/production-unique/emplacements/*.png`.

## Couverture critère A (partielle)

Présentes : vue par défaut, Découper, popover piste, automation dépliée + popover, Réglages du mix, 640 replié / réglages / popover, focus clavier, saisie gain/pan, menu ajout 1280+640, EQ 1280+640, avis séparation 1280+640, Split EN.

**Manquantes** (HTML + captures absents du dépôt) : numéros 04, 07, 13–15, 17–21, 23, 25, 29, 31–32 (et scénarios associés du critère A non couverts par un PNG dédié).

## Contrastes / cibles / tabulation (maquette HTML)

Les mesures de contraste, cibles 32/44 px, débordements et ordre de tabulation du critère C / G dépendent du **pack HTML interactif** (`index.html`, scripts de mesure). **Non régénérées ici** : HTML hors dépôt.

Dernier relevé cité dans #224 (corps) : contraste texte min **6,47:1** [C] — **non rejoué** sur cette livraison docs.

## Coût gain/pan permanents

Cité dans #224 : hauteur de piste inchangée (44 px @1280, 92 px @640), en-tête 264→320 px. **Non remesuré** sans HTML ; Loïc a vu la direction silhouette (commentaire #224, 2026-10-01).

## 640 px — règle de repli

Phrase produit proposée [S]/[L] : à largeur de fenêtre ≤ **900 px** (`src/App.css` media query), les contrôles secondaires passent dans « Réglages du mix ». À valider Pascal.
