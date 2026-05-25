// Mirrors src-tauri/src/git/types.rs - keep these two in sync.

export interface RepoSummary {
  path: string;
  name: string;
  head_branch: string | null;
  head_sha: string | null;
  is_detached: boolean;
  is_bare: boolean;
}

export interface GraphEdge {
  lane: number;
  color: number;
}

export interface CommitInfo {
  sha: string;
  short_sha: string;
  summary: string;
  body: string;
  author_name: string;
  author_email: string;
  timestamp: number; // unix seconds
  parents: string[];
  refs: string[];
  /// Graph lane (column) the commit's dot lives in.
  lane: number;
  /// Color index for this commit's lane (0..7).
  color: number;
  /// Per-lane color in the row gap directly below this commit; `null` slots are
  /// dead lanes free for reuse.
  lanes_after: (number | null)[];
  /// Diagonal edges from the dot to a different lane in the next row (e.g. a
  /// merge forking off a new branch lane for its second parent).
  fork_edges: GraphEdge[];
  /// Diagonal edges into the dot from a different lane in the previous row
  /// (side branches converging back into this commit).
  merge_in_edges: GraphEdge[];
}

export type BranchKind = "local" | "remote";

export interface BranchInfo {
  name: string;
  full_ref: string;
  kind: BranchKind;
  is_head: boolean;
  upstream: string | null;
  target_sha: string | null;
  /// Commits this branch has that its upstream doesn't (local + upstream only).
  ahead: number;
  /// Commits the upstream has that this branch doesn't.
  behind: number;
}

export interface StashInfo {
  index: number;
  message: string;
  sha: string;
}

export type FileStatus =
  | "worktree_modified"
  | "worktree_new"
  | "worktree_deleted"
  | "worktree_renamed"
  | "worktree_typechange"
  | "index_modified"
  | "index_new"
  | "index_deleted"
  | "index_renamed"
  | "index_typechange"
  | "conflicted"
  | "ignored";

export interface FileEntry {
  path: string;
  status: FileStatus;
  staged: boolean;
  old_path: string | null;
}

export interface WorkingStatus {
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: FileEntry[];
  conflicted: FileEntry[];
}

export interface AheadBehind {
  ahead: number;
  behind: number;
  upstream: string | null;
}

export type ResetMode = "soft" | "mixed" | "hard";

export type OperationKind = "none" | "merge" | "rebase" | "cherrypick" | "revert";

/** How to integrate upstream when pull is not a fast-forward. */
export type PullStrategy = "ff" | "merge" | "rebase";

export interface RepoOperationState {
  kind: OperationKind;
  label: string | null;
  conflicted_count: number;
  can_continue: boolean;
  merge_tool_name: string | null;
}

export interface MergeToolSettings {
  merge_tool: string | null;
}

export interface DiffPayload {
  path: string;
  old_path: string | null;
  is_binary: boolean;
  patch: string;
}

export interface GithubStatus {
  connected: boolean;
  login: string | null;
  has_client_id: boolean;
}

export interface PersistedTab {
  id: string;
  path: string;
}

export interface PersistedState {
  tabs: PersistedTab[];
  active_tab_id: string | null;
  recently_closed: string[];
  last_repo_path: string | null;
}

export interface AppError {
  kind:
    | "git"
    | "io"
    | "not_a_repo"
    | "network"
    | "oauth"
    | "keyring"
    | "config"
    | "invalid_arg"
    | "other";
  message: string;
}
