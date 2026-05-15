// Mirrors src-tauri/src/git/types.rs - keep these two in sync.

export interface RepoSummary {
  path: string;
  name: string;
  head_branch: string | null;
  head_sha: string | null;
  is_detached: boolean;
  is_bare: boolean;
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
}

export type BranchKind = "local" | "remote";

export interface BranchInfo {
  name: string;
  full_ref: string;
  kind: BranchKind;
  is_head: boolean;
  upstream: string | null;
  target_sha: string | null;
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

export interface DiffPayload {
  path: string;
  old_path: string | null;
  is_binary: boolean;
  patch: string;
}

export interface GithubStatus {
  connected: boolean;
  login: string | null;
}

export interface AppError {
  kind:
    | "git"
    | "io"
    | "no_repo_open"
    | "not_a_repo"
    | "network"
    | "oauth"
    | "keyring"
    | "config"
    | "invalid_arg"
    | "other";
  message: string;
}
