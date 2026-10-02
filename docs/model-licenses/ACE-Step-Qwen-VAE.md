# ACE-Step — composants Qwen / VAE (revue #209)

Revue datée du **2 octobre 2026**. Complète la fiche [ACE-Step-1.5-Turbo-BF16.md](./ACE-Step-1.5-Turbo-BF16.md). Badge produit inchangé : **« Disponible avec réserve »**. Cette note n’est pas un avis juridique. Elle ne dit pas que l’usage est sûr, garanti, ou libre de droits.

Song Maker ne livre pas le GGUF dans l’installeur. L’utilisateur demande le téléchargement (~9,4 Gio) après un avertissement. Le fichier chargé est la conversion audio.cpp épinglée (`audio-cpp/audio.cpp-gguf`, révision `7bf52723f5a95b6cec53ea905fd10eca1c8b942e`).

## Composition déclarée du paquet GGUF

D’après la documentation audio.cpp v0.8.2 et la commande de conversion publiée, un paquet ACE-Step Turbo BF16 regroupe notamment :

| Rôle dans le GGUF | Source déclarée | Révision examinée |
|---|---|---|
| Encodeur de texte | `Qwen/Qwen3-Embedding-0.6B` (`text_encoder_weights`) | `97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3` |
| Planificateur LM | `acestep-5Hz-lm-1.7B`, pré-entraîné depuis `Qwen/Qwen3-1.7B` | LM amont : `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` |
| VAE | `ACE-Step/Ace-Step1.5` dossier `vae/` | Originale : `19671f406d603126926c1b7e2adc169acbcade22` |
| DiT Turbo | poids ACE-Step turbo (hors périmètre Qwen/VAE de cette note) | même révision d’origine |

Ces rôles viennent de la documentation et des chemins de conversion. **Le contenu binaire exact du GGUF épinglé n’a pas été décomposé ni hashé composant par composant** dans Song Maker.

## Ce qui est connu (2 octobre 2026)

### Qwen3-Embedding-0.6B

- Carte Hugging Face : `license: apache-2.0` à la révision `97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3`.
- Aucun fichier `LICENSE` ni `NOTICE` dans cette révision (seul le frontmatter README porte la licence).
- Pas de redistribution séparée des poids Embedding par Song Maker : ils ne circulent, le cas échéant, qu’à l’intérieur du GGUF opt-in.

### Qwen3-1.7B (base du LM 5 Hz)

- Carte Hugging Face : `license: apache-2.0` à la révision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`.
- Fichier `LICENSE` présent : texte Apache-2.0 avec mention `Copyright 2024 Alibaba Cloud`.
- Copie hors ligne dans ce dépôt : [Qwen3-1.7B-LICENSE.txt](./Qwen3-1.7B-LICENSE.txt) (SHA-256 `832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e`), alignée sur ce blob amont.
- La carte ACE-Step présente `acestep-5Hz-lm-1.7B` comme pré-entraîné depuis Qwen3-1.7B (SFT/RL, etc.) : ce n’est **pas** une copie bit-à-bit du checkpoint Qwen public. Les obligations Apache-2.0 (§4) pour une œuvre dérivée éventuelle restent à assumer par quiconque redistribue ; Song Maker joint le texte Apache du LM amont et l’avertissement d’acceptation, sans prétendre que cela épuise les obligations.

### VAE (`vae/`)

- Dossier d’origine examiné : `config.json` et `diffusion_pytorch_model.safetensors` (~337 Mo), sans `LICENSE`, `NOTICE` ni README propres.
- Aucune licence séparée trouvée pour le VAE. La seule indication de licence au niveau du dépôt parent est la carte `license: mit` d’`ACE-Step/Ace-Step1.5`, **sans fichier LICENSE/NOTICE** dans ce dépôt HF.
- Provenance amont du VAE (jeu de données, réutilisation d’un autre VAE, etc.) **non documentée** dans les sources consultées.

### Incohérence d’en-têtes ACE-Step (rappel)

Les fichiers `modeling_acestep_v15_*.py` portent des en-têtes Apache-2.0, alors que la carte HF et le LICENSE GitHub d’ACE-Step disent MIT. Les deux licences sont permissives ; l’incohérence est citée, pas tranchée ici.

## Ce qui reste non vérifié

- Composition et hash des tenseurs Qwen / VAE / DiT **à l’intérieur** du GGUF `ace-step-1.5-turbo-bf16.gguf` (seul le fichier entier est épinglé : taille + SHA-256).
- Correspondance bit-à-bit entre les poids d’origine et la conversion audio.cpp.
- Provenance et autorisations des ~27 millions d’échantillons d’entraînement annoncés.
- Conditions d’usage liées à Gemini 2.5 Pro pour l’annotation annoncée.
- Texte OpenRAIL-M du LoRA optionnel `chinese-new-year` (non chargé par l’intégration Song Maker actuelle).
- Droits sur les sorties audio ; la carte ACE-Step affirme un usage commercial possible, **non vérifié** par Song Maker.
- Chaîne complète NOTICE / attributions pour une redistribution Apache-2.0 des poids dérivés de Qwen (le dépôt ACE-Step HF ne fournit ni LICENSE ni NOTICE pour ces composants).

## Badge et libellé produit

Inchangés, conformément au libellé convenu (Pascal) :

> Licence des poids : MIT selon la carte du modèle d'origine ; la conversion distribuée par audio.cpp déclare "other" et renvoie à l'original ; sortie non vérifiée.

Statut fiche licences : **Disponible avec réserve**. Jamais « sûr », « garanti » ni « libre de droits ».

## Sources examinées

- [Documentation ACE-Step audio.cpp v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/ace_step.md)
- [Carte ACE-Step 1.5, rév. `19671f4`](https://huggingface.co/ACE-Step/Ace-Step1.5/blob/19671f406d603126926c1b7e2adc169acbcade22/README.md)
- [Conversion GGUF, rév. `7bf5272`](https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/7bf52723f5a95b6cec53ea905fd10eca1c8b942e)
- [Qwen3-Embedding-0.6B, rév. `97b0c61`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/tree/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3)
- [Qwen3-1.7B + LICENSE, rév. `70d244c`](https://huggingface.co/Qwen/Qwen3-1.7B/tree/70d244cc86ccca08cf5af4e1e306ecf908b1ad5e)
- [Dossier VAE d’origine](https://huggingface.co/ACE-Step/Ace-Step1.5/tree/19671f406d603126926c1b7e2adc169acbcade22/vae)
- [Licence code ACE-Step (GitHub)](https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE)
