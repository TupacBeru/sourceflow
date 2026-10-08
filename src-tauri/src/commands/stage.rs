use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::DiffPayload;
use crate::state::AppState;

#[tauri::command]
pub fn stage_file(tab_id: String, state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::stage_file(&repo, &path)
}

#[tauri::command]
pub fn unstage_file(tab_id: String, state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::unstage_file(&repo, &path)
}

#[tauri::command]
pub fn discard_file(tab_id: String, state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::discard_file(&repo, &path)
}

#[tauri::command]
pub fn ignore_file(tab_id: String, state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::ignore_file(&repo, &path)
}

#[tauri::command]
pub fn delete_untracked_file(
    tab_id: String,
    state: State<AppState>,
    path: String,
) -> AppResult<()> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::delete_untracked_file(&repo, &path)
}

#[tauri::command]
pub fn file_diff(
    tab_id: String,
    state: State<AppState>,
    path: String,
    staged: bool,
) -> AppResult<DiffPayload> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::file_diff(&repo, &path, staged)
}

#[tauri::command]
pub fn commit_changes(
    tab_id: String,
    state: State<AppState>,
    message: String,
    amend: bool,
    allow_empty: bool,
) -> AppResult<String> {
    let repo = state.require_tab_path(&tab_id)?;
    git::stage::commit_changes(&repo, &message, amend, allow_empty)
}
