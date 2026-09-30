//! Surface Tauri : un module par domaine produit.
//!
//! `AppState` (état partagé) et la pile d'undo restent ici ; chaque `mod`
//! ci-dessous regroupe les commandes d'un domaine et ses helpers privados.
//! Le mapping vers les modules est explicite dans `lib.rs` (`generate_handler!`).

use crate::audiocpp::AudioCppServer;
use crate::queue::JobQueue;
use std::collections::BTreeMap;
use std::sync::Mutex;

pub mod capture;
pub mod generation;
pub mod jobs;
pub mod lora_training;
pub mod mix;
pub mod package;
pub mod profiles;
pub mod projects;
pub mod score;
pub mod separation;
pub mod settings;
pub mod shared;
pub mod sheetsage_cmds;
pub mod sync;
pub mod versions;

pub struct AppState {
    pub server: AudioCppServer,
    pub queue: JobQueue,
    pub undo: Mutex<UndoStacks>,
    pub setup_installing: std::sync::atomic::AtomicBool,
    pub bs_roformer_installing: std::sync::atomic::AtomicBool,
    pub bs_roformer_cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub mel_band_roformer_installing: std::sync::atomic::AtomicBool,
    pub mel_band_roformer_cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub sheetsage_installing: std::sync::atomic::AtomicBool,
    pub sheetsage_cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub sheetsage_jobs: crate::sheetsage::SheetsageJobs,
    pub lora_train_jobs: crate::lora_train::LoraTrainJobs,
    pub profile_export_busy: std::sync::atomic::AtomicBool,
}

#[derive(Default)]
pub struct UndoStacks {
    /// project_id -> (undo, redo) of MixUpdate / form snapshots as JSON
    pub stacks: BTreeMap<String, (Vec<serde_json::Value>, Vec<serde_json::Value>)>,
}

pub fn with_profile_export_busy<T>(
    state: &AppState,
    f: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    use std::sync::atomic::Ordering;
    state.profile_export_busy.store(true, Ordering::SeqCst);
    let result = f();
    state.profile_export_busy.store(false, Ordering::SeqCst);
    result
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            server: AudioCppServer::default(),
            queue: JobQueue::default(),
            undo: Mutex::new(UndoStacks::default()),
            setup_installing: std::sync::atomic::AtomicBool::new(false),
            bs_roformer_installing: std::sync::atomic::AtomicBool::new(false),
            bs_roformer_cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            mel_band_roformer_installing: std::sync::atomic::AtomicBool::new(false),
            mel_band_roformer_cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(
                false,
            )),
            sheetsage_installing: std::sync::atomic::AtomicBool::new(false),
            sheetsage_cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            sheetsage_jobs: crate::sheetsage::SheetsageJobs::default(),
            lora_train_jobs: crate::lora_train::LoraTrainJobs::default(),
            profile_export_busy: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

fn push_undo(state: &AppState, project_id: &str, snapshot: serde_json::Value) {
    let mut g = state.undo.lock().unwrap();
    let entry = g.stacks.entry(project_id.to_string()).or_default();
    entry.0.push(snapshot);
    if entry.0.len() > 100 {
        entry.0.remove(0);
    }
    entry.1.clear();
}
