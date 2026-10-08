//! Watch open repositories for git changes made outside the app.
//!
//! Agents, terminals, and other tools rewrite `.git` (HEAD, refs, the index)
//! without going through our commands. A debounced watcher turns those bursts
//! into a single `repo:changed` event per tab so the UI can reload.
//!
//! Object storage is not watched: a commit can touch thousands of files under
//! `.git/objects`, and the branch ref update is the signal we actually need.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::git;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoChanged {
    tab_id: String,
}

pub struct RepoWatcher {
    inner: Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher>>>,
}

impl RepoWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Start (or replace) a watch for `workdir`. Failures are returned so the
    /// caller can log them; opening the repo still succeeds without a watch.
    pub fn watch(&self, app: AppHandle, tab_id: String, workdir: &Path) -> AppResult<()> {
        self.unwatch(&tab_id);

        let repo = git::repo::open(workdir)?;
        let git_dir = canonicalize_existing(repo.path());
        let common_dir = common_git_dir(&git_dir);
        let paths = watch_paths(&git_dir, &common_dir);

        let emit_id = tab_id.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(400),
            move |result: DebounceEventResult| match result {
                Ok(_) => {
                    let _ = app.emit(
                        "repo:changed",
                        RepoChanged {
                            tab_id: emit_id.clone(),
                        },
                    );
                }
                Err(err) => {
                    tracing::warn!(error = %err, "repository watch error");
                }
            },
        )
        .map_err(|err| AppError::Other(format!("could not start repository watch: {err}")))?;

        let mut armed = 0;
        for (path, mode) in &paths {
            match debouncer.watcher().watch(path, *mode) {
                Ok(()) => armed += 1,
                Err(err) => {
                    tracing::debug!(path = %path.display(), error = %err, "skip watch path");
                }
            }
        }
        if armed == 0 {
            return Err(AppError::Other(format!(
                "could not watch git metadata in {}",
                git_dir.display()
            )));
        }

        tracing::info!(
            tab_id = %tab_id,
            git_dir = %git_dir.display(),
            paths = armed,
            "watching repository for external changes"
        );
        self.inner
            .lock()
            .expect("repo watcher mutex poisoned")
            .insert(tab_id, debouncer);
        Ok(())
    }

    pub fn unwatch(&self, tab_id: &str) {
        self.inner
            .lock()
            .expect("repo watcher mutex poisoned")
            .remove(tab_id);
    }
}

fn canonicalize_existing(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Linked worktrees keep HEAD locally but store refs in the common git dir
/// (the path named by `.git/commondir`, usually `../..`).
fn common_git_dir(git_dir: &Path) -> PathBuf {
    let marker = git_dir.join("commondir");
    let Ok(contents) = std::fs::read_to_string(&marker) else {
        return git_dir.to_path_buf();
    };
    let rel = PathBuf::from(contents.trim());
    let joined = if rel.is_absolute() {
        rel
    } else {
        git_dir.join(rel)
    };
    canonicalize_existing(&joined)
}

fn watch_paths(git_dir: &Path, common_dir: &Path) -> Vec<(PathBuf, RecursiveMode)> {
    let mut paths = vec![(git_dir.to_path_buf(), RecursiveMode::NonRecursive)];
    push_if_dir(
        &mut paths,
        &common_dir.join("refs"),
        RecursiveMode::Recursive,
    );
    push_if_dir(
        &mut paths,
        &common_dir.join("logs"),
        RecursiveMode::Recursive,
    );
    if common_dir != git_dir {
        // packed-refs lives in the common dir. Non-recursive so we don't
        // descend into objects/.
        paths.push((common_dir.to_path_buf(), RecursiveMode::NonRecursive));
        push_if_dir(&mut paths, &git_dir.join("logs"), RecursiveMode::Recursive);
    }
    paths
}

fn push_if_dir(paths: &mut Vec<(PathBuf, RecursiveMode)>, path: &Path, mode: RecursiveMode) {
    if path.is_dir() {
        paths.push((path.to_path_buf(), mode));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::Watcher;
    use std::process::Command;
    use std::sync::mpsc;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Tmp(PathBuf);

    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn tmp_dir() -> Tmp {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("sourceflow-watch-{nanos}"));
        std::fs::create_dir_all(&path).unwrap();
        Tmp(path)
    }

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .status()
            .expect("git");
        assert!(status.success(), "git {args:?} failed");
    }

    #[test]
    fn watches_metadata_dirs_and_not_objects() {
        let dir = tmp_dir();
        git(&dir.0, &["init", "-b", "main"]);
        let git_dir = canonicalize_existing(&dir.0.join(".git"));
        let common = common_git_dir(&git_dir);
        assert_eq!(common, git_dir);

        let paths = watch_paths(&git_dir, &common);
        assert!(
            paths
                .iter()
                .any(|(p, m)| p == &git_dir && *m == RecursiveMode::NonRecursive),
            "git dir itself should be watched non-recursively"
        );
        assert!(paths
            .iter()
            .any(|(p, m)| p.ends_with("refs") && *m == RecursiveMode::Recursive));
        assert!(
            paths.iter().all(|(p, _)| !p.ends_with("objects")),
            "object storage must not be watched"
        );
    }

    #[test]
    fn worktree_refs_live_in_the_common_dir() {
        let dir = tmp_dir();
        let main = dir.0.join("main");
        let wt = dir.0.join("wt");
        std::fs::create_dir_all(&main).unwrap();
        git(&main, &["init", "-b", "main"]);
        git(&main, &["commit", "--allow-empty", "-m", "init"]);
        git(&main, &["worktree", "add", wt.to_str().unwrap()]);

        let git_dir = canonicalize_existing(&wt.join(".git"));
        // A linked worktree's .git is a file. The real git dir is under worktrees/.
        let git_dir = if git_dir.is_file() {
            let text = std::fs::read_to_string(&git_dir).unwrap();
            let rel = text.trim().trim_start_matches("gitdir: ");
            canonicalize_existing(&wt.join(rel))
        } else {
            git_dir
        };
        let common = common_git_dir(&git_dir);
        assert_ne!(common, git_dir);
        assert!(common.ends_with(".git"));

        let paths = watch_paths(&git_dir, &common);
        assert!(paths.iter().any(|(p, _)| p == &common.join("refs")));
        assert!(paths.iter().all(|(p, _)| !p.ends_with("objects")));
    }

    #[test]
    fn rewriting_head_notifies_the_git_dir_watch() {
        let dir = tmp_dir();
        git(&dir.0, &["init", "-b", "main"]);
        let git_dir = canonicalize_existing(&dir.0.join(".git"));

        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
        watcher
            .watch(&git_dir, RecursiveMode::NonRecursive)
            .unwrap();

        std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/other\n").unwrap();
        let event = rx.recv_timeout(Duration::from_secs(2));
        assert!(
            event.is_ok(),
            "expected a notification for HEAD, got {event:?}"
        );
    }
}
