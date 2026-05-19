import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  BranchInfo,
  CommitInfo,
  DiffPayload,
  FileEntry,
  GithubStatus,
  PersistedState,
  PersistedTab,
  RepoSummary,
  StashInfo,
  WorkingStatus,
} from "./types";

// Typed wrappers around `invoke` so the rest of the app never sees
// stringly-typed command names. Every repo/stage/remote operation takes
// a `tabId` to disambiguate which open repository it targets.

export const api = {
  // Repo
  openRepository: (tabId: string, path: string) =>
    tauriInvoke<RepoSummary>("open_repository", { tabId, path }),
  closeRepository: (tabId: string) =>
    tauriInvoke<null>("close_repository", { tabId }),
  repositorySummary: (tabId: string) =>
    tauriInvoke<RepoSummary | null>("repository_summary", { tabId }),
  commitHistory: (tabId: string, limit?: number) =>
    tauriInvoke<CommitInfo[]>("commit_history", { tabId, limit }),
  workingStatus: (tabId: string) =>
    tauriInvoke<WorkingStatus>("working_status", { tabId }),
  commitFiles: (tabId: string, sha: string) =>
    tauriInvoke<FileEntry[]>("commit_files", { tabId, sha }),
  commitFileDiff: (tabId: string, sha: string, file: string) =>
    tauriInvoke<DiffPayload>("commit_file_diff", { tabId, sha, file }),

  // Refs
  listBranches: (tabId: string) =>
    tauriInvoke<BranchInfo[]>("list_branches", { tabId }),
  listStashes: (tabId: string) =>
    tauriInvoke<StashInfo[]>("list_stashes", { tabId }),
  checkoutBranch: (tabId: string, branch: string) =>
    tauriInvoke<null>("checkout_branch", { tabId, branch }),

  // Stage
  stageFile: (tabId: string, path: string) =>
    tauriInvoke<null>("stage_file", { tabId, path }),
  unstageFile: (tabId: string, path: string) =>
    tauriInvoke<null>("unstage_file", { tabId, path }),
  discardFile: (tabId: string, path: string) =>
    tauriInvoke<null>("discard_file", { tabId, path }),
  ignoreFile: (tabId: string, path: string) =>
    tauriInvoke<null>("ignore_file", { tabId, path }),
  fileDiff: (tabId: string, path: string, staged: boolean) =>
    tauriInvoke<DiffPayload>("file_diff", { tabId, path, staged }),
  commitChanges: (tabId: string, message: string, amend: boolean) =>
    tauriInvoke<string>("commit_changes", { tabId, message, amend }),

  // Remote
  fetchAll: (tabId: string) => tauriInvoke<null>("fetch_all", { tabId }),
  pullCurrent: (tabId: string) => tauriInvoke<null>("pull_current", { tabId }),
  pushCurrent: (tabId: string) => tauriInvoke<null>("push_current", { tabId }),
  aheadBehind: (tabId: string) =>
    tauriInvoke<AheadBehind>("ahead_behind", { tabId }),

  // Auth
  startGithubOauth: () =>
    tauriInvoke<{ login: string }>("start_github_oauth"),
  githubStatus: () => tauriInvoke<GithubStatus>("github_status"),
  githubLogout: () => tauriInvoke<null>("github_logout"),

  // Config
  loadAppState: () => tauriInvoke<PersistedState>("load_app_state"),
  saveAppState: (state: PersistedState) =>
    tauriInvoke<null>("save_app_state", { state }),
  saveTabs: (tabs: PersistedTab[]) =>
    tauriInvoke<null>("save_tabs", { tabs }),
  setActiveTab: (tabId: string | null) =>
    tauriInvoke<null>("set_active_tab", { tabId }),
  pushRecentlyClosed: (path: string) =>
    tauriInvoke<null>("push_recently_closed", { path }),
};

export type Api = typeof api;
