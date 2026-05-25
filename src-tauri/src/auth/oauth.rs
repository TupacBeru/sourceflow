//! GitHub OAuth Device Flow.
//!
//! We use the device flow rather than the standard authorization-code +
//! PKCE flow for two reasons:
//!   1. It does not require a registered redirect URI - we don't have to
//!      run a local HTTP listener (which simplifies sandboxing and
//!      packaging considerably).
//!   2. The UX is identical to `gh auth login`: open a URL, type a code.
//!
//! Reference: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
//!
//! The OAuth App client_id is resolved at runtime (see `resolve_client_id`):
//!   1. Value persisted via the in-app settings (preferred)
//!   2. `SOURCEFLOW_GH_CLIENT_ID` runtime env var (dev convenience)
//!   3. Compile-time `SOURCEFLOW_GH_CLIENT_ID` baked into the binary
//!
//! Register an OAuth App at https://github.com/settings/developers with the
//! "Device Flow" toggle on, then paste the client_id into Settings.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use crate::config;
use crate::error::{AppError, AppResult};

/// Compile-time fallback client_id, used only if neither the persisted
/// setting nor the runtime env var is set. Allows distributing prebuilt
/// binaries with a default OAuth App.
const COMPILE_CLIENT_ID: Option<&str> = option_env!("SOURCEFLOW_GH_CLIENT_ID");

/// Resolve the GitHub OAuth client_id from (in priority order) the
/// persisted config, the runtime env var, or the compile-time fallback.
///
/// Returned as an owned `String` so async tasks can move it freely.
pub fn resolve_client_id() -> AppResult<String> {
    if let Ok(Some(id)) = config::load_github_client_id() {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Ok(env_id) = std::env::var("SOURCEFLOW_GH_CLIENT_ID") {
        let trimmed = env_id.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Some(id) = COMPILE_CLIENT_ID {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    Err(AppError::Oauth(
        "GitHub client_id is not set. Open Settings (or the GitHub button) \
         in SourceFlow and paste the client_id of an OAuth App you registered \
         at https://github.com/settings/developers (with Device Flow enabled)."
            .into(),
    ))
}

/// Scopes we request. `repo` covers private + public, `read:user` lets us
/// show the avatar / username in the UI later.
const SCOPES: &str = "repo,read:user";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct PollResponse {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u64>,
}

pub async fn request_device_code(client_id: &str) -> AppResult<DeviceCodeResponse> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .await?
        .error_for_status()?;
    Ok(resp.json::<DeviceCodeResponse>().await?)
}

/// Poll the token endpoint until the user authorizes (or it times out).
pub async fn poll_for_token(
    client_id: &str,
    device_code: &str,
    mut interval_secs: u64,
) -> AppResult<String> {
    let client = reqwest::Client::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(900); // 15 minutes max

    loop {
        if std::time::Instant::now() > deadline {
            return Err(AppError::Oauth("device flow timed out".into()));
        }
        sleep(Duration::from_secs(interval_secs.max(1))).await;

        let resp: PollResponse = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?
            .json()
            .await?;

        if let Some(token) = resp.access_token {
            return Ok(token);
        }
        if let Some(i) = resp.interval {
            interval_secs = i;
        }
        match resp.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                interval_secs += 5;
                continue;
            }
            Some("expired_token") => {
                return Err(AppError::Oauth("device code expired".into()))
            }
            Some("access_denied") => {
                return Err(AppError::Oauth("user cancelled authorization".into()))
            }
            Some(other) => return Err(AppError::Oauth(other.to_string())),
            None => return Err(AppError::Oauth("unexpected empty response".into())),
        }
    }
}

#[derive(Debug, Deserialize)]
struct UserInfo {
    login: String,
}

/// Fetch the authenticated user's login - used to confirm the token works
/// and to show "Connected as @{login}" in the UI.
pub async fn fetch_login(token: &str) -> AppResult<String> {
    let client = reqwest::Client::new();
    let resp: UserInfo = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "sourceflow")
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(resp.login)
}
