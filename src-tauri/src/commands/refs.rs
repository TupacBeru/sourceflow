use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::{BranchInfo, StashInfo};
use crate::state::AppState;

#[tauri::command]
pub fn list_branches(tab_id: String, state: State<AppState>) -> AppResult<Vec<BranchInfo>> {
    let path = state.require_tab_path(&tab_id)?;
    git::refs::list_branches(&path)
}

#[tauri::command]
pub fn list_stashes(tab_id: String, state: State<AppState>) -> AppResult<Vec<StashInfo>> {
    let path = state.require_tab_path(&tab_id)?;
    git::refs::list_stashes(&path)
}

#[tauri::command]
pub async fn stash_push(
    tab_id: String,
    state: State<'_, AppState>,
    message: Option<String>,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::refs::stash_push(&path, message.as_deref()))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn stash_apply(
    tab_id: String,
    state: State<'_, AppState>,
    index: usize,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::refs::stash_apply(&path, index))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn stash_pop(tab_id: String, state: State<'_, AppState>, index: usize) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::refs::stash_pop(&path, index))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn stash_drop(tab_id: String, state: State<'_, AppState>, index: usize) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::refs::stash_drop(&path, index))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn checkout_branch(tab_id: String, state: State<AppState>, branch: String) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::refs::checkout_branch(&path, &branch)
}
