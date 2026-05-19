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
    /// Graph lane index this commit's dot lives in (0-based, left-to-right).
    pub lane: u32,
    /// Color index assigned to this commit's lane (0-based, cycles through the
    /// frontend palette).
    pub color: u32,
    /// Lane state in the row gap *immediately below* this commit. `None` slots
    /// are dead lanes (free for reuse). The renderer uses this together with the
    /// previous commit's `lanes_after` to know which vertical lines to draw.
    pub lanes_after: Vec<Option<u32>>,
    /// Diagonal edges starting at this commit's dot and ending in a *different*
    /// lane in the next row. Used for merge commits forking off a new lane for
    /// their non-first parent.
    pub fork_edges: Vec<GraphEdge>,
    /// Diagonal edges ending at this commit's dot from a *different* lane in
    /// the previous row. Used when several lanes were waiting for this commit
    /// (i.e. a side branch merges in here).
    pub merge_in_edges: Vec<GraphEdge>,
}

/// One diagonal edge in the commit graph - the renderer pairs `lane` with this
/// commit's own lane to draw a curve between the two columns.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GraphEdge {
    pub lane: u32,
    pub color: u32,
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
    /// Commits this branch has that its upstream does not (only meaningful
    /// for local branches with an upstream; `0` otherwise).
    pub ahead: usize,
    /// Commits the upstream has that this branch does not. `0` if no upstream
    /// is configured or the branch is fully up-to-date.
    pub behind: usize,
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
