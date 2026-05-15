//! Git credential helpers.
//!
//! For HTTPS GitHub remotes we present a short-lived OAuth token as an
//! "x-access-token" username with the token itself as the password. libgit2
//! uses these in the smart HTTP protocol the same way GitHub's CLI does.

use git2::{Cred, CredentialType, RemoteCallbacks};

use crate::auth::store;

/// Build a `RemoteCallbacks` that supplies a GitHub token for HTTPS remotes.
///
/// If no token is stored we fall back to the system credential helper /
/// SSH agent / key probing - so non-GitHub remotes can still work, but the
/// "no popups" promise only applies once the user has connected GitHub.
pub fn github_callbacks<'cb>() -> RemoteCallbacks<'cb> {
    let mut cbs = RemoteCallbacks::new();
    cbs.credentials(move |url, username_from_url, allowed| {
        // SSH path: try the agent.
        if allowed.contains(CredentialType::SSH_KEY) {
            if let Some(user) = username_from_url {
                if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                    return Ok(cred);
                }
            }
        }

        // HTTPS path: prefer our stored OAuth token for github.com URLs.
        let is_github = url.contains("github.com");
        if is_github && allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(Some(token)) = store::load_github_token() {
                return Cred::userpass_plaintext("x-access-token", &token);
            }
        }

        // Last-resort default - lets git's own helpers respond if configured.
        if allowed.contains(CredentialType::DEFAULT) {
            return Cred::default();
        }

        Err(git2::Error::from_str(
            "no credentials available - connect GitHub in SourceFlow first",
        ))
    });
    cbs
}
