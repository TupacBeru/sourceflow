use std::path::Path;

use git2::{BranchType, Oid};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::conflict::{run_git, run_git_network};
use super::repo::open;
use super::types::AheadBehind;

/// How to integrate upstream commits when a plain fast-forward is not possible.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PullStrategy {
    /// Fetch + fast-forward only; error if merge or rebase would be required.
    FfOnly,
    /// Fetch + merge upstream into the current branch (creates a merge commit when needed).
    Merge,
    /// Fetch + rebase local commits onto the updated upstream tip.
    Rebase,
}

struct PullContext {
    branch_name: String,
    fetch_oid: Oid,
    analysis: git2::MergeAnalysis,
    /// Upstream tracking ref without `refs/remotes/` (e.g. `origin/main`).
    upstream_short: String,
}

/// Fetch all configured remotes via the `git` CLI so the user's credential
/// helper, proxy settings, and remote-tracking ref updates match terminal git.
pub fn fetch_all(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
    let root = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidArg("bare repos not supported".into()))?;
    run_git_network(root, &["fetch", "--all", "--prune"])
}

/// Pull (fetch + integrate) on the current branch.
pub fn pull_current(path: &Path, strategy: PullStrategy) -> AppResult<()> {
    let repo = open(path)?;
    let ctx = fetch_upstream_for_pull(&repo)?;

    if ctx.analysis.is_up_to_date() {
        return Ok(());
    }

    if ctx.analysis.is_fast_forward() {
        fast_forward_pull(&repo, &ctx)?;
        return Ok(());
    }

    match strategy {
        PullStrategy::FfOnly => Err(AppError::PullNotFastForward),
        PullStrategy::Merge => pull_merge(path, &ctx),
        PullStrategy::Rebase => pull_rebase(path, &ctx),
    }
}

fn fetch_upstream_for_pull(repo: &git2::Repository) -> AppResult<PullContext> {
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidArg(
            "cannot pull while in detached HEAD".into(),
        ));
    }
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::InvalidArg("invalid HEAD".into()))?
        .to_string();
    let local_branch = repo.find_branch(&branch_name, BranchType::Local)?;
    let upstream = local_branch
        .upstream()
        .map_err(|_| AppError::InvalidArg(format!("no upstream for {branch_name}")))?;
    let upstream_ref = upstream
        .get()
        .name()
        .ok_or_else(|| AppError::InvalidArg("invalid upstream ref".into()))?
        .to_string();

    let remote_name = upstream_ref
        .strip_prefix("refs/remotes/")
        .and_then(|s| s.split('/').next())
        .unwrap_or("origin")
        .to_string();
    drop(local_branch);
    drop(upstream);
    drop(head);

    let root = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidArg("bare repos not supported".into()))?;
    run_git_network(root, &["fetch", &remote_name, &branch_name])?;

    let fetch_head = repo.find_reference("FETCH_HEAD")?;
    let fetch = repo.reference_to_annotated_commit(&fetch_head)?;
    let (analysis, _) = repo.merge_analysis(&[&fetch])?;

    let upstream_short = upstream_ref
        .strip_prefix("refs/remotes/")
        .map(String::from)
        .unwrap_or(upstream_ref);

    Ok(PullContext {
        branch_name,
        fetch_oid: fetch.id(),
        analysis,
        upstream_short,
    })
}

fn fast_forward_pull(repo: &git2::Repository, ctx: &PullContext) -> AppResult<()> {
    let refname = format!("refs/heads/{}", ctx.branch_name);
    let mut reference = repo.find_reference(&refname)?;
    reference.set_target(ctx.fetch_oid, "fast-forward")?;
    repo.set_head(&refname)?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
    Ok(())
}

/// Integrate fetched upstream with a merge commit (`git merge FETCH_HEAD`).
fn pull_merge(path: &Path, _ctx: &PullContext) -> AppResult<()> {
    run_git(path, &["merge", "FETCH_HEAD"])
}

/// Replay local commits on top of the updated upstream (`git rebase @{upstream}`).
fn pull_rebase(path: &Path, ctx: &PullContext) -> AppResult<()> {
    run_git(path, &["rebase", &ctx.upstream_short])
}

/// Push the current branch to its upstream remote via the `git` CLI so the
/// user's credential helper (e.g. `gh auth`) is used. Also updates local
/// remote-tracking refs the way `git push` does on the command line.
pub fn push_current(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidArg(
            "cannot push detached HEAD with this command".into(),
        ));
    }
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::InvalidArg("invalid HEAD".into()))?
        .to_string();

    let local = repo.find_branch(&branch_name, BranchType::Local)?;
    let upstream_name = local
        .upstream()
        .ok()
        .and_then(|u| u.name().ok().flatten().map(String::from));
    let has_upstream = upstream_name.is_some();
    let remote_name = upstream_name
        .as_deref()
        .and_then(|n| n.split('/').next())
        .unwrap_or("origin")
        .to_string();
    drop(local);
    drop(head);

    let root = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidArg("bare repos not supported".into()))?;

    // First push of a local-only branch: publish and set tracking
    // (`git push -u origin <branch>`). The toolbar used to disable Push
    // entirely in this case.
    if has_upstream {
        run_git_network(root, &["push", &remote_name, &branch_name])
    } else {
        run_git_network(root, &["push", "-u", &remote_name, &branch_name])
    }
}

/// Compute ahead/behind for HEAD vs its upstream (no fetching - reflects the
/// last fetched state). Returns `Some` even when the counts are zero, so the
/// frontend can render "up to date".
pub fn ahead_behind(path: &Path) -> AppResult<AheadBehind> {
    let repo = open(path)?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(AheadBehind::default()),
    };
    if !head.is_branch() {
        return Ok(AheadBehind::default());
    }
    let local_oid = match head.target() {
        Some(o) => o,
        None => return Ok(AheadBehind::default()),
    };
    let branch_name = head.shorthand().unwrap_or("").to_string();
    let local = match repo.find_branch(&branch_name, BranchType::Local) {
        Ok(b) => b,
        Err(_) => return Ok(AheadBehind::default()),
    };
    let upstream = match local.upstream() {
        Ok(u) => u,
        Err(_) => return Ok(AheadBehind::default()),
    };
    let upstream_oid = match upstream.get().target() {
        Some(o) => o,
        None => return Ok(AheadBehind::default()),
    };
    let upstream_name = upstream.name().ok().flatten().map(String::from);

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
    Ok(AheadBehind {
        ahead,
        behind,
        upstream: upstream_name,
    })
}
