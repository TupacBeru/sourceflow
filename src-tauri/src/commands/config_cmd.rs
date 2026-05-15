use crate::config::{self, PersistedState};
use crate::error::AppResult;

#[tauri::command]
pub fn load_app_state() -> AppResult<PersistedState> {
    config::load()
}

#[tauri::command]
pub fn save_last_repo(path: Option<String>) -> AppResult<()> {
    let mut state = config::load().unwrap_or_default();
    state.last_repo_path = path;
    config::save(&state)
}
