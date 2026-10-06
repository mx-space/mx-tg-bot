use std::sync::Mutex;
use std::time::{Duration, Instant};

pub type MessageKey = (i64, i32);

// ponytail: linear scan over at most `capacity` entries; fine at 200, use an indexed map if capacity grows
pub struct TtlMap<V> {
    capacity: usize,
    ttl: Duration,
    entries: Mutex<Vec<(MessageKey, V, Instant)>>,
}

impl<V: Clone> TtlMap<V> {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity,
            ttl,
            entries: Mutex::new(Vec::new()),
        }
    }

    fn live(&self) -> std::sync::MutexGuard<'_, Vec<(MessageKey, V, Instant)>> {
        let mut entries = self.entries.lock().unwrap();
        let now = Instant::now();
        entries.retain(|(_, _, expires_at)| *expires_at > now);
        entries
    }

    pub fn insert(&self, key: MessageKey, value: V) {
        let mut entries = self.live();
        entries.retain(|(k, _, _)| *k != key);
        if entries.len() >= self.capacity {
            entries.remove(0);
        }
        entries.push((key, value, Instant::now() + self.ttl));
    }

    pub fn get(&self, key: MessageKey) -> Option<V> {
        self.live()
            .iter()
            .find(|(k, _, _)| *k == key)
            .map(|(_, v, _)| v.clone())
    }

    pub fn consume(&self, key: MessageKey) -> Option<V> {
        let mut entries = self.live();
        let idx = entries.iter().position(|(k, _, _)| *k == key)?;
        Some(entries.remove(idx).1)
    }
}
