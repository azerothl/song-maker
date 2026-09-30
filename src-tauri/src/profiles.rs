//! User profiles (Hobby / Commercial) — separate data dirs per profile (#201).

use crate::models::AppSettings;
use crate::paths::{
    atomic_write_json, ensure_dir, legacy_library_db_path, legacy_projects_root, now_iso,
    settings_path, song_maker_documents,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const MAX_PROFILES: usize = 6;
pub const MIGRATION_DEFAULT_NAME: &str = "Profil Hobby (vos projets existants)";

static ACTIVE_PROFILE_ID: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn active_lock() -> &'static RwLock<Option<String>> {
    ACTIVE_PROFILE_ID.get_or_init(|| RwLock::new(None))
}

pub fn set_active_profile_id(id: &str) {
    *active_lock().write() = Some(id.to_string());
}

pub fn active_profile_id() -> Option<String> {
    active_lock().read().clone()
}

pub fn profiles_manifest_path() -> PathBuf {
    song_maker_documents().join("profiles.json")
}

pub fn profiles_root() -> PathBuf {
    song_maker_documents().join("profiles")
}

pub fn profile_dir(id: &str) -> PathBuf {
    profiles_root().join(id)
}

pub fn profile_projects_root(id: &str) -> PathBuf {
    profile_dir(id).join("projects")
}

pub fn profile_library_db_path(id: &str) -> PathBuf {
    profile_dir(id).join("library.sqlite")
}

pub fn profile_settings_path(id: &str) -> PathBuf {
    profile_dir(id).join("profile-settings.json")
}

pub fn global_settings_path() -> PathBuf {
    settings_path()
}

/// Active profile projects root (legacy path if context unset).
pub fn try_active_projects_root() -> Option<PathBuf> {
    active_profile_id().map(|id| profile_projects_root(&id))
}

pub fn active_projects_root() -> PathBuf {
    if let Some(id) = active_profile_id() {
        return profile_projects_root(&id);
    }
    legacy_projects_root()
}

pub fn active_library_db_path() -> PathBuf {
    if let Some(id) = active_profile_id() {
        return profile_library_db_path(&id);
    }
    legacy_library_db_path()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineContractAcceptance {
    pub text_fingerprint: String,
    pub accepted_at: String,
    pub text_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSettings {
    pub schema_version: u32,
    #[serde(default = "default_stem_separator")]
    pub stem_separator: String,
    #[serde(default)]
    pub cc_by_nc_accepted: bool,
    #[serde(default)]
    pub yue2_license_accepted: bool,
    #[serde(default)]
    pub accepted_separator_licenses: std::collections::BTreeMap<String, bool>,
    #[serde(default)]
    pub separator_time_stats: std::collections::BTreeMap<String, crate::models::SeparatorTimeStat>,
    #[serde(default = "default_local_yue2_enabled")]
    pub local_yue2_enabled: bool,
    #[serde(default)]
    pub yue2_ar_lora: Option<String>,
    #[serde(default)]
    pub yue2_nar_lora: Option<String>,
    #[serde(default = "default_lora_scale")]
    pub yue2_ar_lora_scale: f32,
    #[serde(default = "default_lora_scale")]
    pub yue2_nar_lora_scale: f32,
    #[serde(default)]
    pub engine_contract_acceptances: std::collections::BTreeMap<String, EngineContractAcceptance>,
}

fn default_stem_separator() -> String {
    crate::pins::DEFAULT_STEM_SEPARATOR.to_string()
}

fn default_local_yue2_enabled() -> bool {
    true
}

fn default_lora_scale() -> f32 {
    1.0
}

impl Default for ProfileSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            stem_separator: default_stem_separator(),
            cc_by_nc_accepted: false,
            yue2_license_accepted: false,
            accepted_separator_licenses: Default::default(),
            separator_time_stats: Default::default(),
            local_yue2_enabled: true,
            yue2_ar_lora: None,
            yue2_nar_lora: None,
            yue2_ar_lora_scale: 1.0,
            yue2_nar_lora_scale: 1.0,
            engine_contract_acceptances: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub id: String,
    pub name: String,
    /// `hobby` | `commercial`
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesManifest {
    pub schema_version: u32,
    pub profiles: Vec<ProfileMeta>,
    pub active_profile_id: Option<String>,
    pub last_used_profile_id: Option<String>,
    #[serde(default)]
    pub onboarding_complete: bool,
    #[serde(default)]
    pub migration_banner_dismissed: bool,
}

impl Default for ProfilesManifest {
    fn default() -> Self {
        Self {
            schema_version: 1,
            profiles: Vec::new(),
            active_profile_id: None,
            last_used_profile_id: None,
            onboarding_complete: false,
            migration_banner_dismissed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalAppSettings {
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
    #[serde(default = "default_audio_latency")]
    pub audio_latency_ms: u32,
    #[serde(default)]
    pub active_profile_id: Option<String>,
}

fn default_audio_latency() -> u32 {
    20
}

pub fn load_manifest() -> Result<ProfilesManifest, String> {
    let path = profiles_manifest_path();
    if !path.is_file() {
        return Ok(ProfilesManifest::default());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn save_manifest(manifest: &ProfilesManifest) -> Result<(), String> {
    atomic_write_json(&profiles_manifest_path(), manifest)
}

pub fn next_profile_id(manifest: &ProfilesManifest) -> String {
    let mut max = 0u32;
    for p in &manifest.profiles {
        if let Some(rest) = p.id.strip_prefix("profile-") {
            if let Ok(n) = rest.parse::<u32>() {
                max = max.max(n);
            }
        }
    }
    format!("profile-{:03}", max + 1)
}

fn legacy_data_present() -> bool {
    let legacy_projects = legacy_projects_root();
    if legacy_projects.is_dir()
        && std::fs::read_dir(&legacy_projects)
            .map(|rd| rd.flatten().next().is_some())
            .unwrap_or(false)
    {
        return true;
    }
    legacy_library_db_path().is_file()
}

fn move_dir_contents(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    ensure_dir(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if to.exists() {
            continue;
        }
        if from.is_dir() {
            std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
        } else {
            std::fs::rename(&from, &to).or_else(|_| {
                std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
                std::fs::remove_file(&from).map_err(|e| e.to_string())
            })?;
        }
    }
    Ok(())
}

fn extract_profile_fields(settings: &AppSettings) -> ProfileSettings {
    ProfileSettings {
        schema_version: 1,
        stem_separator: settings.stem_separator.clone(),
        cc_by_nc_accepted: settings.cc_by_nc_accepted,
        yue2_license_accepted: settings.yue2_license_accepted,
        accepted_separator_licenses: settings.accepted_separator_licenses.clone(),
        separator_time_stats: settings.separator_time_stats.clone(),
        local_yue2_enabled: settings.local_yue2_enabled,
        yue2_ar_lora: settings.yue2_ar_lora.clone(),
        yue2_nar_lora: settings.yue2_nar_lora.clone(),
        yue2_ar_lora_scale: settings.yue2_ar_lora_scale,
        yue2_nar_lora_scale: settings.yue2_nar_lora_scale,
        engine_contract_acceptances: Default::default(),
    }
}

fn apply_profile_to_settings(settings: &mut AppSettings, profile: &ProfileSettings, id: &str) {
    settings.projects_dir = profile_projects_root(id).display().to_string();
    settings.stem_separator = profile.stem_separator.clone();
    settings.cc_by_nc_accepted = profile.cc_by_nc_accepted;
    settings.yue2_license_accepted = profile.yue2_license_accepted;
    settings.accepted_separator_licenses = profile.accepted_separator_licenses.clone();
    settings.separator_time_stats = profile.separator_time_stats.clone();
    settings.local_yue2_enabled = profile.local_yue2_enabled;
    settings.yue2_ar_lora = profile.yue2_ar_lora.clone();
    settings.yue2_nar_lora = profile.yue2_nar_lora.clone();
    settings.yue2_ar_lora_scale = profile.yue2_ar_lora_scale;
    settings.yue2_nar_lora_scale = profile.yue2_nar_lora_scale;
}

pub fn load_profile_settings(id: &str) -> Result<ProfileSettings, String> {
    let path = profile_settings_path(id);
    if path.is_file() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return serde_json::from_str(&text).map_err(|e| e.to_string());
    }
    Ok(ProfileSettings::default())
}

pub fn save_profile_settings(id: &str, settings: &ProfileSettings) -> Result<(), String> {
    let dir = profile_dir(id);
    ensure_dir(&dir).map_err(|e| e.to_string())?;
    atomic_write_json(&profile_settings_path(id), settings)
}

pub fn split_and_save_settings(active_id: &str, merged: &AppSettings) -> Result<(), String> {
    let profile = ProfileSettings {
        schema_version: 1,
        stem_separator: merged.stem_separator.clone(),
        cc_by_nc_accepted: merged.cc_by_nc_accepted,
        yue2_license_accepted: merged.yue2_license_accepted,
        accepted_separator_licenses: merged.accepted_separator_licenses.clone(),
        separator_time_stats: merged.separator_time_stats.clone(),
        local_yue2_enabled: merged.local_yue2_enabled,
        yue2_ar_lora: merged.yue2_ar_lora.clone(),
        yue2_nar_lora: merged.yue2_nar_lora.clone(),
        yue2_ar_lora_scale: merged.yue2_ar_lora_scale,
        yue2_nar_lora_scale: merged.yue2_nar_lora_scale,
        engine_contract_acceptances: load_profile_settings(active_id)?.engine_contract_acceptances,
    };
    save_profile_settings(active_id, &profile)?;
    let global_path = global_settings_path();
    let mut global: GlobalAppSettings = if global_path.is_file() {
        let text = std::fs::read_to_string(&global_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| e.to_string())?
    } else {
        GlobalAppSettings {
            projects_dir: merged.projects_dir.clone(),
            cache_dir: merged.cache_dir.clone(),
            binary_tag: merged.binary_tag.clone(),
            binary_archive: merged.binary_archive.clone(),
            binary_sha256: merged.binary_sha256.clone(),
            model_pack: merged.model_pack.clone(),
            model_gguf: merged.model_gguf.clone(),
            model_sha256: merged.model_sha256.clone(),
            server_host: merged.server_host.clone(),
            server_port: merged.server_port,
            output_device: merged.output_device.clone(),
            audio_latency_ms: merged.audio_latency_ms,
            active_profile_id: Some(active_id.to_string()),
        }
    };
    global.cache_dir = merged.cache_dir.clone();
    global.binary_tag = merged.binary_tag.clone();
    global.binary_archive = merged.binary_archive.clone();
    global.binary_sha256 = merged.binary_sha256.clone();
    global.model_pack = merged.model_pack.clone();
    global.model_gguf = merged.model_gguf.clone();
    global.model_sha256 = merged.model_sha256.clone();
    global.server_host = merged.server_host.clone();
    global.server_port = merged.server_port;
    global.output_device = merged.output_device.clone();
    global.audio_latency_ms = merged.audio_latency_ms;
    global.active_profile_id = Some(active_id.to_string());
    atomic_write_json(&global_path, &global)
}

pub fn migrate_legacy_if_needed() -> Result<ProfilesManifest, String> {
    let mut manifest = load_manifest()?;
    if !manifest.profiles.is_empty() {
        return Ok(manifest);
    }
    if !legacy_data_present() && !global_settings_path().is_file() {
        return Ok(manifest);
    }
    let id = "profile-001".to_string();
    ensure_dir(&profile_dir(&id)).map_err(|e| e.to_string())?;
    ensure_dir(&profile_projects_root(&id)).map_err(|e| e.to_string())?;

    if legacy_projects_root().is_dir() {
        move_dir_contents(&legacy_projects_root(), &profile_projects_root(&id))?;
    }
    if legacy_library_db_path().is_file() {
        let dest = profile_library_db_path(&id);
        if !dest.is_file() {
            std::fs::rename(legacy_library_db_path(), &dest).or_else(|_| {
                std::fs::copy(legacy_library_db_path(), &dest).map_err(|e| e.to_string())?;
                std::fs::remove_file(legacy_library_db_path()).map_err(|e| e.to_string())
            })?;
        }
    }

    let profile_settings = if global_settings_path().is_file() {
        let text = std::fs::read_to_string(global_settings_path()).map_err(|e| e.to_string())?;
        if let Ok(legacy) = serde_json::from_str::<AppSettings>(&text) {
            extract_profile_fields(&legacy)
        } else {
            ProfileSettings::default()
        }
    } else {
        ProfileSettings::default()
    };
    save_profile_settings(&id, &profile_settings)?;

    let meta = ProfileMeta {
        id: id.clone(),
        name: MIGRATION_DEFAULT_NAME.into(),
        kind: "hobby".into(),
        created_at: now_iso(),
    };
    manifest.profiles.push(meta);
    manifest.active_profile_id = Some(id.clone());
    manifest.last_used_profile_id = Some(id.clone());
    manifest.onboarding_complete = false;
    save_manifest(&manifest)?;
    Ok(manifest)
}

pub fn init_profile_system() -> Result<(), String> {
    let manifest = migrate_legacy_if_needed()?;
    let active = manifest
        .active_profile_id
        .clone()
        .or(manifest.profiles.first().map(|p| p.id.clone()));
    if let Some(id) = active {
        set_active_profile_id(&id);
    }
    Ok(())
}

pub fn merged_settings_from_disk() -> Result<AppSettings, String> {
    init_profile_system()?;
    let manifest = load_manifest()?;
    let active_id = manifest
        .active_profile_id
        .clone()
        .or_else(active_profile_id)
        .or_else(|| manifest.profiles.first().map(|p| p.id.clone()));

    if active_id.is_none() {
        let mut settings = crate::library::default_settings();
        if global_settings_path().is_file() {
            let text =
                std::fs::read_to_string(global_settings_path()).map_err(|e| e.to_string())?;
            if let Ok(global) = serde_json::from_str::<GlobalAppSettings>(&text) {
                settings.cache_dir = global.cache_dir;
                settings.binary_tag = global.binary_tag;
                settings.binary_archive = global.binary_archive;
                settings.binary_sha256 = global.binary_sha256;
                settings.model_pack = global.model_pack;
                settings.model_gguf = global.model_gguf;
                settings.model_sha256 = global.model_sha256;
                settings.server_host = global.server_host;
                settings.server_port = global.server_port;
                settings.output_device = global.output_device;
                settings.audio_latency_ms = global.audio_latency_ms;
            }
        }
        return Ok(settings);
    }

    let active_id = active_id.unwrap();
    set_active_profile_id(&active_id);

    let defaults = crate::library::default_settings();
    let mut settings = if global_settings_path().is_file() {
        let text = std::fs::read_to_string(global_settings_path()).map_err(|e| e.to_string())?;
        if let Ok(global) = serde_json::from_str::<GlobalAppSettings>(&text) {
            AppSettings {
                projects_dir: defaults.projects_dir.clone(),
                cache_dir: global.cache_dir,
                binary_tag: global.binary_tag,
                binary_archive: global.binary_archive,
                binary_sha256: global.binary_sha256,
                model_pack: global.model_pack,
                model_gguf: global.model_gguf,
                model_sha256: global.model_sha256,
                server_host: global.server_host,
                server_port: global.server_port,
                output_device: global.output_device,
                audio_latency_ms: global.audio_latency_ms,
                stem_separator: defaults.stem_separator.clone(),
                cc_by_nc_accepted: false,
                yue2_license_accepted: false,
                accepted_separator_licenses: Default::default(),
                separator_time_stats: Default::default(),
                local_yue2_enabled: defaults.local_yue2_enabled,
                yue2_ar_lora: None,
                yue2_nar_lora: None,
                yue2_ar_lora_scale: 1.0,
                yue2_nar_lora_scale: 1.0,
            }
        } else {
            serde_json::from_str::<AppSettings>(&text).map_err(|e| e.to_string())?
        }
    } else if settings_path().is_file() {
        let text = std::fs::read_to_string(settings_path()).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| e.to_string())?
    } else {
        defaults
    };

    let profile = load_profile_settings(&active_id)?;
    apply_profile_to_settings(&mut settings, &profile, &active_id);
    Ok(settings)
}

pub fn count_projects(id: &str) -> u32 {
    let root = profile_projects_root(id);
    if !root.is_dir() {
        return 0;
    }
    std::fs::read_dir(root)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().join("project.json").is_file())
                .count() as u32
        })
        .unwrap_or(0)
}

pub fn count_accepted_contracts(id: &str) -> u32 {
    let ps = load_profile_settings(id).unwrap_or_default();
    let mut n = 0u32;
    if ps.yue2_license_accepted {
        n += 1;
    }
    if ps.cc_by_nc_accepted {
        n += 1;
    }
    n += ps
        .accepted_separator_licenses
        .values()
        .filter(|v| **v)
        .count() as u32;
    n += ps.engine_contract_acceptances.len() as u32;
    n
}

const ENGINE_LICENSES_201_JSON: &str =
    include_str!("../../packages/stem-providers/src/data/licences-moteurs-201.json");

/// Single source shared with TS (`wired-commercial-license-ids.json`).
const WIRED_COMMERCIAL_LICENSE_IDS_JSON: &str =
    include_str!("../../packages/stem-providers/src/data/wired-commercial-license-ids.json");

fn wired_commercial_license_ids() -> Vec<String> {
    serde_json::from_str(WIRED_COMMERCIAL_LICENSE_IDS_JSON).unwrap_or_default()
}

const COMMERCIAL_RESERVED_STATUT_FR: &str = "disponible avec réserve";

#[derive(Debug, Clone, Deserialize)]
struct EngineLicenseRow201Minimal {
    id: String,
    statut: String,
    date_verification: String,
}

fn license_row_qualifies_for_commercial_reserved(row: &EngineLicenseRow201Minimal) -> bool {
    !row.date_verification.trim().is_empty()
        && row.statut.trim().to_lowercase() == COMMERCIAL_RESERVED_STATUT_FR
}

pub fn commercial_creation_allowed() -> bool {
    let rows: Vec<EngineLicenseRow201Minimal> =
        serde_json::from_str(ENGINE_LICENSES_201_JSON).unwrap_or_default();
    let by_id: std::collections::HashMap<&str, &EngineLicenseRow201Minimal> =
        rows.iter().map(|r| (r.id.as_str(), r)).collect();
    wired_commercial_license_ids().iter().any(|license_id| {
        by_id
            .get(license_id.as_str())
            .map(|row| license_row_qualifies_for_commercial_reserved(row))
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-profiles-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn wired_commercial_license_ids_non_empty() {
        let ids = wired_commercial_license_ids();
        assert!(
            !ids.is_empty(),
            "wired-commercial-license-ids.json must list at least one id"
        );
        assert!(ids.iter().all(|id| !id.trim().is_empty()));
    }

    #[test]
    fn commercial_creation_disallowed_on_production_license_rows() {
        assert!(!commercial_creation_allowed());
    }

    #[test]
    fn commercial_reserved_requires_statut_and_date() {
        let row = EngineLicenseRow201Minimal {
            id: "yue2_3b".into(),
            statut: "non commercial".into(),
            date_verification: "2026-09-30".into(),
        };
        assert!(!license_row_qualifies_for_commercial_reserved(&row));
        let ok = EngineLicenseRow201Minimal {
            id: "htdemucs".into(),
            statut: "disponible avec réserve".into(),
            date_verification: "2026-09-30".into(),
        };
        assert!(license_row_qualifies_for_commercial_reserved(&ok));
    }

    #[test]
    fn migration_moves_legacy_projects_and_keeps_contracts() {
        let root = temp_root();
        unsafe {
            std::env::set_var("SONG_MAKER_DOCUMENTS_DIR", root.as_os_str());
        }
        let legacy_projects = root.join("projects");
        fs::create_dir_all(legacy_projects.join("proj-a")).unwrap();
        fs::write(
            legacy_projects.join("proj-a").join("project.json"),
            r#"{"schema":"song-maker.project","schemaVersion":1,"id":"proj-a","title":"A","createdAt":"2020","updatedAt":"2020","sampleRate":48000,"channels":2,"bitDepth":16,"style":"","lyrics":"","cot":"full"}"#,
        )
        .unwrap();
        let settings = format!(
            r#"{{"projectsDir":"{}","cacheDir":"/tmp/cache","binaryTag":"t","binaryArchive":"a","binarySha256":"s","modelPack":"q4","modelGguf":"m","modelSha256":"x","serverHost":"127.0.0.1","serverPort":8787,"yue2LicenseAccepted":true,"ccByNcAccepted":true,"acceptedSeparatorLicenses":{{"htdemucs":true}}}}"#,
            legacy_projects.display()
        );
        fs::write(root.join("settings.json"), settings).unwrap();

        let manifest = migrate_legacy_if_needed().expect("migrate");
        assert_eq!(manifest.profiles.len(), 1);
        assert_eq!(manifest.profiles[0].name, MIGRATION_DEFAULT_NAME);
        let id = &manifest.profiles[0].id;
        assert!(profile_projects_root(id).join("proj-a").is_dir());
        let ps = load_profile_settings(id).expect("profile settings");
        assert!(ps.yue2_license_accepted);
        assert!(ps.cc_by_nc_accepted);
        assert_eq!(ps.accepted_separator_licenses.get("htdemucs"), Some(&true));
        unsafe {
            std::env::remove_var("SONG_MAKER_DOCUMENTS_DIR");
        }
    }
}
