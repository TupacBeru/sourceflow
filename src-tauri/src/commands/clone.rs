use std::path::PathBuf;

use crate::config;
use crate::error::AppResult;
use crate::git;
use crate::git::types::RepoSummary;

#[tauri::command]
pub async fn clone_repository(
    url: String,
    parent_dir: String,
    folder_name: String,
) -> AppResult<RepoSummary> {
    let parent = PathBuf::from(&parent_dir);
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err(crate::error::AppError::InvalidArg(
            "folder name is required".into(),
        ));
    }
    if folder.contains('/') || folder.contains('\\') {
        return Err(crate::error::AppError::InvalidArg(
            "folder name must not contain path separators".into(),
        ));
    }

    let dest = parent.join(folder);
    let path_for_clone = dest.clone();

    let summary = tokio::task::spawn_blocking(move || {
        let workdir = git::clone::clone_repository(&url, &path_for_clone)?;
        git::repo::summarize(&workdir)
    })
    .await
    .map_err(|e| crate::error::AppError::Other(e.to_string()))??;

    if let Some(parent_str) = parent.to_str() {
        let mut persisted = config::load().unwrap_or_default();
        persisted.last_clone_parent = Some(parent_str.to_string());
        config::save(&persisted)?;
    }

    Ok(summary)
}
