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
pub fn checkout_branch(
    tab_id: String,
    state: State<AppState>,
    branch: String,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    git::refs::checkout_branch(&path, &branch)
}
