use crate::commands::AppState;
use crate::paths::now_iso;
use crate::profile_switch::{ensure_profile_creation_allowed, ensure_profile_switch_allowed};
use crate::profiles::{
    self, commercial_creation_allowed, count_accepted_contracts, count_projects, load_manifest,
    save_manifest, ProfileMeta, ProfilesManifest, MAX_PROFILES,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub project_count: u32,
    pub accepted_contract_count: u32,
    pub is_last_used: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    pub profiles: Vec<ProfileSummary>,
    pub active_profile_id: Option<String>,
    pub last_used_profile_id: Option<String>,
    pub onboarding_complete: bool,
    pub migration_banner_visible: bool,
    pub commercial_creation_allowed: bool,
    pub max_profiles: usize,
}

fn summarize(manifest: &ProfilesManifest) -> Vec<ProfileSummary> {
    manifest
        .profiles
        .iter()
        .map(|p| ProfileSummary {
            id: p.id.clone(),
            name: p.name.clone(),
            kind: p.kind.clone(),
            project_count: count_projects(&p.id),
            accepted_contract_count: count_accepted_contracts(&p.id),
            is_last_used: manifest.last_used_profile_id.as_deref() == Some(p.id.as_str()),
            is_active: manifest.active_profile_id.as_deref() == Some(p.id.as_str()),
        })
        .collect()
}

#[tauri::command]
pub fn get_profiles_state() -> Result<ProfilesState, String> {
    let _ = profiles::init_profile_system();
    let manifest = load_manifest()?;
    Ok(ProfilesState {
        profiles: summarize(&manifest),
        active_profile_id: manifest.active_profile_id.clone(),
        last_used_profile_id: manifest.last_used_profile_id.clone(),
        onboarding_complete: manifest.onboarding_complete,
        migration_banner_visible: !manifest.migration_banner_dismissed
            && manifest
                .profiles
                .iter()
                .any(|p| p.name == profiles::MIGRATION_DEFAULT_NAME),
        commercial_creation_allowed: commercial_creation_allowed(),
        max_profiles: MAX_PROFILES,
    })
}

#[tauri::command]
pub fn create_profile(
    state: tauri::State<'_, AppState>,
    name: String,
    kind: String,
) -> Result<ProfileSummary, String> {
    let job = state.queue.status();
    let export_busy = state
        .profile_export_busy
        .load(std::sync::atomic::Ordering::SeqCst);
    ensure_profile_creation_allowed(&job, export_busy)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Le nom du profil est obligatoire.".into());
    }
    if trimmed.len() > 80 {
        return Err("Nom de profil trop long (80 caractères max).".into());
    }
    let kind_norm = kind.trim().to_ascii_lowercase();
    if kind_norm != "hobby" && kind_norm != "commercial" {
        return Err("Type de profil inconnu.".into());
    }
    if kind_norm == "commercial" && !commercial_creation_allowed() {
        return Err(
            "Profil Commercial indisponible : aucun moteur compatible n'est proposé.".into(),
        );
    }
    let mut manifest = load_manifest()?;
    if manifest.profiles.len() >= MAX_PROFILES {
        return Err(format!("Maximum {MAX_PROFILES} profils atteint."));
    }
    let id = profiles::next_profile_id(&manifest);
    let meta = ProfileMeta {
        id: id.clone(),
        name: trimmed.to_string(),
        kind: kind_norm,
        created_at: now_iso(),
    };
    profiles::save_profile_settings(&id, &Default::default())?;
    manifest.profiles.push(meta);
    save_manifest(&manifest)?;
    let summary = summarize(&manifest)
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Profil créé mais introuvable.".to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn rename_profile(id: String, name: String) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Le nom du profil est obligatoire.".into());
    }
    if trimmed.len() > 80 {
        return Err("Nom de profil trop long (80 caractères max).".into());
    }
    let mut manifest = load_manifest()?;
    let duplicate = manifest
        .profiles
        .iter()
        .any(|p| p.id != id && p.name.eq_ignore_ascii_case(trimmed));
    if duplicate {
        return Err("Ce nom est déjà utilisé par un autre profil.".into());
    }
    let row = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Profil introuvable.".to_string())?;
    row.name = trimmed.to_string();
    save_manifest(&manifest)
}

#[tauri::command]
pub fn activate_profile(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let job = state.queue.status();
    let export_busy = state
        .profile_export_busy
        .load(std::sync::atomic::Ordering::SeqCst);
    ensure_profile_switch_allowed(&job, export_busy)?;
    let mut manifest = load_manifest()?;
    if !manifest.profiles.iter().any(|p| p.id == id) {
        return Err("Profil introuvable.".to_string());
    }
    manifest.active_profile_id = Some(id.clone());
    manifest.last_used_profile_id = Some(id.clone());
    manifest.onboarding_complete = true;
    save_manifest(&manifest)?;
    profiles::set_active_profile_id(&id);
    Ok(())
}

#[tauri::command]
pub fn dismiss_profile_migration_banner() -> Result<(), String> {
    let mut manifest = load_manifest()?;
    manifest.migration_banner_dismissed = true;
    save_manifest(&manifest)
}

#[tauri::command]
pub fn accept_engine_contract(
    profile_id: String,
    engine_id: String,
    text_fingerprint: String,
    text_version: String,
) -> Result<(), String> {
    let mut settings = profiles::load_profile_settings(&profile_id)?;
    settings.engine_contract_acceptances.insert(
        engine_id,
        profiles::EngineContractAcceptance {
            text_fingerprint,
            accepted_at: now_iso(),
            text_version,
        },
    );
    profiles::save_profile_settings(&profile_id, &settings)
}
