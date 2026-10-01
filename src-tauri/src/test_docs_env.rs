//! Serializes tests that mutate `SONG_MAKER_DOCUMENTS_DIR` (parallel `cargo test`).

#[cfg(test)]
pub mod guard {
    use std::path::PathBuf;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    pub fn lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub struct TempDocs {
        pub root: PathBuf,
        _guard: MutexGuard<'static, ()>,
    }

    impl TempDocs {
        pub fn new(label: &str) -> Self {
            let guard = lock();
            let root = std::env::temp_dir().join(format!(
                "song-maker-test-{label}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&root).unwrap();
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
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
}
