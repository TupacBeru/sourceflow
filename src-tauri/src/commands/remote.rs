use tauri::State;

use crate::error::AppResult;
use crate::git;
use crate::git::types::AheadBehind;
use crate::state::AppState;

#[tauri::command]
pub async fn fetch_all(tab_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::remote::fetch_all(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn pull_current(
    tab_id: String,
    strategy: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    let strat = match strategy.as_deref() {
        None | Some("ff") => git::remote::PullStrategy::FfOnly,
        Some("merge") => git::remote::PullStrategy::Merge,
        Some("rebase") => git::remote::PullStrategy::Rebase,
        Some(other) => {
            return Err(crate::error::AppError::InvalidArg(format!(
                "unknown pull strategy: {other}"
            )));
        }
    };
    tokio::task::spawn_blocking(move || git::remote::pull_current(&path, strat))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn push_current(tab_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = state.require_tab_path(&tab_id)?;
    tokio::task::spawn_blocking(move || git::remote::push_current(&path))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn ahead_behind(tab_id: String, state: State<AppState>) -> AppResult<AheadBehind> {
    let path = state.require_tab_path(&tab_id)?;
    git::remote::ahead_behind(&path)
}
