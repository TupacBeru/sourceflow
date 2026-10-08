use serde::Serialize;
use tauri::Emitter;

use crate::auth::{oauth, store};
use crate::config;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct GithubStatus {
    pub connected: bool,
    pub login: Option<String>,
    /// Whether a GitHub OAuth client_id is configured anywhere (persisted,
    /// env, or compiled-in). The UI uses this to decide whether to show the
    /// "Connect" button or the "Set client_id first" prompt.
    pub has_client_id: bool,
    /// The stored token works but is missing scopes we now require (e.g.
    /// `workflow`). The UI shows a one-time "update permissions" prompt; the
    /// token keeps working for everything else in the meantime.
    pub needs_reauth: bool,
}

/// Initiate the GitHub Device Flow.
///
/// Returns the verification URL + user code immediately so the frontend can
/// show them, then resolves once the user authorizes (or rejects/times out).
/// On success the token is stored in the OS keyring and the GitHub login is
/// returned for display.
#[derive(Debug, Serialize)]
pub struct OauthResult {
    pub login: String,
}

#[tauri::command]
pub async fn start_github_oauth(window: tauri::Window) -> AppResult<OauthResult> {
    let client_id = oauth::resolve_client_id()?;
    let device = oauth::request_device_code(&client_id).await?;

    // Push the user-facing instructions to the frontend before we start polling.
    let _ = window.emit(
        "oauth:device_code",
        serde_json::json!({
            "user_code": device.user_code,
            "verification_uri": device.verification_uri,
            "expires_in": device.expires_in,
        }),
    );

    let token = oauth::poll_for_token(&client_id, &device.device_code, device.interval).await?;
    store::save_github_token(&token)?;
    let login = oauth::fetch_user(&token).await?.login;
    Ok(OauthResult { login })
}

#[tauri::command]
pub async fn github_status() -> AppResult<GithubStatus> {
    let has_client_id = oauth::resolve_client_id().is_ok();
    let Some(token) = store::load_github_token()? else {
        return Ok(GithubStatus {
            connected: false,
            login: None,
            has_client_id,
            needs_reauth: false,
        });
    };
    // Validate by hitting /user. Only delete the token if GitHub explicitly
    // tells us the token is bad (401/403) - transient failures (offline,
    // DNS, 5xx) leave the token in place so we auto-reconnect once the
    // network comes back. Without this guard, starting the app while WiFi
    // is still re-associating would nuke the token on every boot.
    match oauth::fetch_user(&token).await {
        Ok(user) => Ok(GithubStatus {
            connected: true,
            login: Some(user.login),
            has_client_id,
            needs_reauth: !oauth::has_required_scopes(&user.scopes),
        }),
        Err(AppError::Network(ref e))
            if matches!(e.status().map(|s| s.as_u16()), Some(401) | Some(403)) =>
        {
            let _ = store::delete_github_token();
            Ok(GithubStatus {
                connected: false,
                login: None,
                has_client_id,
                needs_reauth: false,
            })
        }
        Err(_) => Ok(GithubStatus {
            connected: false,
            login: None,
            has_client_id,
            needs_reauth: false,
        }),
    }
}

#[tauri::command]
pub fn github_logout() -> AppResult<()> {
    store::delete_github_token()
}

#[tauri::command]
pub fn get_github_client_id() -> AppResult<Option<String>> {
    config::load_github_client_id()
}

#[tauri::command]
pub fn set_github_client_id(id: Option<String>) -> AppResult<()> {
    config::save_github_client_id(id)
}
