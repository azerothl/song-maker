//! House-model desktop provider hook (#323).
//! No decoder is wired: even if a future cache file appears, generation stays refused.

use std::path::Path;

pub const RUNTIME_UNAVAILABLE: &str = "unavailable";
pub const RUNTIME_WEIGHTS_UNWIRED: &str = "weights_present_unwired";

pub const REFUSE_GENERATE_FR: &str = "\
Le modèle maison ne génère pas : aucun runtime n’est branché (desktopProvider null). \
La recette hors app est scripts/model-training/. Ce n’est pas un nouvel appel YuE2.";

pub const REFUSE_SELECT_FR: &str = "\
Impossible de sélectionner le modèle maison : pas de poids ni de décodeur. \
Voir Paramètres → Modèle et docs/model-training-roadmap.md.";

/// Probe cache for a future provider drop. Absence → unavailable; presence still unwired.
pub fn runtime_status(cache: &Path) -> String {
    let dir = cache.join("house-model");
    let weights = dir.join("weights.bin");
    let manifest = dir.join("provider.json");
    let weights_ok = weights.is_file() && weights.metadata().map(|m| m.len() > 0).unwrap_or(false);
    if weights_ok || manifest.is_file() {
        return RUNTIME_WEIGHTS_UNWIRED.into();
    }
    RUNTIME_UNAVAILABLE.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn empty_cache_is_unavailable() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/house-model-empty-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("tmp");
        assert_eq!(runtime_status(&dir), RUNTIME_UNAVAILABLE);
    }

    #[test]
    fn dropped_manifest_is_still_unwired() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/house-model-unwired-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("house-model")).expect("tmp");
        fs::write(
            dir.join("house-model/provider.json"),
            b"{\"desktopProvider\":null}",
        )
        .expect("write");
        assert_eq!(runtime_status(&dir), RUNTIME_WEIGHTS_UNWIRED);
    }
}
