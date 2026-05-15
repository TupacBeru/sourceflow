use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::{BranchInfo, StashInfo};
use crate::state::AppState;

#[tauri::command]
pub fn list_branches(state: State<AppState>) -> AppResult<Vec<BranchInfo>> {
    let path = state.require_repo_path()?;
    git::refs::list_branches(&path)
}

#[tauri::command]
pub fn list_stashes(state: State<AppState>) -> AppResult<Vec<StashInfo>> {
    let path = state.require_repo_path()?;
    git::refs::list_stashes(&path)
}

#[tauri::command]
pub fn checkout_branch(state: State<AppState>, branch: String) -> AppResult<()> {
    let path = state.require_repo_path()?;
    git::refs::checkout_branch(&path, &branch)
}
