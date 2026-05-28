//! Git credential helpers.
//!
//! For HTTPS GitHub remotes we present a short-lived OAuth token as an
//! "x-access-token" username with the token itself as the password. libgit2
//! uses these in the smart HTTP protocol the same way GitHub's CLI does.

use git2::{Cred, CredentialType, RemoteCallbacks};

use crate::auth::store;
use crate::error::{AppError, AppResult};

/// Whether `url` points at GitHub (HTTPS or SCP-style).
pub fn is_github_url(url: &str) -> bool {
    url.trim().contains("github.com")
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
    if !is_github_url(remote_url) {
        return Ok(());
    }
    if remote_url.starts_with("git@") || remote_url.contains("ssh://") {
        return Err(AppError::InvalidArg(
            "this remote uses SSH; SourceFlow uses your GitHub login for HTTPS remotes. \
             Run: git remote set-url origin https://github.com/OWNER/REPO.git"
                .into(),
        ));
    }
    github_https_cred().map_err(AppError::from)?;
    Ok(())
}
