use serde::Serialize;
use thiserror::Error;

/// Application-wide error type.
///
/// Implements `serde::Serialize` so it can be returned from Tauri commands
/// and surface a structured error object in the frontend.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("git error: {0}")]
    Git(#[from] git2::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("path is not a git repository: {0}")]
    NotARepo(String),

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("oauth error: {0}")]
    Oauth(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("config error: {0}")]
    Config(String),

    #[error("invalid argument: {0}")]
    InvalidArg(String),

    #[error("{0}")]
    Other(String),
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Other(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Config(err.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Frontend gets a flat { kind, message } object; easy to switch on.
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        let kind = match self {
            AppError::Git(_) => "git",
            AppError::Io(_) => "io",
            AppError::NotARepo(_) => "not_a_repo",
            AppError::Network(_) => "network",
            AppError::Oauth(_) => "oauth",
            AppError::Keyring(_) => "keyring",
            AppError::Config(_) => "config",
            AppError::InvalidArg(_) => "invalid_arg",
            AppError::Other(_) => "other",
        };
        state.serialize_field("kind", kind)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
