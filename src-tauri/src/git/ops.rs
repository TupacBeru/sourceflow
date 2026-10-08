//! Higher-level repo operations: merge, rebase, cherry-pick, revert, reset,
//! plus branch CRUD and lightweight tag creation.
//!
//! On merge/rebase/cherry-pick/revert conflicts the repo is left in the
//! in-progress state so the user can resolve via external tools (see
//! `conflict.rs`).

use std::path::Path;

use git2::{
    BranchType, CherrypickOptions, Oid, RebaseOptions, Repository, ResetType, RevertOptions,
    Signature,
};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::conflict::{conflict_checkout_builder, run_git_network};
use super::repo::open;

/// Reset mode mirrors libgit2's `git2::ResetType` but is serde-friendly so the
/// frontend can pick which flavour the user wants.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

impl From<ResetMode> for ResetType {
    fn from(m: ResetMode) -> Self {
        match m {
            ResetMode::Soft => ResetType::Soft,
            ResetMode::Mixed => ResetType::Mixed,
            ResetMode::Hard => ResetType::Hard,
        }
    }
}

// ---------------------------------------------------------------------------
// Branch CRUD
// ---------------------------------------------------------------------------

/// Create a new branch at `start_point` (a commit SHA, or `None` for HEAD),
/// optionally checking it out.
pub fn create_branch(
    path: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidArg("branch name is required".into()));
    }
    let repo = open(path)?;
    let commit = match start_point {
        Some(sha) => {
            let oid =
                Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
            repo.find_commit(oid)?
        }
        None => repo.head()?.peel_to_commit()?,
    };
    let branch = repo.branch(name, &commit, false)?;
    if checkout {
        let reference = branch.into_reference();
        let ref_name = reference
            .name()
            .ok_or_else(|| AppError::InvalidArg("invalid ref name".into()))?
            .to_string();
        let object = repo.find_object(commit.id(), None)?;
        let mut builder = git2::build::CheckoutBuilder::new();
        builder.safe();
        repo.checkout_tree(&object, Some(&mut builder))?;
        repo.set_head(&ref_name)?;
    }
    Ok(())
}

/// Rename a local branch. Force-rename only when `force` is true, to mirror
/// `git branch -M`.
pub fn rename_branch(path: &Path, old: &str, new: &str, force: bool) -> AppResult<()> {
    if new.trim().is_empty() {
        return Err(AppError::InvalidArg("new branch name is required".into()));
    }
    let repo = open(path)?;
    let mut branch = repo.find_branch(old, BranchType::Local)?;
    branch.rename(new, force)?;
    Ok(())
}

/// Delete a local branch. Refuses to delete the currently checked-out one.
pub fn delete_branch(path: &Path, name: &str) -> AppResult<()> {
    let repo = open(path)?;
    let branch = repo.find_branch(name, BranchType::Local)?;
    if branch.is_head() {
        return Err(AppError::InvalidArg(
            "cannot delete the currently checked-out branch".into(),
        ));
    }
    let mut branch = branch;
    branch.delete()?;
    Ok(())
}

/// Set or clear the upstream tracking ref of a local branch.
pub fn set_upstream(path: &Path, branch: &str, upstream: Option<&str>) -> AppResult<()> {
    let repo = open(path)?;
    let mut local = repo.find_branch(branch, BranchType::Local)?;
    local.set_upstream(upstream)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/// Create a tag at `sha` (or HEAD if `None`). With a non-empty `message`
/// produces an annotated tag, otherwise a lightweight one.
pub fn create_tag(
    path: &Path,
    name: &str,
    target_sha: Option<&str>,
    message: Option<&str>,
) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidArg("tag name is required".into()));
    }
    let repo = open(path)?;
    let target = match target_sha {
        Some(sha) => {
            let oid =
                Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
            repo.find_object(oid, None)?
        }
        None => repo.head()?.peel(git2::ObjectType::Any)?,
    };
    match message.filter(|m| !m.trim().is_empty()) {
        Some(m) => {
            let sig = repo.signature().map_err(AppError::from)?;
            repo.tag(name, &target, &sig, m, false)?;
        }
        None => {
            repo.tag_lightweight(name, &target, false)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Checkout an arbitrary commit (detached HEAD)
// ---------------------------------------------------------------------------

pub fn checkout_sha(path: &Path, sha: &str) -> AppResult<()> {
    let repo = open(path)?;
    let oid = Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
    let object = repo.find_object(oid, None)?;
    let mut builder = git2::build::CheckoutBuilder::new();
    builder.safe();
    repo.checkout_tree(&object, Some(&mut builder))?;
    repo.set_head_detached(oid)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

pub fn reset_to(path: &Path, sha: &str, mode: ResetMode) -> AppResult<()> {
    let repo = open(path)?;
    let oid = Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
    let target = repo.find_object(oid, None)?;
    repo.reset(&target, mode.into(), None)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/// Merge `branch` into the current HEAD branch.
///
/// Behaviour:
///  - **Up to date** → no-op.
///  - **Fast-forward** → moves HEAD ref to the new tip and checks out.
///  - **Non-FF, conflict-free** → writes a merge commit.
///  - **Conflicts** → leaves repo in merging state with conflict markers.
pub fn merge_branch(path: &Path, branch: &str) -> AppResult<()> {
    let repo = open(path)?;
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidArg(
            "cannot merge into detached HEAD".into(),
        ));
    }
    let head_branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::InvalidArg("invalid HEAD".into()))?
        .to_string();

    let other = find_branch_any(&repo, branch)?;
    let other_commit = other.get().peel_to_commit()?;
    let annotated = repo.find_annotated_commit(other_commit.id())?;
    let (analysis, _) = repo.merge_analysis(&[&annotated])?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
        let refname = format!("refs/heads/{head_branch_name}");
        let mut reference = repo.find_reference(&refname)?;
        reference.set_target(other_commit.id(), "fast-forward merge")?;
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
        return Ok(());
    }

    let mut checkout = conflict_checkout_builder();
    repo.merge(&[&annotated], None, Some(&mut checkout))?;
    let mut index = repo.index()?;
    if index.has_conflicts() {
        return Ok(());
    }
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature().map_err(AppError::from)?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let msg = format!("Merge branch '{branch}' into {head_branch_name}");
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &msg,
        &tree,
        &[&head_commit, &other_commit],
    )?;
    repo.cleanup_state()?;
    Ok(())
}

pub fn abort_merge(path: &Path) -> AppResult<()> {
    super::conflict::abort_operation(path)
}

// ---------------------------------------------------------------------------
// Rebase
// ---------------------------------------------------------------------------

/// Rebase the current branch onto `onto` (a branch name).
///
/// If any commit produces conflicts the rebase stops in progress for resolution.
pub fn rebase_onto(path: &Path, onto: &str) -> AppResult<()> {
    let repo = open(path)?;
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidArg("cannot rebase a detached HEAD".into()));
    }

    let head_commit = head.peel_to_commit()?;
    let head_annotated = repo.find_annotated_commit(head_commit.id())?;
    let onto_branch = find_branch_any(&repo, onto)?;
    let onto_commit = onto_branch.get().peel_to_commit()?;
    let onto_annotated = repo.find_annotated_commit(onto_commit.id())?;

    let mut opts = RebaseOptions::new();
    opts.checkout_options(conflict_checkout_builder());
    let mut rebase = repo.rebase(
        Some(&head_annotated),
        None, // upstream defaults to merge base of HEAD and onto
        Some(&onto_annotated),
        Some(&mut opts),
    )?;

    let sig = repo.signature().map_err(AppError::from)?;
    while let Some(op) = rebase.next() {
        let _ = op?;
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(());
        }
        rebase.commit(None, &sig, None)?;
    }
    rebase.finish(Some(&sig))?;
    Ok(())
}

pub fn abort_rebase(path: &Path) -> AppResult<()> {
    super::conflict::abort_operation(path)
}

// ---------------------------------------------------------------------------
// Cherry-pick
// ---------------------------------------------------------------------------

/// Apply `sha` on top of HEAD, creating a new commit with the same message
/// and authorship metadata as the source.
pub fn cherry_pick(path: &Path, sha: &str) -> AppResult<()> {
    let repo = open(path)?;
    let oid = Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
    let commit = repo.find_commit(oid)?;

    let mut cp_opts = CherrypickOptions::new();
    cp_opts.checkout_builder(conflict_checkout_builder());
    repo.cherrypick(&commit, Some(&mut cp_opts))?;
    let mut index = repo.index()?;
    if index.has_conflicts() {
        return Ok(());
    }
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature().map_err(AppError::from)?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let msg = commit.message().unwrap_or("Cherry-pick");
    repo.commit(
        Some("HEAD"),
        &commit.author(),
        &sig,
        msg,
        &tree,
        &[&head_commit],
    )?;
    repo.cleanup_state()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Revert
// ---------------------------------------------------------------------------

/// Create a new commit that undoes the changes introduced by `sha`.
pub fn revert_commit(path: &Path, sha: &str) -> AppResult<()> {
    let repo = open(path)?;
    let oid = Oid::from_str(sha).map_err(|_| AppError::InvalidArg(format!("bad sha: {sha}")))?;
    let commit = repo.find_commit(oid)?;
    if commit.parent_count() > 1 {
        return Err(AppError::InvalidArg(
            "reverting merge commits is not supported yet".into(),
        ));
    }

    let mut rev_opts = RevertOptions::new();
    rev_opts.checkout_builder(conflict_checkout_builder());
    repo.revert(&commit, Some(&mut rev_opts))?;
    let mut index = repo.index()?;
    if index.has_conflicts() {
        return Ok(());
    }
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature().map_err(AppError::from)?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let short = sha.chars().take(7).collect::<String>();
    let summary = commit.summary().unwrap_or("");
    let msg = format!("Revert \"{summary}\"\n\nThis reverts commit {short}.\n");
    repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&head_commit])?;
    repo.cleanup_state()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Push a specific branch (separate from push_current's HEAD-only flow)
// ---------------------------------------------------------------------------

pub fn push_branch(path: &Path, branch: &str, set_upstream_remote: Option<&str>) -> AppResult<()> {
    let repo = open(path)?;
    let local = repo.find_branch(branch, BranchType::Local)?;
    let remote_name = match set_upstream_remote {
        Some(r) => r.to_string(),
        None => local
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(String::from))
            .and_then(|n| n.split('/').next().map(String::from))
            .unwrap_or_else(|| "origin".to_string()),
    };
    drop(local);

    let root = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidArg("bare repos not supported".into()))?;

    if set_upstream_remote.is_some() {
        run_git_network(root, &["push", "-u", &remote_name, branch])?;
    } else {
        run_git_network(root, &["push", &remote_name, branch])?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find a branch by name, trying local first then remote (`origin/...`).
fn find_branch_any<'r>(repo: &'r Repository, name: &str) -> AppResult<git2::Branch<'r>> {
    if let Ok(b) = repo.find_branch(name, BranchType::Local) {
        return Ok(b);
    }
    if let Ok(b) = repo.find_branch(name, BranchType::Remote) {
        return Ok(b);
    }
    // Try with origin/ prefix if user passed a bare name like "main".
    if let Ok(b) = repo.find_branch(&format!("origin/{name}"), BranchType::Remote) {
        return Ok(b);
    }
    Err(AppError::InvalidArg(format!("branch not found: {name}")))
}

/// Compatibility shim - we need a Signature with a 'static lifetime in a few
/// places. Currently unused but kept for future ops that build sigs manually.
#[allow(dead_code)]
fn now_sig(repo: &Repository) -> AppResult<Signature<'static>> {
    repo.signature().map_err(AppError::from)
}
