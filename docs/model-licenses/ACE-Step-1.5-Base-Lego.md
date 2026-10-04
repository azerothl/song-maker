# ACE-Step 1.5 Base — mode Lego (sidecar Python)

Sidecar **opt-in** pour [#325](https://github.com/azerothl/song-maker/issues/325) : ajouter une piste depuis le **mix / les stems** du projet ouvert. Ce n’est **pas** le GGUF Turbo `ace-step-1.5-turbo-bf16.gguf` (texte→musique, `task_route: text2music`). YuE2 reste le moteur **Créer**. Le XOR global `generation_engine` n’est pas basculé.

## I/O

- Entrée : WAV source (bounce interne du mix, ou WAV de la prise active) + nom de piste (`bass` / `drums` / `keyboard`) + caption.
- Sortie : WAV importé dans l’arrangement à `start_ms = 0`, **sans** `follow_project_tempo`.
- Honnêteté : la doc amont *« Add a new instrument track »* **n’affirme pas** un stem dry. Song Maker étiquette toujours `outputKind=possibly_fused_mix`.

## GPU / VRAM

- Base : **≥12 Go de VRAM** conseillés (offload CPU possible, lent).
- YuE2 local ~24 Go BF16. File GPU `max_loaded_models = 1` : un graphe à la fois — pas YuE2 et Lego en parallèle.
- Loopback REST style Rbitnet : `127.0.0.1:8002`, `GET /ready`, `POST /v1/lego`.

## Hobby vs Commercial

- Carte [`ACE-Step/acestep-v15-base`](https://huggingface.co/ACE-Step/acestep-v15-base) : **MIT**. Code [ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) MIT. Usage Hobby **et** Commercial d’ACE-Step : possible sous réserve des conditions MIT ; données d’entraînement et droits sur une sortie **non vérifiés**.
- Un stem MIT collé sur un **mix YuE2** (poids **CC BY-NC 4.0**) **n’efface pas** le NC du morceau.
- Profil Commercial : le contrat ACE-Step déjà prévu pour Turbo s’applique aussi avant Lego.

## Pins

- HF : `ACE-Step/acestep-v15-base` (révision `main` — pas un SHA de GGUF).
- Git Python : `git+https://github.com/ace-step/ACE-Step-1.5.git`.
- Mock tests : `SONG_MAKER_ACE_STEP_LEGO_MOCK=1` copie le WAV source (ne fabrique pas d’`audio_input` YuE2).

## Restes

- Tempo / tonalité : suivent l’audio source, pas un champ texte appliqué au clip.
- Inférence réelle : `ACESTEP_API_BASE` vers le REST ACE-Step (`task_type=lego`) ; le paquet `acestep` sans serveur REST n’est pas un repli silencieux.
- Critère d’acceptation #325 (stem **isolé** entendu dans l’arrangement) : **non clos** tant que Lego renvoie un mix fusionné.
