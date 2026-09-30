//! Block profile activation during generation, separation, or export (#201).

use crate::models::JobStatus;

pub fn profile_switch_blocked(job: &JobStatus, export_busy: bool) -> Option<&'static str> {
    if export_busy {
        return Some("export");
    }
    let state = job.state.trim().to_ascii_lowercase();
    if state.is_empty() || state == "idle" || state == "failed" || state == "cancelled" {
        return None;
    }
    if state == "separating" || state == "importing_tracks" {
        return Some("separation");
    }
    if state == "queued" || state == "preparing" || state == "generating" {
        return Some("generation");
    }
    None
}

pub fn profile_activation_error(kind: &str) -> String {
    profile_operation_blocked_error(kind, "changer de profil")
}

pub fn profile_creation_blocked_error(kind: &str) -> String {
    profile_operation_blocked_error(kind, "créer un profil")
}

fn profile_operation_blocked_error(kind: &str, action: &str) -> String {
    match kind {
        "export" => format!("Impossible de {action} pendant un export."),
        "separation" => format!("Impossible de {action} pendant une séparation de stems."),
        "generation" => format!("Impossible de {action} pendant une génération."),
        _ => format!("Impossible de {action} pour le moment."),
    }
}

pub fn ensure_profile_switch_allowed(job: &JobStatus, export_busy: bool) -> Result<(), String> {
    match profile_switch_blocked(job, export_busy) {
        Some(kind) => Err(profile_activation_error(kind)),
        None => Ok(()),
    }
}

pub fn ensure_profile_creation_allowed(job: &JobStatus, export_busy: bool) -> Result<(), String> {
    match profile_switch_blocked(job, export_busy) {
        Some(kind) => Err(profile_creation_blocked_error(kind)),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(state: &str) -> JobStatus {
        JobStatus {
            state: state.into(),
            label: String::new(),
            project_id: None,
            queue_position: None,
            error: None,
        }
    }

    #[test]
    fn blocks_during_generation_states() {
        for s in ["queued", "preparing", "generating"] {
            assert_eq!(profile_switch_blocked(&job(s), false), Some("generation"));
        }
    }

    #[test]
    fn blocks_during_separation() {
        assert_eq!(
            profile_switch_blocked(&job("separating"), false),
            Some("separation")
        );
    }

    #[test]
    fn blocks_during_export_flag() {
        assert_eq!(profile_switch_blocked(&job("idle"), true), Some("export"));
    }

    #[test]
    fn allows_when_idle() {
        assert_eq!(profile_switch_blocked(&job("idle"), false), None);
        assert_eq!(profile_switch_blocked(&job("generated"), false), None);
    }

    #[test]
    fn blocks_profile_creation_during_generation() {
        let err = ensure_profile_creation_allowed(&job("generating"), false).unwrap_err();
        assert!(err.contains("créer un profil"));
        assert!(err.contains("génération"));
    }

    #[test]
    fn blocks_profile_creation_during_export_flag() {
        let err = ensure_profile_creation_allowed(&job("idle"), true).unwrap_err();
        assert!(err.contains("créer un profil"));
        assert!(err.contains("export"));
    }

    #[test]
    fn blocks_profile_activation_during_separation() {
        let err = ensure_profile_switch_allowed(&job("separating"), false).unwrap_err();
        assert!(err.contains("séparation"));
    }
}
