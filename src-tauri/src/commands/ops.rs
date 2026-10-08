//! Tauri command surface for higher-level repo operations.
//!
//! Long-running calls (push, merge, rebase, fetch in the middle of a push)
//! are wrapped in `spawn_blocking` so the WebView event loop isn't stalled.

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::ops::ResetMode;
use crate::state::AppState;

// ----- Branch CRUD ---------------------------------------------------------

#[tauri::command]
pub fn create_branch(
    tab_id: String,
    state: State<AppState>,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::create_branch(&path, &name, start_point.as_deref(), checkout)
}

#[tauri::command]
pub fn rename_branch(
    tab_id: String,
    state: State<AppState>,
    old: String,
    new: String,
    force: bool,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::rename_branch(&path, &old, &new, force)
}

#[tauri::command]
pub fn delete_branch(tab_id: String, state: State<AppState>, name: String) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::delete_branch(&path, &name)
}

#[tauri::command]
pub fn set_upstream(
    tab_id: String,
    state: State<AppState>,
    branch: String,
    upstream: Option<String>,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::set_upstream(&path, &branch, upstream.as_deref())
}

// ----- Tag -----------------------------------------------------------------

#[tauri::command]
pub fn create_tag(
    tab_id: String,
    state: State<AppState>,
    name: String,
    target_sha: Option<String>,
    message: Option<String>,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::create_tag(&path, &name, target_sha.as_deref(), message.as_deref())
}

// ----- Checkout / reset ----------------------------------------------------

#[tauri::command]
pub fn checkout_sha(tab_id: String, state: State<AppState>, sha: String) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::checkout_sha(&path, &sha)
}

#[tauri::command]
pub fn reset_to(
    tab_id: String,
    state: State<AppState>,
    sha: String,
    mode: ResetMode,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::reset_to(&path, &sha, mode)
}

// ----- Merge / Rebase / Cherry-pick / Revert -------------------------------

#[tauri::command]
pub async fn merge_branch(
    tab_id: String,
    state: State<'_, AppState>,
    branch: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::ops::merge_branch(&path, &branch))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn abort_merge(tab_id: String, state: State<AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::abort_merge(&path)
}

#[tauri::command]
pub async fn rebase_onto(
    tab_id: String,
    state: State<'_, AppState>,
    onto: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::ops::rebase_onto(&path, &onto))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn abort_rebase(tab_id: String, state: State<AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::ops::abort_rebase(&path)
}

#[tauri::command]
pub async fn cherry_pick(tab_id: String, state: State<'_, AppState>, sha: String) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::ops::cherry_pick(&path, &sha))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn revert_commit(
    tab_id: String,
    state: State<'_, AppState>,
    sha: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::ops::revert_commit(&path, &sha))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

// ----- Push a specific branch ---------------------------------------------

#[tauri::command]
pub async fn push_branch(
    tab_id: String,
    state: State<'_, AppState>,
    branch: String,
    set_upstream_remote: Option<String>,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || {
        git::ops::push_branch(&path, &branch, set_upstream_remote.as_deref())
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}
