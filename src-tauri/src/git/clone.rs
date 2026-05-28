//! Clone a remote repository into a new directory.

use std::path::{Path, PathBuf};

use git2::build::RepoBuilder;
use git2::FetchOptions;

use crate::auth::store;
use crate::error::{AppError, AppResult};

use super::credentials::{github_callbacks, is_github_url};
use super::repo::canonical_workdir;

/// Normalize clone URL: trim, map `git@github.com:org/repo.git` to HTTPS.
pub fn normalize_clone_url(url: &str) -> AppResult<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidArg("repository URL is required".into()));
    }

    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let path = rest.trim().trim_end_matches('/');
        let path = path.strip_suffix(".git").unwrap_or(path);
        if path.is_empty() || !path.contains('/') {
            return Err(AppError::InvalidArg(
                "invalid SSH URL — expected git@github.com:owner/repo".into(),
            ));
        }
        return Ok(format!("https://github.com/{path}.git"));
    }

    if trimmed.starts_with("git@") {
        return Err(AppError::InvalidArg(
            "only github.com SSH URLs are supported — use https://github.com/owner/repo.git"
                .into(),
        ));
    }

    if !trimmed.contains("://") && !trimmed.contains('@') {
        return Err(AppError::InvalidArg(
            "URL must start with https:// (or use git@github.com:owner/repo)".into(),
        ));
    }

    Ok(trimmed.to_string())
}

/// Require a stored GitHub token before cloning from GitHub.
pub fn ensure_github_auth_for_url(url: &str) -> AppResult<()> {
    if !is_github_url(url) {
        return Err(AppError::InvalidArg(
            "SourceFlow clone currently supports GitHub URLs only".into(),
        ));
    }
    match store::load_github_token()? {
        Some(_) => Ok(()),
        None => Err(AppError::InvalidArg(
            "connect GitHub in SourceFlow before cloning (toolbar GitHub button)".into(),
        )),
    }
}

/// Clone `url` into `dest` (must not exist). Returns the canonical workdir path.
pub fn clone_repository(url: &str, dest: &Path) -> AppResult<PathBuf> {
    let url = normalize_clone_url(url)?;

    if dest.exists() {
        return Err(AppError::InvalidArg(format!(
            "destination already exists: {}",
            dest.display()
        )));
    }

    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            return Err(AppError::InvalidArg(format!(
                "parent directory does not exist: {}",
                parent.display()
            )));
        }
    } else {
        return Err(AppError::InvalidArg("invalid destination path".into()));
    }

    ensure_github_auth_for_url(&url)?;

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(github_callbacks());

    RepoBuilder::new()
        .fetch_options(fetch_opts)
        .clone(&url, dest)
        .map_err(AppError::from)?;

    canonical_workdir(dest)
}
