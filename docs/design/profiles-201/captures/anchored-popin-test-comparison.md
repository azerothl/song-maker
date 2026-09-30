# Comparaison tests AnchoredPopin / export (#191, #196)

Commande (identique sur `main` @ `3c7c68f52eeb62b51b47b96ba5b927d76f49f5ee` et sur la branche PR) :

```bash
node --import tsx --test src/dev/anchoredPopinFooter.behavior.test.ts src/components/exportSeparationA11y.test.ts
```

## `main` @ `3c7c68f52eeb62b51b47b96ba5b927d76f49f5ee`

```
# tests 16
# suites 3
# pass 16
# fail 0
# cancelled 0
# skipped 0
# duration_ms ~16368
```

Suites :
- `Dialogues séparation / export a11y (#187 / #191)` — 12 tests, tous **ok** (dont « repositionne AnchoredPopin au resize contenu (B1) », « comportement pied export », harness B1).
- `AnchoredPopin — pied export (B1, #191 / #196)` — 3 tests, tous **ok** (scénario Alphonse / ancre 4–16 pistes / boutons ≥ 44 px).
- `AnchoredPopin — séparation reco (overlap déclencheur, #196)` — 1 test, **ok**.

## Branche `cursor/profiles-hobby-commercial-7f1a` (après corrections revue)

```
# tests 16
# suites 3
# pass 16
# fail 0
# cancelled 0
# skipped 0
# duration_ms ~16613
```

Mêmes noms de suites et sous-tests, **aucune régression** sur ces 16 tests (les 4 scénarios Playwright lourds du pied export / overlap sont inclus dans les suites ci-dessus).

`pnpm test` complet sur la branche : **251/251 pass**.
