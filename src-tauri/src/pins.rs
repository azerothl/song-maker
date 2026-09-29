//! Constantes et épingles du contrat v1.0 (premier build).

pub const SCHEMA_PROJECT: &str = "songmaker.project";
pub const SCHEMA_GEN_REQUEST: &str = "songmaker.generation.request";
pub const SCHEMA_GEN_RESULT: &str = "songmaker.generation.result";
pub const SCHEMA_SEPARATION: &str = "songmaker.separation";
pub const SCHEMA_MIX: &str = "songmaker.mix";
pub const SCHEMA_SCORE: &str = "songmaker.score";
pub const SCHEMA_VERSION: u32 = 1;

pub const SAMPLE_RATE: u32 = 48_000;
pub const SEPARATOR_SAMPLE_RATE: u32 = 44_100;
pub const CHANNELS: u16 = 2;
pub const BIT_DEPTH: u16 = 24;

pub const AUDIOCPP_TAG: &str = "v0.8.2";
pub const AUDIOCPP_COMMIT: &str = "4d88768fbcae4e6eb3352c6ab1422dabb7d90b58";

pub const ARCHIVE_WINDOWS: &str = "audio-v0.8.2-bin-windows-x64-cuda12.4.zip";
pub const ARCHIVE_WINDOWS_SHA: &str =
    "6055122c7199897ff21ca6cda9f9207712bd91273d21dc2d137d5fa610c43c86";
pub const ARCHIVE_WINDOWS_CUDART: &str = "audio-v0.8.2-cudart-windows-x64-cuda12.4.zip";
pub const ARCHIVE_WINDOWS_CUDART_SHA: &str =
    "e2a31fb1030423319e686c6ec65da8952b2c095feb8a1e716c2adfbb6c46fac1";
pub const ARCHIVE_LINUX: &str = "audio-v0.8.2-bin-ubuntu-x64-cuda12.8-colab.tar.gz";
pub const ARCHIVE_LINUX_SHA: &str =
    "1190ba46bb45e1acd2ca42edca53074c7935b96de67f3719c8c4943df5fe1b6f";
pub const ARCHIVE_MACOS_ARM64: &str = "audio-v0.8.2-bin-macos-arm64-metal.tar.gz";
pub const ARCHIVE_MACOS_ARM64_SHA: &str =
    "d33db13695fbf3ba73ea85a8b59575b98a66f7b6ff89bbb59599c75b4689f9a5";
pub const ARCHIVE_MACOS_X64: &str = "audio-v0.8.2-bin-macos-x64-metal.tar.gz";
pub const ARCHIVE_MACOS_X64_SHA: &str =
    "6edcf84ea530f782c465fb9b37c7f3c1e8ac1e8ded865a9a59ebacc5140d8b67";

pub fn backend_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "metal"
    } else {
        "cuda"
    }
}

pub const YUE2_REPO: &str = "audio-cpp/Yue2-3B-GGUF";
pub const YUE2_REVISION: &str = "eb116220931de5f373d024d48800338178c7de51";
pub const YUE2_Q8: &str = "yue2-3b-q8_0.gguf";
pub const YUE2_Q8_SHA: &str = "f3a9e3b197bfd05aa4ae6ab2d4b93f6d57c8cc0ea39a4af7d151f58697c7cfb6";
/// Taille exacte du GGUF YuE2 Q8 épinglé (octets).
pub const YUE2_Q8_BYTES: u64 = 4_264_186_432;
pub const YUE2_Q4: &str = "yue2-3b-q4_0.gguf";
pub const YUE2_Q4_SHA: &str = "97af67d7f800b362faee6e6bec806bddfcccb93f25fd3f9a1012724d95af6f4a";
/// Taille exacte du GGUF YuE2 Q4 épinglé (octets).
pub const YUE2_Q4_BYTES: u64 = 2_665_632_320;
pub const YUE2_VAE: &str = "yue2-vae-f16.gguf";
pub const YUE2_VAE_SHA: &str = "d4f4a05d8f291ae820cd1e43609da3fa91b56465810091a2b08c3350b751719d";
pub const YUE2_VAE_BYTES: u64 = 265_218_656;

pub const HTDEMUCS_GGUF: &str = "htdemucs-q8_0.gguf";
pub const HTDEMUCS_SHA: &str = "b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388";
pub const HTDEMUCS_BYTES: u64 = 61_940_768;

/// Tailles des archives moteur audio.cpp pour l’assistant premier lancement.
pub const ARCHIVE_WINDOWS_BYTES: u64 = 444_938_499;
pub const ARCHIVE_WINDOWS_CUDART_BYTES: u64 = 607_273_675;
pub const ARCHIVE_LINUX_BYTES: u64 = 65_293_844;
pub const ARCHIVE_MACOS_ARM64_BYTES: u64 = 28_446_530;
pub const ARCHIVE_MACOS_X64_BYTES: u64 = 30_120_475;

pub const YUE2_SIDECAR_MODEL_CONFIG_BYTES: u64 = 959;
pub const YUE2_SIDECAR_GENERATION_CONFIG_BYTES: u64 = 466;
pub const YUE2_SIDECAR_TIKTOKEN_BYTES: u64 = 2_561_218;
pub const YUE2_SIDECAR_VAE_CONFIG_BYTES: u64 = 1_378;

pub fn yue2_sidecar_bytes(name: &str) -> Option<u64> {
    match name {
        "yue2-model-config.json" => Some(YUE2_SIDECAR_MODEL_CONFIG_BYTES),
        "yue2-generation-config.json" => Some(YUE2_SIDECAR_GENERATION_CONFIG_BYTES),
        "yue2-qwen.tiktoken" => Some(YUE2_SIDECAR_TIKTOKEN_BYTES),
        "yue2-vae-config.json" => Some(YUE2_SIDECAR_VAE_CONFIG_BYTES),
        _ => None,
    }
}

pub fn platform_engine_archive_bytes() -> u64 {
    if cfg!(target_os = "windows") {
        ARCHIVE_WINDOWS_BYTES
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        ARCHIVE_MACOS_ARM64_BYTES
    } else if cfg!(target_os = "macos") {
        ARCHIVE_MACOS_X64_BYTES
    } else {
        ARCHIVE_LINUX_BYTES
    }
}
pub const HTDEMUCS_PACKAGE: &str = "htdemucs_q8_0";

/// BS-RoFormer — optional phase-3 second separator (not in first-build installer).
pub const BS_ROFORMER_GGUF: &str = "bs-roformer-ep368-q8_0.gguf";
pub const BS_ROFORMER_SHA: &str =
    "9a55a8cad369d00f6e0fb208bb0cd87e30e25430772b8491e20a4eace6423ad2";
pub const BS_ROFORMER_PACKAGE: &str = "bs_roformer_q8_0";
pub const BS_ROFORMER_REMOTE: &str = "BS-RoFormer-ep368-GGUF/bs-roformer-ep368-q8_0.gguf";
/// Exact on-disk size of the pinned GGUF (bytes).
pub const BS_ROFORMER_BYTES: u64 = 172_532_256;

/// Mel-Band RoFormer « Kim Vocal 2 » — opt-in vocal separator (not in first-build installer).
pub const MEL_BAND_ROFORMER_GGUF: &str = "mel-band-roformer-q8_0.gguf";
pub const MEL_BAND_ROFORMER_SHA: &str =
    "2dd898ceb0e3812c18d6125dcd60174d35d3da22c94add76b029fbb21fc238fd";
pub const MEL_BAND_ROFORMER_PACKAGE: &str = "mel_band_roformer_q8_0";
pub const MEL_BAND_ROFORMER_REMOTE: &str = "Mel-Band-RoFormer-GGUF/mel-band-roformer-q8_0.gguf";
pub const MEL_BAND_ROFORMER_BYTES: u64 = 251_748_928;

/// SheetSage2 — opt-in MIDI transcription weights (hors premier build, CC BY-NC 4.0).
pub const SHEETSAGE2_GGUF: &str = "sheetsage2-orig.gguf";
pub const SHEETSAGE2_SHA: &str = "52bb5846c452037d39931aa8050885b6c751b9c7afcc8ef6d6d3067d241731a4";
pub const SHEETSAGE2_REPO: &str = "audio-cpp/SheetSage2-GGUF";
pub const SHEETSAGE2_REMOTE: &str = "sheetsage2-orig.gguf";
/// Exact on-disk size of the pinned GGUF (bytes). Spec §19 / packages/sheetsage.
pub const SHEETSAGE2_BYTES: u64 = 2_708_224_512;

pub const DEFAULT_STEM_SEPARATOR: &str = "htdemucs";

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 8765;
pub const MAX_LOADED_MODELS: u32 = 1;
pub const BUSY_TIMEOUT_MS: u64 = 300_000;
pub const YUE2_BUSY_TIMEOUT_MS: u64 = 1_800_000;
pub const HTDEMUCS_BUSY_TIMEOUT_MS: u64 = 600_000;

pub const NUM_INFERENCE_STEPS: u32 = 8;
pub const VRAM_Q8_THRESHOLD_MIB: u64 = 12_288;

/// Cadence des tokens sémantiques YuE2 (1 token ≈ 40 ms).
pub const SEMANTIC_HZ: u32 = 25;
pub const SEMANTIC_MAX_DURATION_SEC: u32 = 900;
pub const DURATION_SEC_MIN: u32 = 30;
pub const DURATION_SEC_MAX: u32 = 360;
pub const DURATION_SEC_STEP: u32 = 30;
pub const DURATION_SEC_DEFAULT: u32 = 180;

pub fn default_target_duration_sec() -> u32 {
    DURATION_SEC_DEFAULT
}

/// Arrondit sur le pas de 30 s, borné [30, 360].
pub fn normalize_target_duration_sec(sec: u32) -> u32 {
    let clamped = sec.clamp(DURATION_SEC_MIN, DURATION_SEC_MAX);
    let steps = (clamped + DURATION_SEC_STEP / 2) / DURATION_SEC_STEP;
    (steps * DURATION_SEC_STEP).clamp(DURATION_SEC_MIN, DURATION_SEC_MAX)
}

/// YuE samples 25 semantic frames per second. In lyrics-first mode the target
/// is a minimum; max tokens gets a conservative lyric estimate plus headroom.
pub fn semantic_token_budget(sec: u32, lyrics: &str, prefer_full_lyrics: bool) -> (u32, u32) {
    let target_sec = normalize_target_duration_sec(sec);
    let target_tokens = target_sec.saturating_mul(SEMANTIC_HZ);
    if !prefer_full_lyrics {
        return (200, target_tokens);
    }

    let lyric_words = lyrics
        .lines()
        .filter(|line| !line.trim().starts_with('['))
        .flat_map(str::split_whitespace)
        .count() as u32;
    // Conservatively budget one second per lyric word, plus 30 seconds for
    // musical space. Real vocal pacing varies and the old 80 wpm estimate cut
    // off a full test verse before its final lines.
    let lyric_estimate_sec = lyric_words.saturating_add(30);
    let target_with_headroom = target_sec.saturating_add((target_sec / 4).max(DURATION_SEC_STEP));
    let max_sec = lyric_estimate_sec
        .max(target_with_headroom)
        .min(SEMANTIC_MAX_DURATION_SEC);
    let max_sec = max_sec.div_ceil(DURATION_SEC_STEP) * DURATION_SEC_STEP;
    (
        target_tokens,
        max_sec.min(SEMANTIC_MAX_DURATION_SEC) * SEMANTIC_HZ,
    )
}

pub const TONICS: &[&str] = &[
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

#[cfg(test)]
mod semantic_budget_tests {
    use super::*;

    #[test]
    fn lyrics_first_mode_keeps_target_as_minimum_and_adds_lyric_headroom() {
        let lyrics = (0..500).map(|_| "word").collect::<Vec<_>>().join(" ");
        let (min_tokens, max_tokens) = semantic_token_budget(30, &lyrics, true);
        assert_eq!(min_tokens, 30 * SEMANTIC_HZ);
        assert!(max_tokens > min_tokens);
        assert!(max_tokens >= 6 * 60 * SEMANTIC_HZ);
    }

    #[test]
    fn strict_mode_preserves_the_exact_duration_cap() {
        let (min_tokens, max_tokens) = semantic_token_budget(30, "a very long lyric", false);
        assert_eq!(min_tokens, 200);
        assert_eq!(max_tokens, 30 * SEMANTIC_HZ);
    }

    #[test]
    fn duration_budget_covers_the_full_song_smoke_test_lyrics() {
        let lyrics = (0..278).map(|_| "word").collect::<Vec<_>>().join(" ");
        assert_eq!(semantic_token_budget(30, &lyrics, true), (750, 8_250));
    }

    #[test]
    fn section_headers_do_not_inflate_lyric_estimate() {
        let plain = semantic_token_budget(30, "word word word", true);
        let tagged = semantic_token_budget(30, "[Verse]\nword word word", true);
        assert_eq!(plain, tagged);
    }
}
