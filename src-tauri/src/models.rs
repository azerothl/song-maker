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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_generation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_separation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_mix_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_score_id: Option<String>,
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
    #[serde(default = "default_stretch_ratio", skip_serializing_if = "is_default_stretch")]
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
    pub server_host: String,
    pub server_port: u16,
    pub output_device: Option<String>,
    /// Soft-synth / MIDI monitoring lookahead in ms (#96). Default 20.
    #[serde(default = "default_audio_latency_ms")]
    pub audio_latency_ms: u32,
    /// Phase 3: `htdemucs` (default) or `bs_roformer` when GGUF is present.
    #[serde(default = "default_stem_separator")]
    pub stem_separator: String,
    /// CC BY-NC acceptance for optional LoRA packs (phase 3).
    #[serde(default)]
    pub cc_by_nc_accepted: bool,
    /// Consentement distinct pour le modèle YuE2 principal sous CC BY-NC 4.0.
    #[serde(default)]
    pub yue2_license_accepted: bool,
    /// Optional unfused YuE2 adapters selected from the local LoRA library.
    #[serde(default)]
    pub yue2_ar_lora: Option<String>,
    #[serde(default)]
    pub yue2_nar_lora: Option<String>,
    #[serde(default = "default_lora_scale")]
    pub yue2_ar_lora_scale: f32,
    #[serde(default = "default_lora_scale")]
    pub yue2_nar_lora_scale: f32,
}

fn default_lora_scale() -> f32 { 1.0 }

fn default_audio_latency_ms() -> u32 {
    20
}

fn default_stem_separator() -> String {
    crate::pins::DEFAULT_STEM_SEPARATOR.to_string()
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
    pub htdemucs_6s_runtime_available: bool,
    pub cc_by_nc_accepted: bool,
    /// True only while a selected, usable provider emits guitar/piano.
    pub guitar_piano_available: bool,
    pub honesty_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub cuda_available: bool,
    pub gpu_name: Option<String>,
    pub driver_version: Option<String>,
    pub vram_mib: Option<u64>,
    pub suggested_pack: String,
    pub models_ok: bool,
    pub binary_ok: bool,
    pub server_healthy: bool,
    pub server_url: Option<String>,
    pub message: String,
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
}

impl InstallProgress {
    pub fn starting(file_count: usize) -> Self {
        Self { state: "downloading".into(), label: "Préparation du téléchargement…".into(), file_index: 0, file_count, received_bytes: 0, total_bytes: None }
    }
    pub fn downloading(label: &str, file_index: usize, file_count: usize, received_bytes: u64, total_bytes: Option<u64>) -> Self {
        Self { state: "downloading".into(), label: label.into(), file_index, file_count, received_bytes, total_bytes }
    }
    pub fn file_done(label: &str, file_index: usize, file_count: usize) -> Self {
        Self { state: "downloading".into(), label: label.into(), file_index, file_count, received_bytes: 1, total_bytes: Some(1) }
    }
    pub fn phase(label: &str, file_index: usize, file_count: usize) -> Self {
        Self { state: "preparing".into(), label: label.into(), file_index, file_count, received_bytes: 0, total_bytes: None }
    }
    pub fn failed(label: &str) -> Self {
        Self { state: "error".into(), label: label.into(), file_index: 0, file_count: 0, received_bytes: 0, total_bytes: None }
    }
    pub fn complete() -> Self {
        Self { state: "complete".into(), label: "Installation terminée".into(), file_index: 1, file_count: 1, received_bytes: 1, total_bytes: Some(1) }
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
    /// Generation to continue from, when its semantic artifact is available.
    #[serde(default)]
    pub continuation_generation_id: Option<String>,
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
