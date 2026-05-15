//! Persistent app config stored at `~/.config/sourceflow/state.json`.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PersistedState {
    /// Last opened repository path (Phase 1 single-repo).
    /// Phase 2 will replace this with a `tabs: Vec<TabState>` field.
    pub last_repo_path: Option<String>,
}

fn config_dir() -> AppResult<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Config("could not determine config dir".into()))?;
    Ok(base.join("sourceflow"))
}

fn state_path() -> AppResult<PathBuf> {
    Ok(config_dir()?.join("state.json"))
}

pub fn load() -> AppResult<PersistedState> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(PersistedState::default());
    }
    let data = fs::read_to_string(&path)?;
    let parsed = serde_json::from_str(&data)?;
    Ok(parsed)
}

pub fn save(state: &PersistedState) -> AppResult<()> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir)?;
    let path = state_path()?;
    let json = serde_json::to_string_pretty(state)?;
    fs::write(&path, json)?;
    Ok(())
}
