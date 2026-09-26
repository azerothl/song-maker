//! File FIFO applicative : un seul HTTP à la fois vers audiocpp_server.

use crate::models::JobStatus;
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone)]
pub struct JobQueue {
    inner: Arc<Mutex<QueueInner>>,
    waiting: Arc<AtomicUsize>,
    gate: Arc<tokio::sync::Mutex<()>>,
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
        }
    }
}

impl JobQueue {
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