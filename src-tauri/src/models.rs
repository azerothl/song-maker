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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_generation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_separation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_mix_id: Option<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixTrackUpdate {
    pub id: String,
    pub gain_db: f32,
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub format: String,
    pub destination: Option<String>,
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
}
