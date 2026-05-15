use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::{AppError, AppResult};

/// Shared application state owned by Tauri.
///
/// In Phase 1 we hold at most one open repository. We store only the path
/// here and re-open the `git2::Repository` in each command call - `Repository`
/// is `!Send + !Sync` and caching it adds lifetime complexity that isn't
/// worth it for a Phase 1 single-repo setup. Phase 2 (multi-tab) will
/// introduce a per-tab repo handle cache with a worker pool.
pub struct AppState {
    inner: Mutex<Inner>,
}

struct Inner {
    repo_path: Option<PathBuf>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner { repo_path: None }),
        }
    }

    pub fn set_repo(&self, path: PathBuf) {
        let mut inner = self.inner.lock().expect("AppState mutex poisoned");
        inner.repo_path = Some(path);
    }

    pub fn clear_repo(&self) {
        let mut inner = self.inner.lock().expect("AppState mutex poisoned");
        inner.repo_path = None;
    }

    pub fn repo_path(&self) -> Option<PathBuf> {
        let inner = self.inner.lock().expect("AppState mutex poisoned");
        inner.repo_path.clone()
    }

    pub fn require_repo_path(&self) -> AppResult<PathBuf> {
        self.repo_path().ok_or(AppError::NoRepoOpen)
    }
}
