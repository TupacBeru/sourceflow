use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::{MergeToolSettings, RepoOperationState};
use crate::state::AppState;

#[tauri::command]
pub fn repository_operation_state(
    tab_id: String,
    state: State<AppState>,
) -> AppResult<RepoOperationState> {
    let path = state.require_tab_path(&tab_id)?;
    git::conflict::operation_state(&path)
}

#[tauri::command]
pub fn mark_conflict_resolved(
    tab_id: String,
    state: State<AppState>,
    file: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::conflict::mark_conflict_resolved(&path, &file)
}

#[tauri::command]
pub async fn resolve_with_mergetool(
    tab_id: String,
    state: State<'_, AppState>,
    file: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::conflict::resolve_with_mergetool(&path, &file))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn open_conflict_file(
    tab_id: String,
    state: State<'_, AppState>,
    file: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::conflict::open_in_editor(&path, &file))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn continue_operation(tab_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::conflict::continue_operation(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn abort_operation(tab_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::conflict::abort_operation(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn get_merge_tool_settings() -> AppResult<MergeToolSettings> {
    git::conflict::get_merge_tool_settings()
}

#[tauri::command]
pub fn set_merge_tool_settings(settings: MergeToolSettings) -> AppResult<()> {
    git::conflict::set_merge_tool_settings(&settings)
}
