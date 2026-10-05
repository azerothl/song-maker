//! Short transactions for project documents and generation folder reservation.
use parking_lot::ReentrantMutex;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

pub fn lock_for(folder: &Path) -> Arc<ReentrantMutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<ReentrantMutex<()>>>>> = OnceLock::new();
    LOCKS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(folder.to_path_buf())
        .or_default()
        .clone()
}

pub fn with_lock<T>(folder: &Path, work: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let lock = lock_for(folder);
    let _guard = lock.lock();
    work()
}
