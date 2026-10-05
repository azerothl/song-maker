//! File FIFO applicative : un seul HTTP à la fois vers audiocpp_server.

use crate::models::JobStatus;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct JobQueue {
    inner: Arc<Mutex<QueueInner>>,
    waiting: Arc<AtomicUsize>,
    gate: Arc<tokio::sync::Mutex<()>>,
    device: Arc<tokio::sync::RwLock<()>>,
}

pub struct RuntimeRestartGuard {
    _serial: tokio::sync::OwnedMutexGuard<()>,
    _device: tokio::sync::OwnedRwLockWriteGuard<()>,
}

struct QueueInner {
    current: Option<JobStatus>,
    cancel_requested: bool,
}

impl Default for JobQueue {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(QueueInner {
                current: None,
                cancel_requested: false,
            })),
            waiting: Arc::new(AtomicUsize::new(0)),
            gate: Arc::new(tokio::sync::Mutex::new(())),
            device: Arc::new(tokio::sync::RwLock::new(())),
        }
    }
}

impl JobQueue {
    /// Hold the audio queue while the managed runtime is restarted.
    pub async fn try_acquire_runtime_restart(&self) -> Result<RuntimeRestartGuard, String> {
        let permit = self.gate.clone().try_lock_owned().map_err(|_| {
            "Impossible de relancer le runtime pendant une tâche audio.".to_string()
        })?;
        let state = self.status().state;
        if matches!(
            state.as_str(),
            "queued" | "preparing" | "generating" | "separating" | "importing_tracks"
        ) {
            return Err("Impossible de relancer le runtime pendant une tâche audio.".into());
        }
        let device = self
            .device
            .clone()
            .try_write_owned()
            .map_err(|_| "Une génération du lot utilise le moteur audio.".to_string())?;
        Ok(RuntimeRestartGuard {
            _serial: permit,
            _device: device,
        })
    }

    /// Readers represent isolated batch workers; interactive jobs use a writer.
    /// Tokio gives a waiting writer priority over later readers.
    pub async fn acquire_batch_device(&self) -> tokio::sync::OwnedRwLockReadGuard<()> {
        self.device.clone().read_owned().await
    }

    pub fn status(&self) -> JobStatus {
        let g = self.inner.lock();
        if let Some(ref cur) = g.current {
            return cur.clone();
        }
        let waiting = self.waiting.load(Ordering::SeqCst);
        if waiting > 0 {
            return JobStatus {
                state: "queued".into(),
                label: format!("En file, position {waiting}"),
                project_id: None,
                queue_position: Some(waiting),
                error: None,
            };
        }
        JobStatus {
            state: "idle".into(),
            label: String::new(),
            project_id: None,
            queue_position: None,
            error: None,
        }
    }

    pub fn set_state(&self, state: &str, label: &str, project_id: Option<String>) {
        let mut g = self.inner.lock();
        g.current = Some(JobStatus {
            state: state.into(),
            label: label.into(),
            project_id,
            queue_position: None,
            error: None,
        });
    }

    pub fn set_error(&self, error: String) {
        let mut g = self.inner.lock();
        g.current = Some(JobStatus {
            state: "failed".into(),
            label: error.clone(),
            project_id: g.current.as_ref().and_then(|c| c.project_id.clone()),
            queue_position: None,
            error: Some(error),
        });
    }

    pub fn clear_current(&self) {
        let mut g = self.inner.lock();
        g.current = None;
        g.cancel_requested = false;
    }

    pub fn request_cancel(&self) -> String {
        let mut g = self.inner.lock();
        if g.current.is_some() {
            g.cancel_requested = true;
            return "Annulation demandée. L’appel GPU déjà lancé va jusqu’au bout ; les fichiers déjà écrits restent.".into();
        }
        "Rien à annuler.".into()
    }

    pub fn cancel_requested(&self) -> bool {
        self.inner.lock().cancel_requested
    }

    /// Exécute `work` en file FIFO. Un seul HTTP à la fois.
    pub async fn run_exclusive<F, T>(
        &self,
        project_id: Option<String>,
        label: &str,
        work: F,
    ) -> Result<T, String>
    where
        F: std::future::Future<Output = Result<T, String>>,
    {
        let position = self.waiting.fetch_add(1, Ordering::SeqCst) + 1;
        self.set_state(
            "queued",
            &format!("En file, position {position}"),
            project_id.clone(),
        );
        let _permit = self.gate.lock().await;
        let _device = self.device.write().await;
        self.waiting.fetch_sub(1, Ordering::SeqCst);
        {
            let mut g = self.inner.lock();
            g.cancel_requested = false;
        }
        self.set_state("preparing", label, project_id.clone());
        let result = work.await;
        match &result {
            Ok(_) => {}
            Err(e) if e == "cancelled" => {
                self.set_state("cancelled", "Annulé", project_id);
            }
            Err(e) => self.set_error(e.clone()),
        }
        result
    }
}

#[cfg(test)]
mod resource_tests {
    use super::*;

    #[tokio::test]
    async fn interactive_runtime_waits_for_every_batch_worker() {
        let queue = JobQueue::default();
        let first = queue.acquire_batch_device().await;
        let second = queue.acquire_batch_device().await;
        assert!(queue.try_acquire_runtime_restart().await.is_err());
        drop(first);
        assert!(queue.try_acquire_runtime_restart().await.is_err());
        drop(second);
        assert!(queue.try_acquire_runtime_restart().await.is_ok());
    }

    #[test]
    fn cancelling_one_worker_does_not_cancel_another() {
        let first = JobQueue::default();
        let second = JobQueue::default();
        first.set_state("generating", "A", None);
        second.set_state("generating", "B", None);
        first.request_cancel();
        assert!(first.cancel_requested());
        assert!(!second.cancel_requested());
    }
}
