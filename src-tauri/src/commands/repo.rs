use std::path::PathBuf;

use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::{CommitInfo, DiffPayload, FileEntry, RepoSummary, WorkingStatus};
use crate::state::AppState;

/// Open a repository and register it under a frontend-provided tab id.
///
/// Returns the canonicalized summary so the frontend can use the actual
/// workdir path (resolves `.git` subdirs to the workdir root) as the tab's
/// stable identifier in its UI label.
#[tauri::command]
pub fn open_repository(
    tab_id: String,
    path: String,
    state: State<AppState>,
) -> AppResult<RepoSummary> {
    let p = PathBuf::from(&path);
    let canonical = git::repo::canonical_workdir(&p)?;
    let summary = git::repo::summarize(&canonical)?;
    state.register_tab(tab_id, canonical);
    Ok(summary)
}

#[tauri::command]
pub fn close_repository(tab_id: String, state: State<AppState>) -> AppResult<()> {
    state.remove_tab(&tab_id);
    Ok(())
}

#[tauri::command]
pub fn repository_summary(
    tab_id: String,
    state: State<AppState>,
) -> AppResult<Option<RepoSummary>> {
    match state.tab_path(&tab_id) {
        Some(p) => Ok(Some(git::repo::summarize(&p)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn commit_history(
    tab_id: String,
    state: State<AppState>,
    limit: Option<usize>,
) -> AppResult<Vec<CommitInfo>> {
    let path = state.require_tab_path(&tab_id)?;
    git::repo::commit_history(&path, limit.unwrap_or(2000))
}

#[tauri::command]
pub fn working_status(tab_id: String, state: State<AppState>) -> AppResult<WorkingStatus> {
    let path = state.require_tab_path(&tab_id)?;
    git::stage::working_status(&path)
}

#[tauri::command]
pub fn commit_files(
    tab_id: String,
    sha: String,
    state: State<AppState>,
) -> AppResult<Vec<FileEntry>> {
    let path = state.require_tab_path(&tab_id)?;
    git::repo::commit_files(&path, &sha)
}

#[tauri::command]
pub fn commit_file_diff(
    tab_id: String,
    sha: String,
    file: String,
    state: State<AppState>,
) -> AppResult<DiffPayload> {
    let path = state.require_tab_path(&tab_id)?;
    git::repo::commit_file_diff(&path, &sha, &file)
}
