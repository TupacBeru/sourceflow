use std::path::Path;

use git2::{BranchType, Repository};

use crate::error::AppResult;

use super::repo::open;
use super::types::{BranchInfo, BranchKind, StashInfo};

pub fn list_branches(path: &Path) -> AppResult<Vec<BranchInfo>> {
    let repo = open(path)?;
    let head_ref = repo.head().ok();
    let head_name = head_ref.as_ref().and_then(|h| h.shorthand()).map(String::from);

    let mut out = Vec::new();
    for branch in repo.branches(None)?.flatten() {
        let (b, kind_g2) = branch;
        let Ok(Some(name)) = b.name() else { continue };
        let name = name.to_string();
        let full_ref = b.get().name().unwrap_or("").to_string();
        let kind = match kind_g2 {
            BranchType::Local => BranchKind::Local,
            BranchType::Remote => BranchKind::Remote,
        };
        let is_head = matches!(&head_name, Some(h) if h == &name) && kind == BranchKind::Local;
        let local_target = b.get().target();

        // Only local branches with a configured upstream get ahead/behind
        // counts; for remote-tracking branches the comparison doesn't apply,
        // and computing it for unattached locals would be meaningless.
        let (upstream, ahead, behind) = if kind == BranchKind::Local {
            match b.upstream() {
                Ok(u) => {
                    let upstream_name = u
                        .name()
                        .ok()
                        .flatten()
                        .map(String::from);
                    let upstream_target = u.get().target();
                    let (ahead, behind) = match (local_target, upstream_target) {
                        (Some(l), Some(r)) => repo
                            .graph_ahead_behind(l, r)
                            .unwrap_or((0, 0)),
                        _ => (0, 0),
                    };
                    (upstream_name, ahead, behind)
                }
                Err(_) => (None, 0, 0),
            }
        } else {
            (None, 0, 0)
        };
        let target_sha = local_target.map(|oid| oid.to_string());

        out.push(BranchInfo {
            name,
            full_ref,
            kind,
            is_head,
            upstream,
            target_sha,
            ahead,
            behind,
        });
    }

    out.sort_by(|a, b| (a.kind, &a.name).cmp(&(b.kind, &b.name)));
    Ok(out)
}

pub fn list_stashes(path: &Path) -> AppResult<Vec<StashInfo>> {
    // `stash_foreach` requires &mut Repository.
    let mut repo = open(path)?;
    let mut out = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        out.push(StashInfo {
            index,
            message: message.to_string(),
            sha: oid.to_string(),
        });
        true
    })?;
    Ok(out)
}

/// Checkout a local branch by short name.
///
/// Performs a "safe" checkout - aborts if there are conflicts with local
/// changes. The frontend should surface the error and let the user stash or
/// commit first.
pub fn checkout_branch(path: &Path, branch: &str) -> AppResult<()> {
    let repo = open(path)?;
    let local = repo.find_branch(branch, BranchType::Local).or_else(|_| {
        // Allow checking out a remote branch by creating a local tracking branch.
        create_tracking_branch(&repo, branch)
    })?;

    let reference = local.into_reference();
    let ref_name = reference
        .name()
        .ok_or_else(|| crate::error::AppError::InvalidArg("invalid ref name".into()))?
        .to_string();

    let target = reference
        .target()
        .ok_or_else(|| crate::error::AppError::InvalidArg("ref has no target".into()))?;

    let object = repo.find_object(target, None)?;
    let mut builder = git2::build::CheckoutBuilder::new();
    builder.safe();
    repo.checkout_tree(&object, Some(&mut builder))?;
    repo.set_head(&ref_name)?;
    Ok(())
}

fn create_tracking_branch<'r>(
    repo: &'r Repository,
    name: &str,
) -> Result<git2::Branch<'r>, git2::Error> {
    let remote_name = format!("origin/{name}");
    let remote_branch = repo.find_branch(&remote_name, BranchType::Remote)?;
    let target = remote_branch
        .get()
        .target()
        .ok_or_else(|| git2::Error::from_str("remote ref has no target"))?;
    let commit = repo.find_commit(target)?;
    let mut local = repo.branch(name, &commit, false)?;
    local.set_upstream(Some(&remote_name))?;
    Ok(local)
}
