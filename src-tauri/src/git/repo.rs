use std::path::{Path, PathBuf};

use git2::{Repository, Sort};

use crate::error::{AppError, AppResult};

use super::types::{CommitInfo, RepoSummary};

/// Open a `git2::Repository` at `path`, validating that it actually contains a `.git`.
pub fn open(path: &Path) -> AppResult<Repository> {
    if !path.exists() {
        return Err(AppError::NotARepo(path.display().to_string()));
    }
    Repository::discover(path).map_err(|_| AppError::NotARepo(path.display().to_string()))
}

pub fn summarize(path: &Path) -> AppResult<RepoSummary> {
    let repo = open(path)?;
    let workdir = repo
        .workdir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| path.to_path_buf());
    let name = workdir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("repository")
        .to_string();

    let head = repo.head().ok();
    let is_detached = repo.head_detached().unwrap_or(false);

    let head_branch = head.as_ref().and_then(|h| {
        if h.is_branch() {
            h.shorthand().map(String::from)
        } else {
            None
        }
    });
    let head_sha = head
        .as_ref()
        .and_then(|h| h.target())
        .map(|oid| oid.to_string());

    Ok(RepoSummary {
        path: workdir.display().to_string(),
        name,
        head_branch,
        head_sha,
        is_detached,
        is_bare: repo.is_bare(),
    })
}

/// Walk the commit graph starting from HEAD (topological + time sort).
///
/// `limit` caps how many commits we materialize - the frontend virtualizes
/// the list anyway, but on huge repos we don't want to push 100k entries
/// across the IPC boundary in one go. Phase 2 will switch to a paginated
/// stream.
pub fn commit_history(path: &Path, limit: usize) -> AppResult<Vec<CommitInfo>> {
    let repo = open(path)?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;

    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    walk.push_head()?;

    let refs_by_sha = collect_refs_by_sha(&repo);

    let mut out = Vec::with_capacity(limit.min(1024));
    for (idx, oid_res) in walk.enumerate() {
        if idx >= limit {
            break;
        }
        let oid = oid_res?;
        let commit = repo.find_commit(oid)?;
        let sha = oid.to_string();
        let short_sha = sha.chars().take(7).collect();

        let author = commit.author();
        let summary = commit.summary().unwrap_or("").to_string();
        let body = commit.body().unwrap_or("").to_string();
        let parents = commit.parent_ids().map(|p| p.to_string()).collect();
        let refs = refs_by_sha.get(&sha).cloned().unwrap_or_default();

        out.push(CommitInfo {
            sha,
            short_sha,
            summary,
            body,
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            parents,
            refs,
        });
    }
    Ok(out)
}

fn collect_refs_by_sha(repo: &Repository) -> std::collections::HashMap<String, Vec<String>> {
    let mut map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let Ok(iter) = repo.references() else {
        return map;
    };
    for r in iter.flatten() {
        if let Some(target) = r.target() {
            let sha = target.to_string();
            let name = r.shorthand().unwrap_or("").to_string();
            if !name.is_empty() {
                map.entry(sha).or_default().push(name);
            }
        }
    }
    map
}

/// Best-effort canonical workdir path for a repo (resolves `.git` subdirs).
pub fn canonical_workdir(path: &Path) -> AppResult<PathBuf> {
    let repo = open(path)?;
    Ok(repo
        .workdir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| path.to_path_buf()))
}
