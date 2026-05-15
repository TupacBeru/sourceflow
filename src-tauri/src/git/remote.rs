use std::path::Path;

use git2::{AnnotatedCommit, BranchType, FetchOptions, PushOptions};

use crate::error::{AppError, AppResult};

use super::credentials::github_callbacks;
use super::repo::open;
use super::types::AheadBehind;

/// Fetch all configured remotes.
pub fn fetch_all(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
    let names = repo.remotes()?;
    for name in names.iter().flatten() {
        let mut remote = repo.find_remote(name)?;
        let mut opts = FetchOptions::new();
        opts.remote_callbacks(github_callbacks());
        opts.prune(git2::FetchPrune::On);
        let refspecs: Vec<String> = remote
            .refspecs()
            .filter_map(|r| r.str().map(String::from))
            .collect();
        let refspec_strs: Vec<&str> = refspecs.iter().map(String::as_str).collect();
        remote.fetch(&refspec_strs, Some(&mut opts), None)?;
    }
    Ok(())
}

/// Pull (fetch + fast-forward merge) on the current branch.
///
/// Phase 1 only supports fast-forward pulls. If a non-FF merge is required
/// we surface a clear error and ask the user to rebase or merge explicitly
/// in Phase 2.
pub fn pull_current(path: &Path) -> AppResult<()> {
    let repo = open(path)?;
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

    // Determine the remote name from the upstream ref (e.g. refs/remotes/origin/main -> origin)
    let remote_name = upstream_ref
        .strip_prefix("refs/remotes/")
        .and_then(|s| s.split('/').next())
        .unwrap_or("origin")
        .to_string();
    drop(local_branch);
    drop(upstream);
    drop(head);

    let mut remote = repo.find_remote(&remote_name)?;
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(github_callbacks());
    remote.fetch(
        &[format!("refs/heads/{branch_name}")],
        Some(&mut opts),
        None,
    )?;

    let fetch_head = repo.find_reference("FETCH_HEAD")?;
    let fetch_commit: AnnotatedCommit = repo.reference_to_annotated_commit(&fetch_head)?;
    let analysis = repo.merge_analysis(&[&fetch_commit])?;

    if analysis.0.is_up_to_date() {
        return Ok(());
    }
    if analysis.0.is_fast_forward() {
        let refname = format!("refs/heads/{branch_name}");
        let mut reference = repo.find_reference(&refname)?;
        reference.set_target(fetch_commit.id(), "fast-forward")?;
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
        return Ok(());
    }

    Err(AppError::InvalidArg(
        "non-fast-forward pull required - merge or rebase support comes in Phase 2".into(),
    ))
}

/// Push the current branch to its upstream remote.
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
    let remote_name = upstream_name
        .as_deref()
        .and_then(|n| n.split('/').next())
        .unwrap_or("origin")
        .to_string();
    drop(local);
    drop(head);

    let mut remote = repo.find_remote(&remote_name)?;
    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");
    let mut opts = PushOptions::new();
    opts.remote_callbacks(github_callbacks());
    remote.push(&[refspec.as_str()], Some(&mut opts))?;
    Ok(())
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
    let upstream_name = upstream
        .name()
        .ok()
        .flatten()
        .map(String::from);

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
    Ok(AheadBehind {
        ahead,
        behind,
        upstream: upstream_name,
    })
}
