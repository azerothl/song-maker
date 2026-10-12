use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KeySig {
    pub tonic: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Meter {
    pub numerator: u8,
    pub denominator: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDoc {
    pub schema: String,
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bit_depth: u16,
    pub style: String,
    pub lyrics: String,
    pub cot: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub singing_language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tempo_bpm: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<KeySig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meter: Option<Meter>,
    /// Durée cible (secondes), pas de 30 s, max 360.
    #[serde(default = "crate::pins::default_target_duration_sec")]
    pub target_duration_sec: u32,
    #[serde(default = "default_prefer_full_lyrics")]
    pub prefer_full_lyrics: bool,
    /// Mode instrumental : paroles facultatives (chaîne vide acceptée par audio.cpp YuE2).
    #[serde(default)]
    pub instrumental_mode: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_generation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_separation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_mix_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_score_id: Option<String>,
    /// Noms parlants des prises (clé = id gen-*), choisis par l’utilisateur (#133).
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub generation_names: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRow {
    pub id: String,
    pub title: String,
    pub folder_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub cot: String,
    pub active_generation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedLibraryTrack {
    pub project_id: String,
    pub generation_id: String,
    pub title: String,
    pub added_at: String,
    #[serde(default)]
    pub playlist_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPlaylist {
    pub id: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLibraryDoc {
    pub version: u8,
    #[serde(default)]
    pub tracks: Vec<SavedLibraryTrack>,
    #[serde(default)]
    pub playlists: Vec<UserPlaylist>,
    #[serde(default)]
    pub updated_at: String,
}

fn default_true() -> bool {
    true
}

fn default_stretch_ratio() -> f32 {
    1.0
}

fn is_default_stretch(v: &f32) -> bool {
    (*v - 1.0).abs() < f32::EPSILON
}

fn is_false(v: &bool) -> bool {
    !*v
}

fn is_true(v: &bool) -> bool {
    *v
}

fn is_zero_f32(v: &f32) -> bool {
    *v == 0.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub track_id: String,
    pub source_path: String,
    pub source_sha256: String,
    pub start_ms: i64,
    pub offset_ms: i64,
    pub duration_ms: i64,
    pub gain_db: f32,
    pub fade_in_ms: i64,
    pub fade_out_ms: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_tempo_bpm: Option<f32>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub follow_project_tempo: bool,
    #[serde(
        default = "default_stretch_ratio",
        skip_serializing_if = "is_default_stretch"
    )]
    pub time_stretch_ratio: f32,
    #[serde(default, skip_serializing_if = "is_zero_f32")]
    pub pitch_semitones: f32,
    #[serde(default = "default_true", skip_serializing_if = "is_true")]
    pub processing_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transient_markers_ms: Option<Vec<i64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_group_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_index: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_label: Option<String>,
    #[serde(default = "default_true", skip_serializing_if = "is_true")]
    pub take_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixTrack {
    pub id: String,
    pub role: String,
    pub name: String,
    pub gain_db: f32,
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
    pub locked: bool,
    pub ai_separated: bool,
    pub clips: Vec<Clip>,
    /// Spike VST3 (#326) — métadonnée uniquement, ignorée par le bake.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub experimental_vst3_insert: Option<ExperimentalVst3Insert>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalVst3Insert {
    pub plugin_path: String,
    pub factory_present: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_b64: Option<String>,
    pub notes_fr: String,
}

/// Arrangement tempo event (ms timeline). Clip storage stays in ms (#94).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixTempoEvent {
    pub start_ms: i64,
    pub quarter_bpm: u32,
}

/// Arrangement meter event (ms timeline).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixMeterEvent {
    pub start_ms: i64,
    pub numerator: u32,
    pub denominator: u32,
}

/// Named section marker on the mix arrangement timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixMarker {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub start_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixDoc {
    pub schema: String,
    pub schema_version: u32,
    pub id: String,
    pub separation_id: String,
    pub sample_rate: u32,
    pub master_gain_db: f32,
    pub peak_ceiling_db: f32,
    pub tracks: Vec<MixTrack>,
    /// VST3 master insert, rendered offline by the isolated Windows host worker (#326).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vst3_master_insert: Option<Vst3MasterInsert>,
    /// Musical grid tempo map. Empty on legacy mixes → UI default 120 BPM.
    #[serde(default)]
    pub tempo_map: Vec<MixTempoEvent>,
    /// Meter changes for the musical grid. Empty → UI default 4/4.
    #[serde(default)]
    pub time_signatures: Vec<MixMeterEvent>,
    /// Named section markers (intro, couplet, …).
    #[serde(default)]
    pub markers: Vec<MixMarker>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub projects_dir: String,
    pub cache_dir: String,
    pub binary_tag: String,
    pub binary_archive: String,
    pub binary_sha256: String,
    pub model_pack: String,
    pub model_gguf: String,
    pub model_sha256: String,
    /// Local music generation engine: `yue2` (default) or opt-in `ace_step`.
    #[serde(default = "default_generation_engine")]
    pub generation_engine: String,
    pub server_host: String,
    pub server_port: u16,
    pub output_device: Option<String>,
    /// Soft-synth / MIDI monitoring lookahead in ms (#96). Default 20.
    #[serde(default = "default_audio_latency_ms")]
    pub audio_latency_ms: u32,
    /// Phase 3: `htdemucs` (default) | `mel_band_roformer` | `bs_roformer` | `htdemucs_6s`.
    #[serde(default = "default_stem_separator")]
    pub stem_separator: String,
    /// CC BY-NC acceptance for optional LoRA packs (phase 3).
    #[serde(default)]
    pub cc_by_nc_accepted: bool,
    /// Consentement distinct pour le modèle YuE2 principal sous CC BY-NC 4.0.
    #[serde(default)]
    pub yue2_license_accepted: bool,
    /// Consentement explicite avant le téléchargement optionnel ACE-Step 1.5 Turbo GGUF.
    #[serde(default)]
    pub ace_step_license_accepted: bool,
    /// Consentement distinct pour le sidecar Python ACE-Step 1.5 Base (Lego, #325).
    #[serde(default)]
    pub ace_step_lego_license_accepted: bool,
    /// Per-separator « J'ai lu la licence » (once per model id) before opt-in download (#167).
    #[serde(default)]
    pub accepted_separator_licenses: std::collections::BTreeMap<String, bool>,
    /// Measured separation rates (ms wall / audio sec) keyed by separator id (#166).
    #[serde(default)]
    pub separator_time_stats: std::collections::BTreeMap<String, SeparatorTimeStat>,
    /// Génération YuE2 locale (désactivé si l’utilisateur continue sans génération au premier lancement).
    #[serde(default = "default_local_yue2_enabled")]
    pub local_yue2_enabled: bool,
    /// Optional unfused YuE2 adapters selected from the local LoRA library.
    #[serde(default)]
    pub yue2_ar_lora: Option<String>,
    #[serde(default)]
    pub yue2_nar_lora: Option<String>,
    #[serde(default = "default_lora_scale")]
    pub yue2_ar_lora_scale: f32,
    #[serde(default = "default_lora_scale")]
    pub yue2_nar_lora_scale: f32,
    /// Mix assistant LLM provider: `ollama` | `openai_compat` | `rbitnet` | `llama_cpp` | `external`.
    #[serde(default = "default_mix_llm_provider")]
    pub mix_llm_provider: String,
    /// Base URL for the mix assistant LLM (loopback by default).
    #[serde(default = "default_mix_llm_base_url")]
    pub mix_llm_base_url: String,
    /// Model id / tag expected on the configured server.
    #[serde(default = "default_mix_llm_model_id")]
    pub mix_llm_model_id: String,
    /// Expert opt-in: allow non-loopback OpenAI-compat endpoints (off by default).
    #[serde(default = "default_mix_llm_allow_remote")]
    pub mix_llm_allow_remote: bool,
}

fn default_lora_scale() -> f32 {
    1.0
}

fn default_local_yue2_enabled() -> bool {
    true
}

pub fn default_generation_engine() -> String {
    "yue2".into()
}

fn default_audio_latency_ms() -> u32 {
    20
}

fn default_stem_separator() -> String {
    crate::pins::DEFAULT_STEM_SEPARATOR.to_string()
}

pub fn default_mix_llm_provider() -> String {
    "ollama".into()
}

pub fn default_mix_llm_base_url() -> String {
    "http://127.0.0.1:11434".into()
}

pub fn default_mix_llm_model_id() -> String {
    "qwen3.5:2b".into()
}

pub fn default_mix_llm_allow_remote() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeparatorTimeStat {
    pub ms_per_audio_sec: f64,
    pub samples: u32,
}

fn default_prefer_full_lyrics() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Phase3Status {
    pub stem_separator: String,
    pub htdemucs_available: bool,
    pub bs_roformer_available: bool,
    pub bs_roformer_path: String,
    pub mel_band_roformer_available: bool,
    pub mel_band_roformer_path: String,
    pub htdemucs_6s_runtime_available: bool,
    pub cc_by_nc_accepted: bool,
    pub accepted_separator_licenses: std::collections::BTreeMap<String, bool>,
    pub separator_time_stats: std::collections::BTreeMap<String, SeparatorTimeStat>,
    /// True only while a selected, usable provider emits guitar/piano.
    pub guitar_piano_available: bool,
    pub honesty_fr: String,
}

/// Valeurs de `accelerationKind` / `SetupGpuInfo.accelerationKind`.
pub const GPU_ACCEL_NVIDIA: &str = "nvidiaCuda";
pub const GPU_ACCEL_APPLE_METAL: &str = "appleMetal";
pub const GPU_ACCEL_NONE: &str = "none";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupGpuInfo {
    /// `nvidiaCuda` | `appleMetal` | `none`
    pub acceleration_kind: String,
    pub gpu_name: Option<String>,
    pub driver_version: Option<String>,
    pub vram_mib: Option<u64>,
    pub suggested_pack: String,
    pub suggested_pack_reason_fr: String,
    /// Alias historique : vrai pour NVIDIA CUDA et Apple Metal.
    pub acceleration_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallFilePlan {
    pub name: String,
    pub status: String,
    pub total_bytes: Option<u64>,
    pub received_bytes: u64,
    pub remaining_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub pack: String,
    pub file_count: usize,
    pub bytes_to_download: u64,
    pub bytes_known: bool,
    pub has_partial_downloads: bool,
    pub files: Vec<InstallFilePlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallErrorInfo {
    pub message: String,
    /// `network` | `diskFull` | `hashInvalid` | `http` | `other`
    pub cause: String,
    pub file_name: Option<String>,
}

pub fn classify_install_error(message: &str, file_name: Option<&str>) -> InstallErrorInfo {
    let lower = message.to_lowercase();
    let cause =
        if lower.contains("sha-256") || lower.contains("empreinte") || lower.contains("hash") {
            "hashInvalid"
        } else if lower.contains("espace disque")
            || lower.contains("disk full")
            || lower.contains("no space")
            || lower.contains("storage full")
        {
            "diskFull"
        } else if lower.contains("http ") || lower.contains("http/") || lower.starts_with("http") {
            "http"
        } else if lower.contains("téléchargement")
            || lower.contains("telechargement")
            || lower.contains("connexion")
            || lower.contains("connection")
            || lower.contains("timed out")
            || lower.contains("timeout")
            || lower.contains("réseau")
            || lower.contains("network")
        {
            "network"
        } else {
            "other"
        };
    InstallErrorInfo {
        message: message.into(),
        cause: cause.into(),
        file_name: file_name.map(str::to_string),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub cuda_available: bool,
    pub acceleration_kind: String,
    pub gpu_name: Option<String>,
    pub driver_version: Option<String>,
    pub vram_mib: Option<u64>,
    pub suggested_pack: String,
    pub suggested_pack_reason_fr: String,
    pub local_yue2_enabled: bool,
    pub models_ok: bool,
    pub binary_ok: bool,
    pub server_healthy: bool,
    pub server_url: Option<String>,
    pub generation_model_id: String,
    pub generation_model: String,
    pub generation_model_available: bool,
    #[serde(default)]
    pub generation_model_loaded: Option<bool>,
    pub message: String,
    /// Official Python YuE2 is intentionally not installed and not a fallback (#328).
    pub python_yue2_runtime: String,
    /// House-model desktop provider (#323). `unavailable` until a decoder is wired.
    pub house_model_runtime: String,
    /// ACE-Step 1.5 Base Lego sidecar (#325). `missing` | `installed` | `ready`.
    #[serde(default)]
    pub ace_step_lego_runtime: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallDownloadMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_per_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eta_seconds: Option<u64>,
    #[serde(default)]
    pub eta_is_estimate: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_received_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_bytes_per_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_eta_seconds: Option<u64>,
    #[serde(default)]
    pub overall_eta_is_estimate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub state: String,
    pub label: String,
    pub file_index: usize,
    pub file_count: usize,
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_per_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eta_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub eta_is_estimate: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_received_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_bytes_per_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_eta_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub overall_eta_is_estimate: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<InstallErrorInfo>,
}

impl InstallProgress {
    fn apply_metrics(mut self, metrics: Option<&InstallDownloadMetrics>) -> Self {
        if let Some(m) = metrics {
            self.bytes_per_sec = m.bytes_per_sec;
            self.eta_seconds = m.eta_seconds;
            self.eta_is_estimate = m.eta_is_estimate;
            self.overall_received_bytes = m.overall_received_bytes;
            self.overall_total_bytes = m.overall_total_bytes;
            self.overall_bytes_per_sec = m.overall_bytes_per_sec;
            self.overall_eta_seconds = m.overall_eta_seconds;
            self.overall_eta_is_estimate = m.overall_eta_is_estimate;
        }
        self
    }

    pub fn starting(file_count: usize) -> Self {
        Self {
            state: "downloading".into(),
            label: "Préparation du téléchargement…".into(),
            file_index: 0,
            file_count,
            received_bytes: 0,
            total_bytes: None,
            file_name: None,
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: None,
        }
    }
    pub fn downloading(
        label: &str,
        file_index: usize,
        file_count: usize,
        received_bytes: u64,
        total_bytes: Option<u64>,
    ) -> Self {
        Self::downloading_with_metrics(
            label,
            file_index,
            file_count,
            received_bytes,
            total_bytes,
            None,
        )
    }
    pub fn downloading_with_metrics(
        label: &str,
        file_index: usize,
        file_count: usize,
        received_bytes: u64,
        total_bytes: Option<u64>,
        metrics: Option<&InstallDownloadMetrics>,
    ) -> Self {
        Self {
            state: "downloading".into(),
            label: label.into(),
            file_index,
            file_count,
            received_bytes,
            total_bytes,
            file_name: Some(label.into()),
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: None,
        }
        .apply_metrics(metrics)
    }
    pub fn file_done(label: &str, file_index: usize, file_count: usize) -> Self {
        Self {
            state: "downloading".into(),
            label: label.into(),
            file_index,
            file_count,
            received_bytes: 1,
            total_bytes: Some(1),
            file_name: Some(label.into()),
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: None,
        }
    }
    pub fn phase(label: &str, file_index: usize, file_count: usize) -> Self {
        Self {
            state: "preparing".into(),
            label: label.into(),
            file_index,
            file_count,
            received_bytes: 0,
            total_bytes: None,
            file_name: None,
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: None,
        }
    }
    pub fn failed(label: &str) -> Self {
        Self::failed_for_file(label, None)
    }
    pub fn failed_for_file(label: &str, file_name: Option<&str>) -> Self {
        Self {
            state: "error".into(),
            label: label.into(),
            file_index: 0,
            file_count: 0,
            received_bytes: 0,
            total_bytes: None,
            file_name: file_name.map(str::to_string),
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: Some(classify_install_error(label, file_name)),
        }
    }
    pub fn complete() -> Self {
        Self {
            state: "complete".into(),
            label: "Installation terminée".into(),
            file_index: 1,
            file_count: 1,
            received_bytes: 1,
            total_bytes: Some(1),
            file_name: None,
            bytes_per_sec: None,
            eta_seconds: None,
            eta_is_estimate: false,
            overall_received_bytes: None,
            overall_total_bytes: None,
            overall_bytes_per_sec: None,
            overall_eta_seconds: None,
            overall_eta_is_estimate: false,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub state: String,
    pub label: String,
    pub project_id: Option<String>,
    pub queue_position: Option<usize>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormInput {
    pub title: String,
    pub style: String,
    pub lyrics: String,
    pub cot: String,
    pub singing_language: Option<String>,
    pub tempo_bpm: Option<u32>,
    pub key: Option<KeySig>,
    pub meter: Option<Meter>,
    pub seed: Option<u64>,
    /// Durée cible (secondes), pas 30, borné 30–360. Défaut 180.
    #[serde(default = "crate::pins::default_target_duration_sec")]
    pub target_duration_sec: u32,
    #[serde(default = "default_prefer_full_lyrics")]
    pub prefer_full_lyrics: bool,
    /// Mode instrumental : paroles facultatives pour la génération YuE2.
    #[serde(default)]
    pub instrumental_mode: bool,
    /// Generation to continue from, when its semantic artifact is available.
    #[serde(default)]
    pub continuation_generation_id: Option<String>,
    /// Reference WAV for audio_input / inpainting. Pinned YuE2 and ACE-Step reject this (#324).
    #[serde(default)]
    pub audio_input_path: Option<String>,
    #[serde(default)]
    pub inpaint_start_ms: Option<i64>,
    #[serde(default)]
    pub inpaint_end_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixUpdate {
    pub master_gain_db: f32,
    pub tracks: Vec<MixTrackUpdate>,
    /// When present, replaces the mix arrangement tempo map (#94).
    #[serde(default)]
    pub tempo_map: Option<Vec<MixTempoEvent>>,
    #[serde(default)]
    pub time_signatures: Option<Vec<MixMeterEvent>>,
    #[serde(default)]
    pub markers: Option<Vec<MixMarker>>,
    /// An object replaces the saved insert; removal uses `clear_vst3_master_insert`.
    #[serde(default)]
    pub vst3_master_insert: Option<Vst3MasterInsert>,
    /// Explicit removal flag because JSON `null` maps to `None` for nested options too.
    #[serde(default)]
    pub clear_vst3_master_insert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3MasterInsert {
    pub plugin_path: String,
    pub plugin_name: String,
    pub enabled: bool,
    #[serde(default)]
    pub parameters: std::collections::BTreeMap<u32, f64>,
    /// Opaque plugin-specific state, base64 encoded to keep the project JSON compact.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_b64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixTrackUpdate {
    pub id: String,
    pub gain_db: f32,
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
    /// Si présent, remplace la liste de clips de la piste (édition phase 2).
    #[serde(default)]
    pub clips: Option<Vec<Clip>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub format: String,
    pub destination: Option<String>,
    /// Lossless only: 16 or 24. Ignored for mp3.
    #[serde(default)]
    pub bit_depth: Option<u16>,
    /// Compressed only: kbps (128 / 192 / 320). Ignored for wav/flac.
    #[serde(default)]
    pub bitrate_kbps: Option<u16>,
    /// Always offered: copy into a folder or zip the result (#168).
    #[serde(default)]
    pub pack: Option<String>,
}

/// Export from a frontend-baked float32 mix (mix-production TS path).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPcmRequest {
    pub format: String,
    pub destination: Option<String>,
    /// Little-endian f32 interleaved stereo bytes.
    pub pcm_le: Vec<u8>,
    pub sample_rate: u32,
    pub channels: u16,
    pub peak_trim_db: f32,
    /// `phase1` | `production` — honesty marker in export JSON.
    pub render_path: String,
    /// Explicit: not bit-exact with live Web Audio graph quirks.
    pub match_mode: String,
    /// Optional file name stem (no extension) under exports/, e.g. `stem-01_vocals`.
    #[serde(default)]
    pub file_stem: Option<String>,
    #[serde(default)]
    pub bit_depth: Option<u16>,
    #[serde(default)]
    pub bitrate_kbps: Option<u16>,
    #[serde(default)]
    pub pack: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCacheFileRequest {
    pub url: String,
    /// Must start with `models/lora/`.
    pub relative_cache_path: String,
    /// When set (catalog pin), verify SHA-256 after download or cache hit.
    #[serde(default)]
    pub expected_sha256: Option<String>,
}

fn default_yue2_engine_id() -> String {
    "yue2_3b".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSummary {
    pub id: String,
    pub created_at: String,
    pub seed: u64,
    pub cot: String,
    pub state: String,
    pub has_score: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_generation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_truncated: Option<bool>,
    #[serde(default)]
    pub can_continue: bool,
    /// `yue2_3b` or `ace_step_1_5` (from request.json).
    #[serde(default = "default_yue2_engine_id")]
    pub engine_id: String,
}

/// Immutable score version metadata for branch/merge UI (§12.2).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSummary {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_score_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_name: Option<String>,
    pub version: u32,
    pub source: String,
    pub note_count: u32,
    /// ISO timestamp from file mtime when the document has no createdAt (#133).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// Mix snapshot for the Versions timeline (#133).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixVersionSummary {
    pub id: String,
    pub separation_id: String,
    pub created_at: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLoraAdapter {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Chemins absolus pour la lecture Web Audio (prise ou stems float32).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStem {
    pub role: String,
    pub name: String,
    pub track_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSources {
    /// `"generation"` | `"stems"`
    pub mode: String,
    pub generation_id: Option<String>,
    pub generation_wav: Option<String>,
    pub stems: Vec<PlaybackStem>,
    pub label: String,
}

/// Chunked mic/line capture session (#41) before finalize into a user track.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAudioCaptureSession {
    pub session_id: String,
    pub relative_path: String,
}

/// Active separation manifest summary for UI warnings (§9.5).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeparationInfo {
    pub id: String,
    pub family: String,
    pub warnings: Vec<String>,
}

/// One completed separation + its mix snapshot (for Versions / undo).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeparationVersionSummary {
    pub separation_id: String,
    pub mix_id: String,
    pub created_at: String,
    pub is_active: bool,
    pub generation_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSeparationStemsRequest {
    pub track_ids: Vec<String>,
    /// `folder` copies WAV files; `zip` writes a single archive.
    pub pack: String,
    pub destination: Option<String>,
}
