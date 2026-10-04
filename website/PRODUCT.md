# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience, inferred from the existing product specification and approved site direction: songwriters and musicians who want to turn a style and lyrics into a song on their own computer. Secondary audiences named in the repository are beginner producers and content creators.

## Product Purpose

Song Maker is a local desktop music-making application. A user enters a style and lyrics, generates a stereo song with YuE2 through audio.cpp, separates it into stems with HTDemucs, adjusts the mix, and exports audio.

## Long-Term Product Vision

Song Maker aims to grow into a multitrack music production workspace assisted by generative AI. Cubase is a reference for the broad DAW workflow, not a promise of feature parity or compatibility with its plugins.

The same project should support two entry paths:

- **Simple:** describe a style and provide lyrics; generate a song with YuE2, then edit the arrangement and tracks, mix, and export.
- **Advanced:** bring an existing score, MIDI, audio tracks, or stems; use AI to create complementary instrumental parts and help work on the mix.

AI-created tracks and mix changes should remain editable and reversible, with imported source material preserved. As a long-term goal, the project also intends to create a Song Maker audio transformation model, complementary to YuE2, for working with audio in existing projects. Its architecture and exact transformations are undecided.

This is target direction, not a claim about current capabilities. The integrated YuE2 engine does not accept reference audio (`audio_input` is refused, not faked). Production can add a metadata-conditioned instrumental part with YuE2, or call an opt-in ACE-Step 1.5 **Base Lego** Python sidecar for mix/stems-conditioned add-track. Lego does not promise a dry isolated stem; the custom audio transformation model is not shipped.

## Positioning

Song generation and basic production happen on the user's own compatible computer with local model files. Account creation and a required cloud generation service are not part of the core workflow.

## Operating Context

The desktop application targets Windows and Linux with an NVIDIA CUDA GPU. Users install pinned binaries and model weights, create a song project, generate a take, then listen, separate stems, mix, and export. The website serves French- and English-speaking visitors considering or installing the desktop application.

## Capabilities and Constraints

- The root README is the source of truth for what ships on `main`. The desktop app includes local YuE2 generation (style + lyrics, or instrumental mode with optional empty lyrics), MIDI/score/ABC editing, SheetSage2 opt-in reprise, sequential candidates (N successive local calls), clip editing, stem separation (with separation history), mix/production tools, and WAV / FLAC / MP3 export. Desktop UI is French-only; the marketing site is FR/EN. Do not present deferred items (VST3, YuE2 waveform `audio_input`, UniverSR, SF2 banks) as available. Mix/stems add-track via ACE-Step 1.5 Base Lego is opt-in (Python REST sidecar, not the Turbo GGUF XOR). Lego may return a fused mix, not a dry stem. An embedded DeclUI loopback host is opt-in from Settings; YuE2 generation stays desktop. The global `generation_engine` XOR stays YuE2 by default.
- Prefer the current README over historical “phase N incomplete” wording in the product specification when writing site copy.
- The standard HTDemucs path produces vocals, drums, bass, and other. An optional experimental ONNX 6-stem path also estimates guitar and piano; those estimates can leak, especially piano. Do not imply the 6-stem path is the default or its extra stems are cleanly isolated. BS-RoFormer is an optional second separator (opt-in GGUF download) that returns vocals + instrumental only; HTDemucs remains the default.
- Remote generation and Akasha host discovery are **opt-in**. With remote disabled, the client makes no network request. A reference worker (`packages/remote-worker-server`) implements the HTTP contract; do not present remote as the default path.
- YuE2 does not consume reference audio (`audio_input`) and does not guarantee the requested duration, language, tempo, or key. A style is required. Lyrics are required unless instrumental mode is enabled.
- The official Python YuE2 runtime is intentionally absent: not installed, not a fallback if audio.cpp fails, and not offered as an engine in Settings.
- The in-house Song Maker generation model is not available in the app (`houseModelRuntime: unavailable`). Training recipes live under `scripts/model-training/`; do not present them as a generate button.
- YuE2 / GGUF model weights are distributed under CC BY-NC 4.0. The site must not promise commercial use of those weights or outputs. ACE-Step Base Lego is MIT on the card (Hobby and Commercial possible for ACE-Step); layering it on a YuE2 mix does not clear the mix’s NC terms.

## Evidence on Hand

- The repository contains no verified, real YuE2-generated audio excerpt for the marketing site. Existing audio samples are synthetic demos for exercising the web player.
- Existing interface gallery images are hand-reconstructed marketing frames, not screenshots of the running desktop application.
- No customer testimonials, adoption numbers, or commercial claims are present. Do not invent them.

## Product Principles

- Be explicit about what runs locally and what hardware it needs.
- Demonstrate only workflows that exist in the current application.
- Distinguish real generated audio and real application captures from synthetic demonstrations and design previews.
- State current defaults without turning a test result into a permanent product limit.
- Explain model and licensing limits in plain language.

## Approved Website Direction

- The approved homepage composition is option A, “Des paroles aux pistes”: an editorial split hero with an interactive example from a real generation, followed by the creative steps, actual app capabilities, setup requirements, and practical questions.
- The six-stem example uses the optional experimental ONNX path. Label guitar and piano as estimates and note possible leakage, especially on piano. Explain that the standard path returns four tracks, without presenting four as a hard product limit.
- The homepage must not use reconstructed desktop screens or synthetic audio samples as if they were real product evidence.

## Accessibility & Inclusion

The marketing site supports French and English and must remain usable with reduced motion, keyboard navigation, and mobile viewports.
