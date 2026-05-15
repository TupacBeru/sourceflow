use std::path::PathBuf;

use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::{CommitInfo, RepoSummary, WorkingStatus};
use crate::state::AppState;

#[tauri::command]
pub fn open_repository(path: String, state: State<AppState>) -> AppResult<RepoSummary> {
    let p = PathBuf::from(&path);
    let canonical = git::repo::canonical_workdir(&p)?;
    let summary = git::repo::summarize(&canonical)?;
    state.set_repo(canonical);
    Ok(summary)
}

#[tauri::command]
pub fn close_repository(state: State<AppState>) -> AppResult<()> {
    state.clear_repo();
    Ok(())
}

#[tauri::command]
pub fn current_repository(state: State<AppState>) -> AppResult<Option<RepoSummary>> {
    match state.repo_path() {
        Some(p) => Ok(Some(git::repo::summarize(&p)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn commit_history(
    state: State<AppState>,
    limit: Option<usize>,
) -> AppResult<Vec<CommitInfo>> {
    let path = state.require_repo_path()?;
    git::repo::commit_history(&path, limit.unwrap_or(2000))
}

#[tauri::command]
pub fn working_status(state: State<AppState>) -> AppResult<WorkingStatus> {
    let path = state.require_repo_path()?;
    git::stage::working_status(&path)
}
