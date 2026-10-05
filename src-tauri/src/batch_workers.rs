//! Isolated inference processes. A permit remains held until the process exits.
use crate::audiocpp::AudioCppServer;
use crate::commands::generation::GenerationWorker;
use crate::commands::AppState;
use crate::models::AppSettings;
use crate::queue::JobQueue;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct BatchWorkers {
    admission: crate::batch_admission::BatchAdmission,
    permits: Arc<tokio::sync::Semaphore>,
    active: Mutex<HashMap<String, ActiveWorker>>,
    pub proof: Mutex<Option<serde_json::Value>>,
    preparing: std::sync::atomic::AtomicUsize,
}

struct ActiveWorker {
    batch_id: String,
    task_id: String,
    queue: JobQueue,
    port: u16,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    server: Arc<AudioCppServer>,
}

impl Default for BatchWorkers {
    fn default() -> Self {
        Self {
            admission: crate::batch_admission::BatchAdmission::default(),
            // No parallel capacity is inferred from the advertised VRAM size.
            permits: Arc::new(tokio::sync::Semaphore::new(2)),
            active: Mutex::new(HashMap::new()),
            proof: Mutex::new(None),
            preparing: std::sync::atomic::AtomicUsize::new(0),
        }
    }
}

pub struct WorkerLease<'a> {
    pub worker: GenerationWorker,
    pool: &'a BatchWorkers,
    _device: crate::device_admission::DeviceGuard,
    _permit: tokio::sync::OwnedSemaphorePermit,
}

pub struct Preparation<'a>(&'a BatchWorkers);
impl Drop for Preparation<'_> {
    fn drop(&mut self) {
        self.0
            .preparing
            .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }
}

impl BatchWorkers {
    pub fn runtime_url(&self) -> Option<String> {
        self.active
            .lock()
            .expect("batch workers")
            .values()
            .find_map(|worker| {
                let url = worker.server.base_url.lock().ok()?.clone();
                (!url.is_empty()).then_some(url)
            })
    }
    pub fn busy(&self) -> bool {
        self.permits.available_permits() < 2
            || self.preparing.load(std::sync::atomic::Ordering::Acquire) > 0
    }
    pub fn prepare(&self) -> Preparation<'_> {
        self.preparing
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        Preparation(self)
    }
    pub async fn acquire_probe(&self) -> Result<tokio::sync::OwnedSemaphorePermit, String> {
        self.permits
            .clone()
            .acquire_many_owned(2)
            .await
            .map_err(|error| error.to_string())
    }
    pub async fn acquire<'a>(
        &'a self,
        state: &AppState,
        batch_id: &str,
        task_id: &str,
        mut settings: AppSettings,
        verified_parallel: bool,
    ) -> Result<WorkerLease<'a>, String> {
        let turn = self.admission.turn(batch_id).await;
        // Unmeasured workloads consume the entire pool, including across lots.
        let permit = self
            .permits
            .clone()
            .acquire_many_owned(if verified_parallel { 1 } else { 2 })
            .await
            .map_err(|e| e.to_string())?;
        let device = state.queue.acquire_batch_device().await;
        turn.admitted();
        // Interactive jobs hold an exclusive device admission before starting their runtime.
        state.server.shutdown();
        let id = uuid::Uuid::new_v4().to_string();
        let folder = crate::batch::batches_root()
            .join(batch_id)
            .join("workers")
            .join(&id);
        crate::paths::ensure_dir(&folder).map_err(|e| e.to_string())?;
        let mut active = self.active.lock().expect("batch workers");
        settings.server_port = if active.values().any(|worker| worker.port == 18080) {
            18120
        } else {
            18080
        };
        let worker = GenerationWorker {
            server: Arc::new(AudioCppServer::isolated(folder.clone())),
            queue: JobQueue::default(),
            settings,
            id: id.clone(),
            cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        crate::paths::atomic_write_json(
            &folder.join("worker.json"),
            &serde_json::json!({
                "workerId": id, "batchId": batch_id, "taskId": task_id,
                "startedAt": crate::paths::now_iso(),
                "attempt": crate::batch::load_live_tasks(batch_id)?.iter().find(|task| task.task_id == task_id).map(|task| task.attempt),
            }),
        )?;
        active.insert(
            id,
            ActiveWorker {
                batch_id: batch_id.into(),
                task_id: task_id.into(),
                queue: worker.queue.clone(),
                port: worker.settings.server_port,
                cancelled: worker.cancelled.clone(),
                server: worker.server.clone(),
            },
        );
        drop(active);
        Ok(WorkerLease {
            worker,
            pool: self,
            _device: device,
            _permit: permit,
        })
    }

    pub fn cancel(&self, batch_id: &str, task_id: Option<&str>) {
        for worker in self.active.lock().expect("batch workers").values() {
            if worker.batch_id == batch_id && task_id.is_none_or(|id| id == worker.task_id) {
                worker
                    .cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                worker.queue.request_cancel();
            }
        }
    }
}

impl Drop for WorkerLease<'_> {
    fn drop(&mut self) {
        // A timed-out HTTP request may leave inference running: always reap the child
        // before releasing the GPU admission permit, including on early errors.
        self.worker.server.shutdown();
        self.pool
            .active
            .lock()
            .expect("batch workers")
            .remove(&self.worker.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unmeasured_workload_excludes_other_lots() {
        let pool = BatchWorkers::default();
        let permit = pool.acquire_probe().await.unwrap();
        assert!(pool.busy());
        assert!(pool.permits.clone().try_acquire_owned().is_err());
        drop(permit);
        assert!(!pool.busy());
    }
}
