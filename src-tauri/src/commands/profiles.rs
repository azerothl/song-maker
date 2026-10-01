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

pub(crate) fn create_profile_inner(
    state: &AppState,
    name: String,
    kind: String,
) -> Result<ProfileSummary, String> {
    let job = state.queue.status();
    let export_busy = state
        .profile_export_busy
        .load(std::sync::atomic::Ordering::SeqCst);
    ensure_profile_creation_allowed(&job, export_busy)?;
    let trimmed = name.trim();
    profiles::validate_profile_name_trimmed(trimmed)?;
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
pub fn create_profile(
    state: tauri::State<'_, AppState>,
    name: String,
    kind: String,
) -> Result<ProfileSummary, String> {
    create_profile_inner(&state, name, kind)
}

#[tauri::command]
pub fn rename_profile(id: String, name: String) -> Result<(), String> {
    let trimmed = name.trim();
    profiles::validate_profile_name_trimmed(trimmed)?;
    let mut manifest = load_manifest()?;
    let duplicate = manifest
        .profiles
        .iter()
        .any(|p| p.id != id && profiles::profile_names_collide(&p.name, trimmed));
    if duplicate {
        return Err(profiles::PROFILE_RENAME_ERROR_DUPLICATE.into());
    }
    let row = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Profil introuvable.".to_string())?;
    row.name = trimmed.to_string();
    save_manifest(&manifest)
}

pub(crate) fn activate_profile_inner(state: &AppState, id: String) -> Result<(), String> {
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
pub fn activate_profile(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    activate_profile_inner(&state, id)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::AppState;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::MutexGuard;

    struct TempDocs {
        root: PathBuf,
        _guard: MutexGuard<'static, ()>,
    }

    impl TempDocs {
        fn new(label: &str) -> Self {
            // Share the lock with `profiles::tests` — both mutate process-global env.
            let guard = profiles::documents_env_lock();
            let root = std::env::temp_dir().join(format!(
                "song-maker-cmd-profiles-{label}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&root).unwrap();
            unsafe {
                std::env::set_var("SONG_MAKER_DOCUMENTS_DIR", root.as_os_str());
            }
            Self {
                root,
                _guard: guard,
            }
        }
    }

    impl Drop for TempDocs {
        fn drop(&mut self) {
            unsafe {
                std::env::remove_var("SONG_MAKER_DOCUMENTS_DIR");
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn seed_two_profiles() -> (String, String) {
        let a = ProfileMeta {
            id: "profile-001".into(),
            name: "Hobby A".into(),
            kind: "hobby".into(),
            created_at: now_iso(),
        };
        let b = ProfileMeta {
            id: "profile-002".into(),
            name: "Hobby B".into(),
            kind: "hobby".into(),
            created_at: now_iso(),
        };
        profiles::save_profile_settings(&a.id, &Default::default()).unwrap();
        profiles::save_profile_settings(&b.id, &Default::default()).unwrap();
        let manifest = ProfilesManifest {
            schema_version: 1,
            profiles: vec![a.clone(), b.clone()],
            active_profile_id: Some(a.id.clone()),
            last_used_profile_id: Some(a.id.clone()),
            onboarding_complete: true,
            migration_banner_dismissed: true,
        };
        save_manifest(&manifest).unwrap();
        profiles::set_active_profile_id(&a.id);
        (a.id, b.id)
    }

    fn seed_empty_onboarding() {
        save_manifest(&ProfilesManifest {
            schema_version: 1,
            profiles: vec![],
            active_profile_id: None,
            last_used_profile_id: None,
            onboarding_complete: false,
            migration_banner_dismissed: true,
        })
        .unwrap();
    }

    #[test]
    fn activate_profile_refuses_during_generation_then_succeeds() {
        let _docs = TempDocs::new("gen");
        let (_active, target) = seed_two_profiles();
        let state = AppState::default();

        state
            .queue
            .set_state("generating", "Génération", Some("proj".into()));
        let err = activate_profile_inner(&state, target.clone()).unwrap_err();
        assert!(err.contains("génération"), "{err}");

        state.queue.clear_current();
        activate_profile_inner(&state, target.clone()).unwrap();
        let manifest = load_manifest().unwrap();
        assert_eq!(manifest.active_profile_id.as_deref(), Some(target.as_str()));
    }

    #[test]
    fn activate_profile_refuses_during_separation_then_succeeds() {
        let _docs = TempDocs::new("sep");
        let (_active, target) = seed_two_profiles();
        let state = AppState::default();

        state
            .queue
            .set_state("separating", "Séparation", Some("proj".into()));
        let err = activate_profile_inner(&state, target.clone()).unwrap_err();
        assert!(err.contains("séparation"), "{err}");

        state.queue.clear_current();
        activate_profile_inner(&state, target.clone()).unwrap();
        assert_eq!(
            load_manifest().unwrap().active_profile_id.as_deref(),
            Some(target.as_str())
        );
    }

    #[test]
    fn activate_profile_refuses_during_export_then_succeeds() {
        let _docs = TempDocs::new("export");
        let (_active, target) = seed_two_profiles();
        let state = AppState::default();

        state
            .profile_export_busy
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let err = activate_profile_inner(&state, target.clone()).unwrap_err();
        assert!(err.contains("export"), "{err}");

        state
            .profile_export_busy
            .store(false, std::sync::atomic::Ordering::SeqCst);
        activate_profile_inner(&state, target.clone()).unwrap();
        assert_eq!(
            load_manifest().unwrap().active_profile_id.as_deref(),
            Some(target.as_str())
        );
    }

    #[test]
    fn onboarding_first_profile_choice_refuses_while_task_running_then_succeeds() {
        let _docs = TempDocs::new("onboard");
        seed_empty_onboarding();
        let state = AppState::default();

        state
            .queue
            .set_state("generating", "Génération", Some("proj".into()));
        let create_err =
            create_profile_inner(&state, "Mon Hobby".into(), "hobby".into()).unwrap_err();
        assert!(
            create_err.contains("créer un profil") && create_err.contains("génération"),
            "{create_err}"
        );
        assert!(load_manifest().unwrap().profiles.is_empty());

        state.queue.clear_current();
        let created = create_profile_inner(&state, "Mon Hobby".into(), "hobby".into()).unwrap();
        activate_profile_inner(&state, created.id.clone()).unwrap();

        let manifest = load_manifest().unwrap();
        assert!(manifest.onboarding_complete);
        assert_eq!(
            manifest.active_profile_id.as_deref(),
            Some(created.id.as_str())
        );
        assert_eq!(manifest.profiles.len(), 1);
    }

    #[test]
    fn onboarding_activate_existing_refuses_while_export_busy() {
        let _docs = TempDocs::new("onboard-export");
        let (active, target) = seed_two_profiles();
        // Simulate unfinished onboarding with existing migration profile.
        let mut manifest = load_manifest().unwrap();
        manifest.onboarding_complete = false;
        manifest.active_profile_id = Some(active);
        save_manifest(&manifest).unwrap();

        let state = AppState::default();
        state
            .profile_export_busy
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let err = activate_profile_inner(&state, target).unwrap_err();
        assert!(err.contains("export"), "{err}");
        assert!(!load_manifest().unwrap().onboarding_complete);
    }

    #[test]
    fn rename_accepts_long_accented_name_by_char_count() {
        let _docs = TempDocs::new("rename-long");
        let (_a, id_b) = seed_two_profiles();
        let name = "é".repeat(41);
        assert_eq!(profiles::profile_name_char_count(&name), 41);
        assert!(name.len() > profiles::PROFILE_NAME_MAX_CHARS);
        rename_profile(id_b.clone(), name.clone()).unwrap();
        let manifest = load_manifest().unwrap();
        let row = manifest.profiles.iter().find(|p| p.id == id_b).unwrap();
        assert_eq!(row.name, name);
    }

    #[test]
    fn rename_rejects_duplicate_with_unicode_case() {
        let _docs = TempDocs::new("rename-dup");
        let (id_a, id_b) = seed_two_profiles();
        let mut manifest = load_manifest().unwrap();
        manifest
            .profiles
            .iter_mut()
            .find(|p| p.id == id_a)
            .unwrap()
            .name = "Été".into();
        save_manifest(&manifest).unwrap();
        let err = rename_profile(id_b, "ÉTÉ".into()).unwrap_err();
        assert_eq!(err, profiles::PROFILE_RENAME_ERROR_DUPLICATE);
    }
}
