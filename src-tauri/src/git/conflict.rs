//! Merge / rebase conflict detection and resolution helpers.
//!
//! External tools are invoked via `git mergetool` (honouring global git config)
//! with an optional SourceFlow override for `merge.tool`.

use std::path::{Path, PathBuf};
use std::process::Command;

use git2::{Repository, RepositoryState};

use crate::config;
use crate::error::{AppError, AppResult};

use super::credentials;
use super::repo::open;
use super::stage;
use super::types::{MergeToolSettings, OperationKind, RepoOperationState};

fn repo_root(repo: &Repository, fallback: &Path) -> PathBuf {
    repo.workdir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| fallback.to_path_buf())
}

pub(crate) fn run_git(root: &Path, args: &[&str]) -> AppResult<()> {
    run_git_impl(root, args, false)
}

/// Like `run_git`, but for fetch/push: uses the SourceFlow GitHub token and
/// never delegates to the system credential helper (no browser popups).
pub(crate) fn run_git_network(root: &Path, args: &[&str]) -> AppResult<()> {
    run_git_impl(root, args, true)
}

fn run_git_impl(root: &Path, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(root);
    if network {
        credentials::configure_network_command(&mut cmd, root)?;
    }
    cmd.args(args);
    let out = cmd
        .output()
        .map_err(|e| AppError::Other(format!("failed to run git: {e}")))?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    Err(AppError::Git(git2::Error::from_str(&format!(
        "git {} failed: {}{}",
        args.join(" "),
        stderr,
        stdout
    ))))
}

/// Checkout options for leaving conflict markers in the working tree.
pub fn conflict_checkout_builder() -> git2::build::CheckoutBuilder<'static> {
    let mut b = git2::build::CheckoutBuilder::new();
    b.allow_conflicts(true).conflict_style_merge(true);
    b
}

/// Inspect repository state for an in-progress operation and conflicts.
pub fn operation_state(path: &Path) -> AppResult<RepoOperationState> {
    let repo = open(path)?;
    let kind = map_repo_state(repo.state());
    let index = repo.index()?;
    let conflicted_count = stage::working_status(path)?.conflicted.len();
    let can_continue = kind != OperationKind::None && !index.has_conflicts();
    let merge_tool_name = configured_merge_tool_name(&repo, path)?;

    let label = operation_label(&repo, kind);

    Ok(RepoOperationState {
        kind,
        label,
        conflicted_count,
        can_continue,
        merge_tool_name,
    })
}

fn map_repo_state(state: RepositoryState) -> OperationKind {
    match state {
        RepositoryState::Merge => OperationKind::Merge,
        RepositoryState::Rebase
        | RepositoryState::RebaseInteractive
        | RepositoryState::RebaseMerge => OperationKind::Rebase,
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
            OperationKind::CherryPick
        }
        RepositoryState::Revert | RepositoryState::RevertSequence => OperationKind::Revert,
        _ => OperationKind::None,
    }
}

fn operation_label(repo: &Repository, kind: OperationKind) -> Option<String> {
    match kind {
        OperationKind::Merge => repo
            .find_reference("MERGE_HEAD")
            .ok()
            .and_then(|r| r.target())
            .map(|oid| format!("merging {}", oid)),
        OperationKind::Rebase => Some("rebase in progress".into()),
        OperationKind::CherryPick => Some("cherry-pick in progress".into()),
        OperationKind::Revert => Some("revert in progress".into()),
        OperationKind::None => None,
    }
}

/// Name shown in the UI for "Resolve using X".
pub fn configured_merge_tool_name(repo: &Repository, path: &Path) -> AppResult<Option<String>> {
    if let Ok(settings) = config::load_merge_tool_settings() {
        if let Some(t) = settings.merge_tool.filter(|s| !s.is_empty()) {
            return Ok(Some(t));
        }
    }
    let root = repo_root(repo, path);
    let out = Command::new("git")
        .args(["config", "--get", "merge.tool"])
        .current_dir(&root)
        .output()
        .map_err(|e| AppError::Other(e.to_string()))?;
    if out.status.success() {
        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !name.is_empty() {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

/// Stage a resolved file (same as `git add` after fixing conflicts).
pub fn mark_conflict_resolved(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    let mut index = repo.index()?;
    index.add_path(Path::new(file))?;
    index.write()?;
    Ok(())
}

/// Launch the configured external merge tool for one file.
pub fn resolve_with_mergetool(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    let root = repo_root(&repo, path);
    let tool_override = config::load_merge_tool_settings()
        .ok()
        .and_then(|s| s.merge_tool)
        .filter(|s| !s.is_empty());

    let mut cmd = Command::new("git");
    cmd.current_dir(&root);
    if let Some(tool) = &tool_override {
        cmd.args(["-c", &format!("merge.tool={tool}")]);
    }
    cmd.args(["mergetool", file]);

    let out = cmd
        .output()
        .map_err(|e| AppError::Other(format!("failed to run git mergetool: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        if stderr.contains("No merge tool configured") || stderr.contains("merge.tool") {
            return Err(AppError::InvalidArg(
                "No merge tool configured. Run `git config --global merge.tool meld` \
                 or set a tool in SourceFlow (right-click GitHub → merge tool settings)."
                    .into(),
            ));
        }
        return Err(AppError::Other(format!(
            "git mergetool failed: {}",
            stderr.trim()
        )));
    }
    Ok(())
}

/// Open the conflicted file in the user's editor (`$EDITOR` / xdg-open fallback).
pub fn open_in_editor(path: &Path, file: &str) -> AppResult<()> {
    let repo = open(path)?;
    let root = repo_root(&repo, path);
    let full = root.join(file);
    if !full.exists() {
        return Err(AppError::InvalidArg(format!("file not found: {file}")));
    }

    if let Ok(editor) = std::env::var("EDITOR").or_else(|_| std::env::var("VISUAL")) {
        let parts: Vec<&str> = editor.split_whitespace().collect();
        if !parts.is_empty() {
            let mut cmd = Command::new(parts[0]);
            if parts.len() > 1 {
                cmd.args(&parts[1..]);
            }
            cmd.arg(&full);
            let status = cmd
                .status()
                .map_err(|e| AppError::Other(format!("failed to launch editor: {e}")))?;
            if status.success() {
                return Ok(());
            }
        }
    }

    // KDE / generic desktop fallback.
    let status = Command::new("xdg-open")
        .arg(&full)
        .status()
        .map_err(|e| AppError::Other(format!("failed to open file: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Other(
            "could not open file — set $EDITOR or install xdg-open".into(),
        ))
    }
}

/// Finish the current merge / rebase / cherry-pick / revert.
pub fn continue_operation(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
    let root = repo_root(&repo, path);
    let index = repo.index()?;
    if index.has_conflicts() {
        return Err(AppError::InvalidArg(
            "there are still unresolved conflicts — resolve all files before continuing".into(),
        ));
    }

    match repo.state() {
        RepositoryState::Merge => run_git(&root, &["merge", "--continue"]),
        RepositoryState::Rebase
        | RepositoryState::RebaseInteractive
        | RepositoryState::RebaseMerge => run_git(&root, &["rebase", "--continue"]),
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
            run_git(&root, &["cherry-pick", "--continue"])
        }
        RepositoryState::Revert | RepositoryState::RevertSequence => {
            run_git(&root, &["revert", "--continue"])
        }
        _ => Err(AppError::InvalidArg(
            "no operation in progress to continue".into(),
        )),
    }
}

/// Abort the current merge / rebase / cherry-pick / revert.
pub fn abort_operation(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
    let root = repo_root(&repo, path);

    match repo.state() {
        RepositoryState::Merge => run_git(&root, &["merge", "--abort"]),
        RepositoryState::Rebase
        | RepositoryState::RebaseInteractive
        | RepositoryState::RebaseMerge => run_git(&root, &["rebase", "--abort"]),
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
            run_git(&root, &["cherry-pick", "--abort"])
        }
        RepositoryState::Revert | RepositoryState::RevertSequence => {
            run_git(&root, &["revert", "--abort"])
        }
        _ => {
            repo.cleanup_state()?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
            Ok(())
        }
    }
}

pub fn get_merge_tool_settings() -> AppResult<MergeToolSettings> {
    config::load_merge_tool_settings()
}

pub fn set_merge_tool_settings(settings: &MergeToolSettings) -> AppResult<()> {
    config::save_merge_tool_settings(settings)
}
