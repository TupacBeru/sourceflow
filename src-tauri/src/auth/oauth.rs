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
//! Replace `CLIENT_ID` with the client_id of an OAuth App you register
//! at https://github.com/settings/developers . The "device flow" toggle
//! must be enabled on that app.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use crate::error::{AppError, AppResult};

/// OAuth App client_id, baked in at compile time.
///
/// Embedding it in the binary is fine: with device flow there is no
/// client_secret, and any malicious actor who reuses the client_id is
/// constrained by GitHub's user-consent step.
///
/// To set it: `SOURCEFLOW_GH_CLIENT_ID=Iv1.xxxxx npm run tauri:dev`
/// (or export it once in your shell rc).
const CLIENT_ID_OPT: Option<&str> = option_env!("SOURCEFLOW_GH_CLIENT_ID");

fn client_id() -> AppResult<&'static str> {
    CLIENT_ID_OPT.ok_or_else(|| {
        AppError::Oauth(
            "GitHub client_id is not configured. Register an OAuth App at \
             https://github.com/settings/developers (enable Device Flow), \
             then rebuild with SOURCEFLOW_GH_CLIENT_ID=<your_client_id>."
                .into(),
        )
    })
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

pub async fn request_device_code() -> AppResult<DeviceCodeResponse> {
    let id = client_id()?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", id), ("scope", SCOPES)])
        .send()
        .await?
        .error_for_status()?;
    Ok(resp.json::<DeviceCodeResponse>().await?)
}

/// Poll the token endpoint until the user authorizes (or it times out).
pub async fn poll_for_token(device_code: &str, mut interval_secs: u64) -> AppResult<String> {
    let id = client_id()?;
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
                ("client_id", id),
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
