//! Shared GPU admission: exclusive interactive jobs alternate with waiting batch work.
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Interactive,
    Batch,
}

#[derive(Default)]
struct State {
    next: u64,
    waiting: VecDeque<(u64, Kind)>,
    batch_active: usize,
    interactive_active: bool,
    last_interactive: bool,
}

#[derive(Default)]
pub(crate) struct DeviceAdmission {
    state: Mutex<State>,
    changed: tokio::sync::Notify,
}

pub(crate) struct DeviceGuard {
    admission: Arc<DeviceAdmission>,
    kind: Kind,
}

struct Waiting {
    admission: Arc<DeviceAdmission>,
    id: u64,
}

impl State {
    fn next_kind(&self) -> Option<Kind> {
        let interactive = self
            .waiting
            .iter()
            .any(|(_, kind)| *kind == Kind::Interactive);
        let batch = self.waiting.iter().any(|(_, kind)| *kind == Kind::Batch);
        if batch && (self.last_interactive || !interactive) {
            Some(Kind::Batch)
        } else if interactive {
            Some(Kind::Interactive)
        } else {
            None
        }
    }
}

impl DeviceAdmission {
    pub(crate) async fn batch(self: &Arc<Self>) -> DeviceGuard {
        self.acquire(Kind::Batch).await
    }

    pub(crate) async fn interactive(self: &Arc<Self>) -> DeviceGuard {
        self.acquire(Kind::Interactive).await
    }

    pub(crate) fn try_interactive(self: &Arc<Self>) -> Option<DeviceGuard> {
        let mut state = self.state.lock();
        if state.interactive_active || state.batch_active > 0 || !state.waiting.is_empty() {
            return None;
        }
        state.interactive_active = true;
        state.last_interactive = true;
        Some(DeviceGuard {
            admission: self.clone(),
            kind: Kind::Interactive,
        })
    }

    async fn acquire(self: &Arc<Self>, kind: Kind) -> DeviceGuard {
        let id = {
            let mut state = self.state.lock();
            let id = state.next;
            state.next += 1;
            state.waiting.push_back((id, kind));
            id
        };
        let waiting = Waiting {
            admission: self.clone(),
            id,
        };
        self.changed.notify_waiters();
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let admitted = {
                let mut state = self.state.lock();
                let first = state
                    .waiting
                    .iter()
                    .find(|(_, k)| *k == kind)
                    .map(|(id, _)| *id);
                if !state.interactive_active
                    && state.next_kind() == Some(kind)
                    && first == Some(id)
                    && (kind == Kind::Batch || state.batch_active == 0)
                {
                    state.waiting.retain(|(queued, _)| *queued != id);
                    if kind == Kind::Batch {
                        state.batch_active += 1;
                        state.last_interactive = false;
                    } else {
                        state.interactive_active = true;
                        state.last_interactive = true;
                    }
                    true
                } else {
                    false
                }
            };
            if admitted {
                drop(waiting);
                return DeviceGuard {
                    admission: self.clone(),
                    kind,
                };
            }
            changed.await;
        }
    }
}

impl Drop for Waiting {
    fn drop(&mut self) {
        self.admission
            .state
            .lock()
            .waiting
            .retain(|(id, _)| *id != self.id);
        self.admission.changed.notify_waiters();
    }
}

impl Drop for DeviceGuard {
    fn drop(&mut self) {
        let mut state = self.admission.state.lock();
        if self.kind == Kind::Batch {
            state.batch_active -= 1;
        } else {
            state.interactive_active = false;
        }
        drop(state);
        self.admission.changed.notify_waiters();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::Future;
    use std::pin::Pin;
    use std::task::{Context, Poll, Waker};

    fn poll(future: Pin<&mut impl Future<Output = DeviceGuard>>) -> Poll<DeviceGuard> {
        future.poll(&mut Context::from_waker(Waker::noop()))
    }

    #[tokio::test]
    async fn interactive_has_priority_then_yields_one_turn_to_batch() {
        let device = Arc::new(DeviceAdmission::default());
        let active1 = device.batch().await;
        let active2 = device.batch().await;
        let mut interactive1 = Box::pin(device.interactive());
        let mut batch = Box::pin(device.batch());
        let mut interactive2 = Box::pin(device.interactive());
        assert!(poll(interactive1.as_mut()).is_pending());
        assert!(poll(batch.as_mut()).is_pending());
        assert!(poll(interactive2.as_mut()).is_pending());
        drop(active1);
        assert!(poll(interactive1.as_mut()).is_pending());
        drop(active2);
        assert!(poll(batch.as_mut()).is_pending());
        let exclusive = interactive1.await;
        assert!(poll(batch.as_mut()).is_pending());
        drop(exclusive);
        // A second queued interactive operation cannot starve the waiting batch.
        assert!(poll(interactive2.as_mut()).is_pending());
        let batch_guard = batch.await;
        assert!(poll(interactive2.as_mut()).is_pending());
        drop(batch_guard);
        drop(interactive2.await);
    }

    #[tokio::test]
    async fn cancelled_waiters_leave_neither_a_reservation_nor_a_turn() {
        let device = Arc::new(DeviceAdmission::default());
        let active = device.batch().await;
        let mut cancelled = Box::pin(device.interactive());
        let mut batch = Box::pin(device.batch());
        assert!(poll(cancelled.as_mut()).is_pending());
        assert!(poll(batch.as_mut()).is_pending());
        drop(cancelled);
        let parallel = batch.await;
        drop((active, parallel));
        assert!(device.try_interactive().is_some());
        let exclusive = device.interactive().await;
        let mut cancelled_batch = Box::pin(device.batch());
        assert!(poll(cancelled_batch.as_mut()).is_pending());
        drop(cancelled_batch);
        drop(exclusive);
        assert!(device.try_interactive().is_some());
    }

    #[tokio::test]
    async fn release_wakes_a_suspended_batch_future() {
        let device = Arc::new(DeviceAdmission::default());
        let exclusive = device.interactive().await;
        let worker_device = device.clone();
        let worker = tokio::spawn(async move { worker_device.batch().await });
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while device.state.lock().waiting.is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(!worker.is_finished());
        drop(exclusive);
        let admitted = tokio::time::timeout(std::time::Duration::from_secs(2), worker)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(device.state.lock().batch_active, 1);
        drop(admitted);
        assert!(device.try_interactive().is_some());
    }

    #[tokio::test]
    async fn restart_cannot_jump_a_waiting_operation() {
        let device = Arc::new(DeviceAdmission::default());
        let active = device.batch().await;
        let mut queued = Box::pin(device.interactive());
        assert!(poll(queued.as_mut()).is_pending());
        drop(active);
        assert!(device.try_interactive().is_none());
        drop(queued.await);
        assert!(device.try_interactive().is_some());
    }
}
