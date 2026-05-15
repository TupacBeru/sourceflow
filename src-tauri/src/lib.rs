//! SourceFlow library entrypoint.
//!
//! Wires Tauri commands together and owns the application state
//! (an `AppState` shared across commands via `tauri::State`).

mod auth;
mod commands;
mod config;
mod error;
mod git;
mod state;

use state::AppState;
use tracing_subscriber::{fmt, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("sourceflow=info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repository,
            commands::repo::close_repository,
            commands::repo::current_repository,
            commands::repo::commit_history,
            commands::repo::working_status,
            commands::refs::list_branches,
            commands::refs::list_stashes,
            commands::refs::checkout_branch,
            commands::stage::stage_file,
            commands::stage::unstage_file,
            commands::stage::discard_file,
            commands::stage::file_diff,
            commands::stage::commit_changes,
            commands::remote::fetch_all,
            commands::remote::pull_current,
            commands::remote::push_current,
            commands::remote::ahead_behind,
            commands::auth::start_github_oauth,
            commands::auth::github_status,
            commands::auth::github_logout,
            commands::config_cmd::load_app_state,
            commands::config_cmd::save_last_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
