use std::path::{Path, PathBuf};

use git2::{Delta, DiffOptions, Oid, Repository, Sort};

use crate::error::{AppError, AppResult};

use super::graph::assign_lanes;
use super::types::{CommitInfo, DiffPayload, FileEntry, FileStatus, RepoSummary};

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
            lane: 0,
            color: 0,
            lanes_after: Vec::new(),
            fork_edges: Vec::new(),
            merge_in_edges: Vec::new(),
        });
    }
    assign_lanes(&mut out);
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

/// Resolve a commit by full or abbreviated SHA.
fn find_commit<'r>(repo: &'r Repository, sha: &str) -> AppResult<git2::Commit<'r>> {
    let oid = Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
    repo.find_commit(oid).map_err(AppError::from)
}

/// List files changed in `sha` compared to its first parent (or an empty tree
/// for a root commit). Status is reported using the index-side `FileStatus`
/// variants so the frontend can reuse its existing status badge logic.
pub fn commit_files(path: &Path, sha: &str) -> AppResult<Vec<FileEntry>> {
    let repo = open(path)?;
    let commit = find_commit(&repo, sha)?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    opts.context_lines(0);
    let diff =
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;

    let mut out: Vec<FileEntry> = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.display().to_string())
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.display().to_string())
            .filter(|p| p != &path);
        let status = match delta.status() {
            Delta::Added => FileStatus::IndexNew,
            Delta::Deleted => FileStatus::IndexDeleted,
            Delta::Modified => FileStatus::IndexModified,
            Delta::Renamed => FileStatus::IndexRenamed,
            Delta::Copied => FileStatus::IndexNew,
            Delta::Typechange => FileStatus::IndexTypechange,
            _ => FileStatus::IndexModified,
        };
        out.push(FileEntry {
            path,
            status,
            staged: true,
            old_path,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Unified diff for a single file inside a historical commit, comparing the
/// commit's tree against its first parent (or an empty tree for root commits).
pub fn commit_file_diff(path: &Path, sha: &str, file: &str) -> AppResult<DiffPayload> {
    let repo = open(path)?;
    let commit = find_commit(&repo, sha)?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(file).context_lines(3);
    let diff =
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;

    let mut patch = String::new();
    let mut is_binary = false;
    let mut old_path = None;

    diff.foreach(
        &mut |delta, _progress| {
            if let Some(p) = delta.new_file().path() {
                if p.to_string_lossy() == file {
                    is_binary = delta.new_file().is_binary() || delta.old_file().is_binary();
                    old_path = delta
                        .old_file()
                        .path()
                        .map(|p| p.display().to_string())
                        .filter(|p| p != file);
                }
            }
            true
        },
        None,
        None,
        Some(&mut |delta, _hunk, line| {
            let belongs = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy() == file)
                .unwrap_or(false);
            if !belongs {
                return true;
            }
            let origin = line.origin();
            if matches!(origin, '+' | '-' | ' ') {
                patch.push(origin);
            }
            patch.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            true
        }),
    )?;

    Ok(DiffPayload {
        path: file.to_string(),
        old_path,
        is_binary,
        patch: if is_binary { String::new() } else { patch },
    })
}
