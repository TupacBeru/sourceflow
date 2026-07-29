//! Git credential helpers.
//!
//! HTTPS GitHub remotes use the OAuth token stored in the OS keyring when the
//! user signs in via SourceFlow — no browser popups, same idea as SourceTree.
//! libgit2 callbacks and `git` CLI subprocesses both go through this module.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use git2::{Cred, CredentialType, RemoteCallbacks};

use crate::auth::store;
use crate::error::{AppError, AppResult};

use super::repo::open;

/// Whether `url` points at GitHub (HTTPS or SCP-style).
pub fn is_github_url(url: &str) -> bool {
    url.trim().contains("github.com")
}

/// Whether `url` is an HTTPS GitHub remote (not SSH).
pub fn is_github_https_url(url: &str) -> bool {
    let u = url.trim();
    is_github_url(u) && !u.starts_with("git@") && !u.contains("ssh://")
}

fn github_https_cred() -> Result<Cred, git2::Error> {
    match store::load_github_token() {
        Ok(Some(token)) => Cred::userpass_plaintext("x-access-token", &token),
        Ok(None) => Err(git2::Error::from_str(
            "GitHub is not connected — use the GitHub button in SourceFlow to sign in",
        )),
        Err(e) => Err(git2::Error::from_str(&format!(
            "could not read GitHub token from keyring: {e}"
        ))),
    }
}

/// Build a `RemoteCallbacks` that supplies a GitHub token for HTTPS remotes.
///
/// GitHub HTTPS never falls back to the system credential helper (no browser
/// popups). Non-GitHub remotes may still use SSH agent or `Cred::default()`.
pub fn github_callbacks<'cb>() -> RemoteCallbacks<'cb> {
    let mut cbs = RemoteCallbacks::new();
    cbs.credentials(move |url, username_from_url, allowed| {
        if is_github_url(url) {
            if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
                return github_https_cred();
            }
            if allowed.contains(CredentialType::DEFAULT) {
                return Err(git2::Error::from_str(
                    "GitHub HTTPS requires signing in to SourceFlow (no system credential helper)",
                ));
            }
            return Err(git2::Error::from_str(
                "no supported credential type for GitHub",
            ));
        }

        // Non-GitHub: SSH agent, then optional system helper.
        if allowed.contains(CredentialType::SSH_KEY) {
            if let Some(user) = username_from_url {
                if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                    return Ok(cred);
                }
            }
        }

        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(Some(token)) = store::load_github_token() {
                if let Ok(cred) = Cred::userpass_plaintext("x-access-token", &token) {
                    return Ok(cred);
                }
            }
        }

        if allowed.contains(CredentialType::DEFAULT) {
            return Cred::default();
        }

        Err(git2::Error::from_str(
            "no credentials available for this remote",
        ))
    });
    cbs
}

/// Pre-flight before push/fetch/pull on a known remote URL.
pub fn ensure_github_git_auth(remote_url: &str) -> AppResult<()> {
    if !is_github_https_url(remote_url) {
        return Ok(());
    }
    github_https_cred().map_err(AppError::from)?;
    Ok(())
}

/// Configure a `git` subprocess for fetch/push: inject the SourceFlow GitHub
/// token and disable the system credential helper so nothing opens a browser.
pub(crate) fn configure_network_command(cmd: &mut Command, repo_root: &Path) -> AppResult<()> {
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GCM_INTERACTIVE", "never");
    // No git subprocess we spawn may ever prompt interactively or pop up an
    // askpass/browser dialog, GitHub remote or not. Non-interactive helpers
    // (e.g. cached credentials for other hosts) still work.
    cmd.arg("-c").arg("credential.interactive=never");
    cmd.arg("-c").arg("core.askPass=");

    let repo = open(repo_root)?;
    let mut needs_github = false;
    for name in repo.remotes()?.iter().flatten() {
        let Ok(remote) = repo.find_remote(name) else {
            continue;
        };
        // A remote can have distinct fetch and push URLs; either may be a
        // GitHub HTTPS URL (e.g. SSH fetch + HTTPS push).
        for url in [remote.url(), remote.pushurl()].into_iter().flatten() {
            if !is_github_https_url(url) {
                continue;
            }
            ensure_github_git_auth(url)?;
            needs_github = true;
        }
    }

    if !needs_github {
        return Ok(());
    }

    let token = store::load_github_token()?.ok_or_else(|| {
        AppError::InvalidArg(
            "GitHub is not connected — use the GitHub button in SourceFlow to sign in".into(),
        )
    })?;

    cmd.env("SOURCEFLOW_GITHUB_TOKEN", &token);
    let helper = git_credential_helper_script()?;

    // Replace helpers for github.com only (empty value resets the inherited
    // helper list, e.g. git-credential-oauth which opens a browser). Other
    // hosts keep whatever helpers the user configured.
    cmd.arg("-c").arg("credential.https://github.com.helper=");
    cmd.arg("-c").arg(format!(
        "credential.https://github.com.helper={}",
        helper.display()
    ));
    Ok(())
}

/// Small credential helper script; token is passed via env so we never embed
/// secrets on disk. `http.extraHeader` was tried first but makes git/curl hang
/// ~132s and fail with a misleading "Could not connect to server" error.
fn git_credential_helper_script() -> AppResult<&'static PathBuf> {
    static HELPER: OnceLock<PathBuf> = OnceLock::new();
    Ok(HELPER.get_or_init(|| {
        let path = std::env::temp_dir().join(format!(
            "sourceflow-git-credential-{}.sh",
            std::process::id()
        ));
        let script = r#"#!/bin/sh
case "$1" in
get)
    printf '%s\n' "username=x-access-token"
    printf '%s\n' "password=${SOURCEFLOW_GITHUB_TOKEN}"
    ;;
esac
"#;
        std::fs::write(&path, script).expect("write git credential helper");
        #[cfg(unix)]
        {
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700));
        }
        path
    }))
}
