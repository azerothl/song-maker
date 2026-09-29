use crate::models::AppSettings;
use crate::pins::HTDEMUCS_GGUF;

pub fn separator_display_name_fr(id: &str) -> &'static str {
    match id {
        "htdemucs" => "HTDemucs (4 stems)",
        "htdemucs_6s" => "HTDemucs 6 stems (ONNX)",
        "bs_roformer" => "BS-RoFormer ep368",
        "mel_band_roformer" => "Mel-Band RoFormer Kim Vocal 2",
        _ => "ce modèle de séparation",
    }
}

pub fn require_separator_license(settings: &AppSettings, id: &str) -> Result<(), String> {
    if settings
        .accepted_separator_licenses
        .get(id)
        .copied()
        .unwrap_or(false)
    {
        return Ok(());
    }
    let label = separator_display_name_fr(id);
    Err(format!(
        "Téléchargement bloqué : cochez « J’ai lu la licence » pour {label} avant de continuer."
    ))
}

pub fn artifact_requires_htdemucs_license(artifact_name: &str) -> bool {
    artifact_name == HTDEMUCS_GGUF || artifact_name.to_ascii_lowercase().contains("htdemucs")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::default_settings;

    #[test]
    fn blocks_without_acceptance_with_human_label() {
        let settings = default_settings();
        let err = require_separator_license(&settings, "htdemucs_6s").unwrap_err();
        assert!(err.contains("HTDemucs 6 stems"));
        assert!(!err.contains("htdemucs_6s"));
    }

    #[test]
    fn detects_htdemucs_artifact_name() {
        assert!(artifact_requires_htdemucs_license(HTDEMUCS_GGUF));
        assert!(!artifact_requires_htdemucs_license("yue2-3b-q4.gguf"));
    }
}
