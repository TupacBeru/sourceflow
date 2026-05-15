//! Serializable types shared across `git::*` modules and Tauri commands.
//!
//! The shape of these structs IS the API contract with the React frontend -
//! treat changes as breaking.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub head_sha: Option<String>,
    pub is_detached: bool,
    pub is_bare: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub body: String,
    pub author_name: String,
    pub author_email: String,
    /// Unix timestamp seconds, UTC.
    pub timestamp: i64,
    pub parents: Vec<String>,
    /// Refs that point at this commit (branches, tags) - useful for badges.
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum BranchKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub full_ref: String,
    pub kind: BranchKind,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub target_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashInfo {
    pub index: usize,
    pub message: String,
    pub sha: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    /// Modified in worktree, not yet staged.
    WorktreeModified,
    /// New file in worktree, not yet staged.
    WorktreeNew,
    /// Deleted in worktree, not yet staged.
    WorktreeDeleted,
    /// Renamed in worktree.
    WorktreeRenamed,
    /// Type changed in worktree.
    WorktreeTypechange,
    /// Modified and staged.
    IndexModified,
    /// Newly added (staged).
    IndexNew,
    /// Deleted and staged.
    IndexDeleted,
    /// Renamed and staged.
    IndexRenamed,
    /// Type change staged.
    IndexTypechange,
    /// File has merge conflict.
    Conflicted,
    /// Ignored by .gitignore (not currently surfaced).
    Ignored,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub status: FileStatus,
    pub staged: bool,
    /// For renames - the original path.
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkingStatus {
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<FileEntry>,
    pub conflicted: Vec<FileEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AheadBehind {
    pub ahead: usize,
    pub behind: usize,
    pub upstream: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffPayload {
    pub path: String,
    pub old_path: Option<String>,
    pub is_binary: bool,
    /// Unified diff text (the same format `git diff` produces).
    /// Empty when `is_binary` is true.
    pub patch: String,
}
