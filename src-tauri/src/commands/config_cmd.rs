use crate::config::{self, PersistedState, PersistedTab};
use crate::error::AppResult;

#[tauri::command]
pub fn load_app_state() -> AppResult<PersistedState> {
    config::load()
}

#[tauri::command]
pub fn save_app_state(state: PersistedState) -> AppResult<()> {
    config::save(&state)
}

/// Append a path to the recently-closed list (dedup + cap inside `save`).
#[tauri::command]
pub fn push_recently_closed(path: String) -> AppResult<()> {
    let mut s = config::load().unwrap_or_default();
    s.recently_closed.retain(|p| p != &path);
    s.recently_closed.insert(0, path);
    config::save(&s)
}

/// Set the active tab id (used to restore focus across restarts).
#[tauri::command]
pub fn set_active_tab(tab_id: Option<String>) -> AppResult<()> {
    let mut s = config::load().unwrap_or_default();
    s.active_tab_id = tab_id;
    config::save(&s)
}

/// Replace the full persisted tabs list. Frontend calls this whenever the
/// tab order or membership changes (open, close, reorder).
#[tauri::command]
pub fn save_tabs(tabs: Vec<PersistedTab>) -> AppResult<()> {
    let mut s = config::load().unwrap_or_default();
    s.tabs = tabs;
    s.last_repo_path = None; // migration: clear legacy field once we have tabs
    config::save(&s)
}
