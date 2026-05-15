use serde::Serialize;
use tauri::Emitter;

use crate::auth::{oauth, store};
use crate::error::AppResult;

#[derive(Debug, Serialize)]
pub struct GithubStatus {
    pub connected: bool,
    pub login: Option<String>,
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
pub async fn start_github_oauth(
    window: tauri::Window,
) -> AppResult<OauthResult> {
    let device = oauth::request_device_code().await?;

    // Push the user-facing instructions to the frontend before we start polling.
    let _ = window.emit(
        "oauth:device_code",
        serde_json::json!({
            "user_code": device.user_code,
            "verification_uri": device.verification_uri,
            "expires_in": device.expires_in,
        }),
    );

    let token = oauth::poll_for_token(&device.device_code, device.interval).await?;
    store::save_github_token(&token)?;
    let login = oauth::fetch_login(&token).await?;
    Ok(OauthResult { login })
}

#[tauri::command]
pub async fn github_status() -> AppResult<GithubStatus> {
    let Some(token) = store::load_github_token()? else {
        return Ok(GithubStatus {
            connected: false,
            login: None,
        });
    };
    // Validate by hitting /user; if it fails (revoked / expired), clear it.
    match oauth::fetch_login(&token).await {
        Ok(login) => Ok(GithubStatus {
            connected: true,
            login: Some(login),
        }),
        Err(_) => {
            let _ = store::delete_github_token();
            Ok(GithubStatus {
                connected: false,
                login: None,
            })
        }
    }
}

#[tauri::command]
pub fn github_logout() -> AppResult<()> {
    store::delete_github_token()
}
