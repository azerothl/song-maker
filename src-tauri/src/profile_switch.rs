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
    match kind {
        "export" => "Impossible de changer de profil pendant un export.".into(),
        "separation" => "Impossible de changer de profil pendant une séparation de stems.".into(),
        "generation" => "Impossible de changer de profil pendant une génération.".into(),
        _ => "Impossible de changer de profil pour le moment.".into(),
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
}
