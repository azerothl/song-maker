# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience, inferred from the existing product specification and approved site direction: songwriters and musicians who want to turn a style and lyrics into a song on their own computer. Secondary audiences named in the repository are beginner producers and content creators.

## Product Purpose

Song Maker is a local desktop music-making application. A user enters a style and lyrics, generates a stereo song with YuE2 through audio.cpp, separates it into stems with HTDemucs, adjusts the mix, and exports audio.

## Positioning

Song generation and basic production happen on the user's own compatible computer with local model files. Account creation and a required cloud generation service are not part of the core workflow.

## Operating Context

The desktop application targets Windows and Linux with an NVIDIA CUDA GPU. Users install pinned binaries and model weights, create a song project, generate a take, then listen, separate stems, mix, and export. The website serves French- and English-speaking visitors considering or installing the desktop application.

## Capabilities and Constraints

- The current repository README and UI include local YuE2 generation from style and non-empty lyrics, MIDI import and score editing, sequential candidate generation and comparison, clip editing, stem separation, mixing, and WAV / FLAC / MP3 export.
- The product specification still describes some score, candidate, and clip capabilities as later-phase work. Until this version discrepancy is resolved, the site must clearly state which capabilities are available in the current application and must not present roadmap items as shipped.
- The standard HTDemucs path produces vocals, drums, bass, and other. An optional experimental ONNX 6-stem path also estimates guitar and piano; those estimates can leak, especially piano. Do not imply the 6-stem path is the default or its extra stems are cleanly isolated. BS-RoFormer remains a stub, not a ready second separator.
- The remote-worker UI's current probe queues locally and makes no network request. Do not present remote generation as an available workflow.
- YuE2 does not consume reference audio and does not guarantee the requested duration, language, tempo, or key. A style and non-empty lyrics are required for generation.
- YuE2 / GGUF model weights are distributed under CC BY-NC 4.0. The site must not promise commercial use of those weights or outputs.

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
