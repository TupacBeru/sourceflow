import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  BranchInfo,
  CommitInfo,
  DiffPayload,
  GithubStatus,
  RepoSummary,
  StashInfo,
  WorkingStatus,
} from "./types";

// Typed wrappers around `invoke` so the rest of the app never sees
// stringly-typed command names.

export const api = {
  // Repo
  openRepository: (path: string) =>
    tauriInvoke<RepoSummary>("open_repository", { path }),
  closeRepository: () => tauriInvoke<null>("close_repository"),
  currentRepository: () =>
    tauriInvoke<RepoSummary | null>("current_repository"),
  commitHistory: (limit?: number) =>
    tauriInvoke<CommitInfo[]>("commit_history", { limit }),
  workingStatus: () => tauriInvoke<WorkingStatus>("working_status"),

  // Refs
  listBranches: () => tauriInvoke<BranchInfo[]>("list_branches"),
  listStashes: () => tauriInvoke<StashInfo[]>("list_stashes"),
  checkoutBranch: (branch: string) =>
    tauriInvoke<null>("checkout_branch", { branch }),

  // Stage
  stageFile: (path: string) => tauriInvoke<null>("stage_file", { path }),
  unstageFile: (path: string) => tauriInvoke<null>("unstage_file", { path }),
  discardFile: (path: string) => tauriInvoke<null>("discard_file", { path }),
  fileDiff: (path: string, staged: boolean) =>
    tauriInvoke<DiffPayload>("file_diff", { path, staged }),
  commitChanges: (message: string, amend: boolean) =>
    tauriInvoke<string>("commit_changes", { message, amend }),

  // Remote
  fetchAll: () => tauriInvoke<null>("fetch_all"),
  pullCurrent: () => tauriInvoke<null>("pull_current"),
  pushCurrent: () => tauriInvoke<null>("push_current"),
  aheadBehind: () => tauriInvoke<AheadBehind>("ahead_behind"),

  // Auth
  startGithubOauth: () =>
    tauriInvoke<{ login: string }>("start_github_oauth"),
  githubStatus: () => tauriInvoke<GithubStatus>("github_status"),
  githubLogout: () => tauriInvoke<null>("github_logout"),

  // Config
  loadAppState: () =>
    tauriInvoke<{ last_repo_path: string | null }>("load_app_state"),
  saveLastRepo: (path: string | null) =>
    tauriInvoke<null>("save_last_repo", { path }),
};

export type Api = typeof api;
