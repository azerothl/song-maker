//! Spike VST3 : scan + chargement d’un module (`GetPluginFactory`) derrière flag (#326).
//!
//! **Pas un hôte DAW.** Pas de process audio plugin, pas d’éditeur, pas d’AU.
//! Activer avec `SONG_MAKER_VST3_SPIKE=1`. Sans flag : aucune UI « VST disponible ».

use crate::library::{load_project, project_folder};
use crate::models::{ExperimentalVst3Insert, MixDoc};
use crate::paths::atomic_write_json;
use libloading::{Library, Symbol};
use serde::Serialize;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::process::Command;

const FLAG_ENV: &str = "SONG_MAKER_VST3_SPIKE";
const SCAN_ENV: &str = "SONG_MAKER_VST3_SCAN_DIR";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3SpikeStatus {
    pub enabled: bool,
    pub is_host: bool,
    pub notes_fr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3CatalogEntry {
    pub path: String,
    pub name: String,
    pub binary_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3LoadResult {
    pub path: String,
    pub factory_present: bool,
    pub isolated_process: bool,
    pub notes_fr: String,
}

pub fn spike_enabled() -> bool {
    matches!(
        std::env::var(FLAG_ENV).as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE") | Ok("yes")
    )
}

fn require_enabled() -> Result<(), String> {
    if spike_enabled() {
        Ok(())
    } else {
        Err(format!(
            "Spike VST3 désactivé. Définir {FLAG_ENV}=1. Ce n’est pas un hôte DAW."
        ))
    }
}

fn notes_status() -> String {
    "Spike expérimental : scan de bundles .vst3 et chargement de GetPluginFactory. Pas d’hôte, pas d’AU, pas de process audio plugin, pas d’UI produit « VST disponible ».".into()
}

pub fn default_scan_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(extra) = std::env::var(SCAN_ENV) {
        for part in extra.split(if cfg!(windows) { ';' } else { ':' }) {
            let p = part.trim();
            if !p.is_empty() {
                roots.push(PathBuf::from(p));
            }
        }
    }
    #[cfg(windows)]
    {
        roots.push(PathBuf::from(r"C:\Program Files\Common Files\VST3"));
        roots.push(PathBuf::from(r"C:\Program Files (x86)\Common Files\VST3"));
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            roots.push(PathBuf::from(local_app_data).join(r"Programs\Common\VST3"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        roots.push(PathBuf::from("/Library/Audio/Plug-Ins/VST3"));
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join("Library/Audio/Plug-Ins/VST3"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        roots.push(PathBuf::from("/usr/lib/vst3"));
        roots.push(PathBuf::from("/usr/local/lib/vst3"));
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".vst3"));
        }
    }
    roots
}

pub fn binary_in_bundle(bundle: &Path) -> Option<PathBuf> {
    if bundle.is_file() {
        return Some(bundle.to_path_buf());
    }
    let contents = bundle.join("Contents");
    let candidates = [
        contents.join("x86_64-linux"),
        contents.join("aarch64-linux"),
        contents.join("x86_64-win"),
        contents.join("arm64-win"),
        contents.join("MacOS"),
    ];
    for dir in candidates {
        if !dir.is_dir() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

pub fn scan_roots(roots: &[PathBuf]) -> Vec<Vst3CatalogEntry> {
    let mut out = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }
        let Ok(rd) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in rd.flatten() {
            let path = entry.path();
            let is_bundle = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("vst3"));
            if !is_bundle && !path.is_dir() {
                continue;
            }
            if !is_bundle {
                continue;
            }
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("plugin")
                .to_string();
            let binary = binary_in_bundle(&path);
            out.push(Vst3CatalogEntry {
                path: path.display().to_string(),
                name,
                binary_path: binary.map(|p| p.display().to_string()),
            });
        }
    }
    out
}

/// Charge le module et cherche le symbole VST3 `GetPluginFactory`.
pub fn load_factory(binary: &Path) -> Result<bool, String> {
    unsafe {
        // SAFETY: spike only — we dlopen a user-selected plugin binary and
        // look up GetPluginFactory. Instantiation / process is not done.
        let lib =
            Library::new(binary).map_err(|e| format!("Chargement module VST3 impossible : {e}"))?;
        let found: Result<Symbol<unsafe extern "C" fn() -> *mut c_void>, _> =
            lib.get(b"GetPluginFactory\0");
        Ok(found.is_ok())
    }
}

/// Code de sortie pour `song-maker --vst3-spike-probe <binaire>`.
pub fn probe_exit(binary: &str) -> i32 {
    if binary.is_empty() {
        return 1;
    }
    match load_factory(Path::new(binary)) {
        Ok(true) => 0,
        Ok(false) => 3,
        Err(_) => 2,
    }
}

fn load_isolated(binary: &Path) -> Vst3LoadResult {
    let exe = std::env::current_exe().ok();
    let mut isolated = false;
    let mut factory = false;
    let mut notes = String::new();
    if let Some(exe) = exe {
        if let Ok(out) = Command::new(&exe)
            .arg("--vst3-spike-probe")
            .arg(binary)
            .output()
        {
            isolated = true;
            match out.status.code() {
                Some(0) => factory = true,
                Some(3) => {
                    factory = false;
                    notes = "Module chargé, GetPluginFactory absent.".into();
                }
                Some(2) => {
                    isolated = true;
                    notes = "Le sous-processus n’a pas pu charger le module.".into();
                }
                _ => {
                    isolated = false;
                }
            }
        }
    }
    if !isolated {
        match load_factory(binary) {
            Ok(true) => {
                factory = true;
                notes = "Chargé in-process (le binaire n’a pas isolé le probe).".into();
            }
            Ok(false) => {
                factory = false;
                notes = "Module chargé in-process, GetPluginFactory absent.".into();
            }
            Err(e) => notes = e,
        }
    } else if notes.is_empty() {
        notes = if factory {
            "GetPluginFactory présent (sous-processus). Pas de process audio.".into()
        } else {
            "Chargement isolé sans factory.".into()
        };
    }
    Vst3LoadResult {
        path: binary.display().to_string(),
        factory_present: factory,
        isolated_process: isolated,
        notes_fr: notes,
    }
}

#[tauri::command]
pub fn vst3_spike_status() -> Vst3SpikeStatus {
    Vst3SpikeStatus {
        enabled: spike_enabled(),
        is_host: false,
        notes_fr: notes_status(),
    }
}

#[tauri::command]
pub fn vst3_spike_scan() -> Result<Vec<Vst3CatalogEntry>, String> {
    require_enabled()?;
    Ok(scan_roots(&default_scan_roots()))
}

#[tauri::command]
pub fn vst3_spike_load(path: String) -> Result<Vst3LoadResult, String> {
    require_enabled()?;
    let p = PathBuf::from(path.trim());
    if p.as_os_str().is_empty() {
        return Err("Chemin plugin vide.".into());
    }
    let binary = binary_in_bundle(&p).unwrap_or(p);
    if !binary.is_file() {
        return Err(format!("Binaire VST3 introuvable : {}", binary.display()));
    }
    Ok(load_isolated(&binary))
}

#[tauri::command]
pub fn vst3_spike_attach(
    project_id: String,
    track_id: String,
    path: String,
) -> Result<MixDoc, String> {
    require_enabled()?;
    let loaded = vst3_spike_load(path)?;
    let folder = project_folder(&project_id);
    let doc = load_project(&folder)?;
    let mix_id = doc
        .active_mix_id
        .as_ref()
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let mix_path = folder.join("mixes").join(format!("{mix_id}.json"));
    let text = std::fs::read_to_string(&mix_path).map_err(|e| e.to_string())?;
    let mut mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let track = mix
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or_else(|| "Piste introuvable.".to_string())?;
    track.experimental_vst3_insert = Some(ExperimentalVst3Insert {
        plugin_path: loaded.path.clone(),
        factory_present: loaded.factory_present,
        state_b64: None,
        notes_fr: "Métadonnée spike uniquement — le bake mix ignore ce champ (pas un hôte).".into(),
    });
    atomic_write_json(&mix_path, &mix)?;
    Ok(mix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_without_flag() {
        // May be set in the environment; the error string is the contract.
        if spike_enabled() {
            return;
        }
        assert!(require_enabled().unwrap_err().contains("désactivé"));
        assert!(!vst3_spike_status().is_host);
    }

    #[test]
    fn scan_fake_bundle() {
        let dir = std::env::temp_dir().join(format!("song-maker-vst3-{}", uuid::Uuid::new_v4()));
        let bundle = dir.join("Stub.vst3");
        let bin_dir = bundle.join("Contents").join("x86_64-linux");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let bin = bin_dir.join("Stub.so");
        std::fs::write(&bin, b"not-a-real-plugin").unwrap();
        let found = scan_roots(std::slice::from_ref(&dir));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Stub");
        assert!(found[0].binary_path.as_ref().unwrap().ends_with("Stub.so"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_compiled_stub_factory() {
        let dir =
            std::env::temp_dir().join(format!("song-maker-vst3-stub-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("stub.rs");
        std::fs::write(
            &src,
            r#"
            #[no_mangle]
            pub extern "C" fn GetPluginFactory() -> *mut std::ffi::c_void {
                1 as *mut std::ffi::c_void
            }
            "#,
        )
        .unwrap();
        let so = dir.join("stub.so");
        let status = std::process::Command::new("rustc")
            .args(["--crate-type", "cdylib", "-o"])
            .arg(&so)
            .arg(&src)
            .status()
            .expect("rustc");
        assert!(status.success());
        assert!(load_factory(&so).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
