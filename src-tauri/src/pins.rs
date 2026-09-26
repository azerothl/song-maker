//! Constantes et épingles du contrat v1.0 (premier build).

pub const SCHEMA_PROJECT: &str = "songmaker.project";
pub const SCHEMA_GEN_REQUEST: &str = "songmaker.generation.request";
pub const SCHEMA_GEN_RESULT: &str = "songmaker.generation.result";
pub const SCHEMA_SEPARATION: &str = "songmaker.separation";
pub const SCHEMA_MIX: &str = "songmaker.mix";
pub const SCHEMA_VERSION: u32 = 1;

pub const SAMPLE_RATE: u32 = 48_000;
pub const SEPARATOR_SAMPLE_RATE: u32 = 44_100;
pub const CHANNELS: u16 = 2;
pub const BIT_DEPTH: u16 = 24;

pub const AUDIOCPP_TAG: &str = "v0.8.1";
pub const AUDIOCPP_COMMIT: &str = "f2b4937306daa25f5c78520f3c626ed31495a37a";

pub const ARCHIVE_WINDOWS: &str = "audio-v0.8.1-bin-windows-x64-cuda12.4.zip";
pub const ARCHIVE_WINDOWS_SHA: &str =
    "28bbe8ac62a06c5d9d42ba3066b051f433dc9a8f456c544e03e87202f0fa8c52";
pub const ARCHIVE_WINDOWS_CUDART: &str = "audio-v0.8.1-cudart-windows-x64-cuda12.4.zip";
pub const ARCHIVE_WINDOWS_CUDART_SHA: &str =
    "025faacfdc3dec215ee07cb9be7d1ef2016402723f3721a30500ceee02cc4701";
pub const ARCHIVE_LINUX: &str = "audio-v0.8.1-bin-ubuntu-x64-cuda12.8-colab.tar.gz";
pub const ARCHIVE_LINUX_SHA: &str =
    "f969811783f206b6d1f6566c020211ab9df7b6bb96c6eded6ad7a58deb725025";

pub const YUE2_REPO: &str = "audio-cpp/Yue2-3B-GGUF";
pub const YUE2_REVISION: &str = "eb116220931de5f373d024d48800338178c7de51";
pub const YUE2_Q8: &str = "yue2-3b-q8_0.gguf";
pub const YUE2_Q8_SHA: &str =
    "f3a9e3b197bfd05aa4ae6ab2d4b93f6d57c8cc0ea39a4af7d151f58697c7cfb6";
pub const YUE2_Q4: &str = "yue2-3b-q4_0.gguf";
pub const YUE2_Q4_SHA: &str =
    "97af67d7f800b362faee6e6bec806bddfcccb93f25fd3f9a1012724d95af6f4a";
pub const YUE2_VAE: &str = "yue2-vae-f16.gguf";
pub const YUE2_VAE_SHA: &str =
    "d4f4a05d8f291ae820cd1e43609da3fa91b56465810091a2b08c3350b751719d";

pub const HTDEMUCS_GGUF: &str = "htdemucs-q8_0.gguf";
pub const HTDEMUCS_SHA: &str =
    "b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388";
pub const HTDEMUCS_PACKAGE: &str = "htdemucs_q8_0";

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 8765;
pub const MAX_LOADED_MODELS: u32 = 1;
pub const BUSY_TIMEOUT_MS: u64 = 300_000;
pub const YUE2_BUSY_TIMEOUT_MS: u64 = 1_800_000;
pub const HTDEMUCS_BUSY_TIMEOUT_MS: u64 = 600_000;

pub const NUM_INFERENCE_STEPS: u32 = 8;
pub const VRAM_Q8_THRESHOLD_MIB: u64 = 12_288;

pub const ALLOWED_LYRIC_TAGS: &[&str] = &[
    "[Intro]",
    "[Verse]",
    "[Verse 2]",
    "[Pre-Chorus]",
    "[Chorus]",
    "[Bridge]",
    "[Outro]",
    "[Instrumental]",
];

pub const TONICS: &[&str] = &[
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];
