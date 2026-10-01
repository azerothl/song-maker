# ACE-Step 1.5 Turbo BF16

Vérifié le 1er octobre 2026 pour l'intégration facultative de l'issue #209. Song Maker conserve YuE2 comme moteur par défaut. Sur l'écoute comparative de deux extraits de 20 secondes, l'utilisateur a préféré YuE2 au résultat ACE-Step Q8, puis au résultat ACE-Step BF16. Cette préférence décrit cette écoute, pas une mesure générale de qualité.

## Fichier et exécution

- Runtime : `audio.cpp` v0.8.2, commit `4d88768fbcae4e6eb3352c6ab1422dabb7d90b58`.
- Conversion épinglée : `audio-cpp/audio.cpp-gguf`, révision `7bf52723f5a95b6cec53ea905fd10eca1c8b942e`.
- Modèle d'origine indiqué par la conversion : `ACE-Step/Ace-Step1.5`, révision `19671f406d603126926c1b7e2adc169acbcade22`.
- GGUF Turbo BF16 : `ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-bf16.gguf`, 10 090 398 272 octets, SHA-256 `93974239a29a1a821b3cc1b1ca7e1c6229b1a900a0e44a1a9770bb2271d2be5f`.
- Une requête réelle `POST /v1/tasks/run` sur le serveur audio.cpp local a produit un WAV PCM16 de 20,000 s, stéréo, 48 kHz (3 840 044 octets). Cela vérifie l'API et le décodage de sa sortie ; l'intégration desktop et l'écoute subjective restent des vérifications distinctes.
- Le modèle n'est pas inclus à l'installation. L'utilisateur demande le téléchargement (environ 9,4 Gio) et les octets sont vérifiés par taille et SHA-256. Un seul moteur audio.cpp est chargé à la fois.

## Licence et provenance : non résolues

La carte du modèle original affiche `license: mit`, sans fichier `LICENSE` ou `NOTICE` trouvé dans ce dépôt. La carte de la conversion GGUF affiche `license: other`; aucun fichier `LICENSE` ou `NOTICE` n'a été trouvé dans la révision épinglée. Les sources ACE-Step contiennent également des en-têtes Apache-2.0 pour certains composants. Ces indications ne déterminent pas à elles seules la licence de ce GGUF ni les droits sur une sortie.

La composition complète du GGUF, les licences et obligations transitives (dont les composants Qwen), la provenance et les autorisations des données d'entraînement, les annotations Gemini annoncées, le LoRA OpenRAIL-M et les droits relatifs aux sorties restent à vérifier. Le badge « Disponible avec réserve » et l'avertissement à accepter décrivent cette incertitude ; ils ne garantissent aucun droit commercial. Aucun tag ni release ne découle de cette intégration.

Sources primaires :

- [Documentation ACE-Step d'audio.cpp v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/ace_step.md)
- [Carte ACE-Step 1.5 originale](https://huggingface.co/ACE-Step/Ace-Step1.5)
- [Conversion audio.cpp-gguf épinglée](https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/7bf52723f5a95b6cec53ea905fd10eca1c8b942e)
- [Licence du code ACE-Step](https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE)
- [Fiche Qwen3-Embedding-0.6B, révision examinée](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/tree/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3)
- [Fiche Qwen3-1.7B, révision examinée](https://huggingface.co/Qwen/Qwen3-1.7B/tree/70d244cc86ccca08cf5af4e1e306ecf908b1ad5e)
- [Dossier VAE de l'artefact original](https://huggingface.co/ACE-Step/Ace-Step1.5/tree/19671f406d603126926c1b7e2adc169acbcade22/vae)
