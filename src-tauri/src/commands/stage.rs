use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::DiffPayload;
use crate::state::AppState;

#[tauri::command]
pub fn stage_file(state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_repo_path()?;
    git::stage::stage_file(&repo, &path)
}

#[tauri::command]
pub fn unstage_file(state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_repo_path()?;
    git::stage::unstage_file(&repo, &path)
}

#[tauri::command]
pub fn discard_file(state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_repo_path()?;
    git::stage::discard_file(&repo, &path)
}

#[tauri::command]
pub fn ignore_file(state: State<AppState>, path: String) -> AppResult<()> {
    let repo = state.require_repo_path()?;
    git::stage::ignore_file(&repo, &path)
}

#[tauri::command]
pub fn file_diff(
    state: State<AppState>,
    path: String,
    staged: bool,
) -> AppResult<DiffPayload> {
    let repo = state.require_repo_path()?;
    git::stage::file_diff(&repo, &path, staged)
}

#[tauri::command]
pub fn commit_changes(
    state: State<AppState>,
    message: String,
    amend: bool,
) -> AppResult<String> {
    let repo = state.require_repo_path()?;
    git::stage::commit_changes(&repo, &message, amend)
}
