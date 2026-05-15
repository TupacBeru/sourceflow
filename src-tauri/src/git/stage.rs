use std::path::Path;

use git2::{DiffOptions, IndexAddOption, Repository, Signature, Status, StatusOptions};

use crate::error::{AppError, AppResult};

use super::repo::open;
use super::types::{DiffPayload, FileEntry, FileStatus, WorkingStatus};

pub fn working_status(path: &Path) -> AppResult<WorkingStatus> {
    let repo = open(path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut out = WorkingStatus::default();

    for entry in statuses.iter() {
        let raw = entry.status();
        let path_str = entry.path().unwrap_or("").to_string();
        if path_str.is_empty() {
            continue;
        }
        let old_path = entry
            .head_to_index()
            .and_then(|d| d.old_file().path())
            .map(|p| p.display().to_string());

        // A single file may have both staged and worktree changes - emit both.
        if let Some((status, staged)) = classify_index(raw) {
            out.staged.push(FileEntry {
                path: path_str.clone(),
                status,
                staged,
                old_path: old_path.clone(),
            });
        }
        if let Some((status, staged)) = classify_worktree(raw) {
            let entry = FileEntry {
                path: path_str.clone(),
                status,
                staged,
                old_path,
            };
            if status == FileStatus::WorktreeNew {
                out.untracked.push(entry);
            } else {
                out.unstaged.push(entry);
            }
        }
        if raw.is_conflicted() {
            out.conflicted.push(FileEntry {
                path: path_str,
                status: FileStatus::Conflicted,
                staged: false,
                old_path: None,
            });
        }
    }

    out.staged.sort_by(|a, b| a.path.cmp(&b.path));
    out.unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    out.untracked.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn classify_index(s: Status) -> Option<(FileStatus, bool)> {
    if s.is_index_new() {
        Some((FileStatus::IndexNew, true))
    } else if s.is_index_modified() {
        Some((FileStatus::IndexModified, true))
    } else if s.is_index_deleted() {
        Some((FileStatus::IndexDeleted, true))
    } else if s.is_index_renamed() {
        Some((FileStatus::IndexRenamed, true))
    } else if s.is_index_typechange() {
        Some((FileStatus::IndexTypechange, true))
    } else {
        None
    }
}

fn classify_worktree(s: Status) -> Option<(FileStatus, bool)> {
    if s.is_wt_new() {
        Some((FileStatus::WorktreeNew, false))
    } else if s.is_wt_modified() {
        Some((FileStatus::WorktreeModified, false))
    } else if s.is_wt_deleted() {
        Some((FileStatus::WorktreeDeleted, false))
    } else if s.is_wt_renamed() {
        Some((FileStatus::WorktreeRenamed, false))
    } else if s.is_wt_typechange() {
        Some((FileStatus::WorktreeTypechange, false))
    } else {
        None
    }
}

pub fn stage_file(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    let mut index = repo.index()?;

    // `add_all` handles new and modified; for deletions we need `remove_path`.
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidArg("bare repos not supported".into()))?;
    let abs = workdir.join(file);
    if !abs.exists() {
        index.remove_path(Path::new(file))?;
    } else {
        index.add_all([file], IndexAddOption::DEFAULT, None)?;
    }
    index.write()?;
    Ok(())
}

pub fn unstage_file(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    match repo.head() {
        Ok(head) => {
            let head_commit = head.peel_to_commit()?;
            repo.reset_default(Some(head_commit.as_object()), [file])?;
        }
        Err(_) => {
            // No HEAD yet (initial commit): just remove from the index.
            let mut index = repo.index()?;
            index.remove_path(Path::new(file))?;
            index.write()?;
        }
    }
    Ok(())
}

pub fn discard_file(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    let mut builder = git2::build::CheckoutBuilder::new();
    builder.path(file).force();
    repo.checkout_head(Some(&mut builder))?;
    Ok(())
}

/// Produce a unified diff for a single file.
///
/// `staged = true` -> diff between HEAD tree and index (i.e. what is currently
/// staged for the next commit).
/// `staged = false` -> diff between index and worktree (i.e. unstaged changes).
pub fn file_diff(path: &Path, file: &str, staged: bool) -> AppResult<DiffPayload> {
    let repo = open(path)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(file).context_lines(3);

    let diff = if staged {
        let head_tree = match repo.head().and_then(|h| h.peel_to_tree()) {
            Ok(t) => Some(t),
            Err(_) => None,
        };
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };

    let mut patch = String::new();
    let mut is_binary = false;
    let mut old_path = None;
    let mut found = false;

    diff.foreach(
        &mut |delta, _progress| {
            if let Some(p) = delta.new_file().path() {
                if p.to_string_lossy() == file {
                    found = true;
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

pub fn commit_changes(
    path: &Path,
    message: &str,
    amend: bool,
) -> AppResult<String> {
    if message.trim().is_empty() && !amend {
        return Err(AppError::InvalidArg("commit message is required".into()));
    }

    let repo = open(path)?;
    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let signature = build_signature(&repo)?;

    let parents: Vec<git2::Commit> = match repo.head() {
        Ok(head) => vec![head.peel_to_commit()?],
        Err(_) => Vec::new(),
    };

    let oid = if amend {
        let head = repo
            .head()
            .map_err(|_| AppError::InvalidArg("nothing to amend - no HEAD yet".into()))?;
        let head_commit = head.peel_to_commit()?;
        let final_msg = if message.trim().is_empty() {
            head_commit.message().unwrap_or("").to_string()
        } else {
            message.to_string()
        };
        head_commit.amend(
            Some("HEAD"),
            Some(&signature),
            Some(&signature),
            None,
            Some(&final_msg),
            Some(&tree),
        )?
    } else {
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )?
    };

    Ok(oid.to_string())
}

fn build_signature(repo: &Repository) -> AppResult<Signature<'static>> {
    // `repo.signature()` reads user.name and user.email from the
    // local/global git config and bubbles up a clear error if missing.
    repo.signature().map_err(AppError::from)
}
