use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::AheadBehind;
use crate::state::AppState;

#[tauri::command]
pub async fn fetch_all(state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_repo_path()?;
    tokio::task::spawn_blocking(move || git::remote::fetch_all(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn pull_current(state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_repo_path()?;
    tokio::task::spawn_blocking(move || git::remote::pull_current(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn push_current(state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_repo_path()?;
    tokio::task::spawn_blocking(move || git::remote::push_current(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn ahead_behind(state: State<AppState>) -> AppResult<AheadBehind> {
    let path = state.require_repo_path()?;
    git::remote::ahead_behind(&path)
}
