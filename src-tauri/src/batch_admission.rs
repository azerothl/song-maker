//! Round-robin admission between lots, independent of their number of waiters.
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Default)]
pub(crate) struct BatchAdmission {
    state: Mutex<State>,
    changed: tokio::sync::Notify,
}

#[derive(Default)]
struct State {
    next: u64,
    waiting: VecDeque<(u64, String)>,
    admitting: Option<u64>,
}

pub(crate) struct Turn<'a> {
    admission: &'a BatchAdmission,
    id: u64,
}

impl BatchAdmission {
    pub(crate) async fn turn(&self, batch: &str) -> Turn<'_> {
        let id = {
            let mut state = self.state.lock().expect("batch admission");
            let id = state.next;
            state.next += 1;
            state.waiting.push_back((id, batch.into()));
            id
        };
        // This guard removes a cancelled waiter, including before it gets a turn.
        let turn = Turn {
            admission: self,
            id,
        };
        self.changed.notify_waiters();
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let selected = {
                let mut state = self.state.lock().expect("batch admission");
                let next = state.waiting.front().map(|(id, _)| *id);
                if state.admitting.is_none() && next == Some(id) {
                    state.admitting = Some(id);
                    true
                } else {
                    false
                }
            };
            if selected {
                return turn;
            }
            changed.await;
        }
    }
}

impl Turn<'_> {
    /// Count only a successful GPU admission; cancellation does not consume a turn.
    pub(crate) fn admitted(self) {
        let mut state = self.admission.state.lock().expect("batch admission");
        let batch = state
            .waiting
            .iter()
            .find(|(id, _)| *id == self.id)
            .map(|(_, batch)| batch.clone());
        if let Some(batch) = batch {
            let mut same_batch = VecDeque::new();
            let mut other_batches = VecDeque::new();
            for entry in state.waiting.drain(..) {
                if entry.1 == batch {
                    same_batch.push_back(entry);
                } else {
                    other_batches.push_back(entry);
                }
            }
            other_batches.append(&mut same_batch);
            state.waiting = other_batches;
        }
        drop(state);
    }
}

impl Drop for Turn<'_> {
    fn drop(&mut self) {
        let mut state = self.admission.state.lock().expect("batch admission");
        state.waiting.retain(|(id, _)| *id != self.id);
        if state.admitting == Some(self.id) {
            state.admitting = None;
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

    fn poll<'a>(future: Pin<&mut impl Future<Output = Turn<'a>>>) -> Poll<Turn<'a>> {
        future.poll(&mut Context::from_waker(Waker::noop()))
    }

    #[tokio::test]
    async fn three_lots_alternate_despite_multiple_waiters_from_the_first() {
        let admission = BatchAdmission::default();
        let first = admission.turn("A").await;
        let mut a2 = Box::pin(admission.turn("A"));
        let mut a3 = Box::pin(admission.turn("A"));
        let mut b1 = Box::pin(admission.turn("B"));
        let mut b2 = Box::pin(admission.turn("B"));
        let mut c1 = Box::pin(admission.turn("C"));
        let mut c2 = Box::pin(admission.turn("C"));
        for future in [&mut a2, &mut a3, &mut b1, &mut b2, &mut c1, &mut c2] {
            assert!(poll(future.as_mut()).is_pending());
        }
        first.admitted();
        assert!(poll(a2.as_mut()).is_pending());
        b1.await.admitted();
        assert!(poll(a2.as_mut()).is_pending());
        c1.await.admitted();
        a2.await.admitted();
        assert!(poll(a3.as_mut()).is_pending());
        b2.await.admitted();
        c2.await.admitted();
        a3.await.admitted();
        assert!(admission.state.lock().unwrap().waiting.is_empty());
    }

    #[tokio::test]
    async fn cancelling_selected_or_pending_waiters_unblocks_the_next_lot() {
        let admission = BatchAdmission::default();
        let selected = admission.turn("A").await;
        let mut cancelled = Box::pin(admission.turn("B"));
        let mut next = Box::pin(admission.turn("C"));
        assert!(poll(cancelled.as_mut()).is_pending());
        assert!(poll(next.as_mut()).is_pending());
        drop(cancelled);
        drop(selected);
        next.await.admitted();
        assert!(admission.state.lock().unwrap().waiting.is_empty());
        admission.turn("A").await.admitted();
    }

    #[tokio::test]
    async fn same_lot_can_fill_both_worker_slots_without_waiting_for_completion() {
        let admission = BatchAdmission::default();
        let permits = std::sync::Arc::new(tokio::sync::Semaphore::new(2));
        let first = admission.turn("A").await;
        let first_permit = permits.clone().acquire_owned().await.unwrap();
        first.admitted();
        let second = admission.turn("A").await;
        let second_permit = permits.clone().acquire_owned().await.unwrap();
        second.admitted();
        assert_eq!(permits.available_permits(), 0);
        drop((first_permit, second_permit));
    }
}
