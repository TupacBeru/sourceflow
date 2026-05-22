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
  MergeToolSettings,
  RepoOperationState,
  ResetMode,
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

  // Ops: branch CRUD
  createBranch: (
    tabId: string,
    name: string,
    startPoint: string | null,
    checkout: boolean,
  ) =>
    tauriInvoke<null>("create_branch", {
      tabId,
      name,
      startPoint,
      checkout,
    }),
  renameBranch: (tabId: string, oldName: string, newName: string, force: boolean) =>
    tauriInvoke<null>("rename_branch", {
      tabId,
      old: oldName,
      new: newName,
      force,
    }),
  deleteBranch: (tabId: string, name: string) =>
    tauriInvoke<null>("delete_branch", { tabId, name }),
  setUpstream: (tabId: string, branch: string, upstream: string | null) =>
    tauriInvoke<null>("set_upstream", { tabId, branch, upstream }),

  // Ops: tags
  createTag: (
    tabId: string,
    name: string,
    targetSha: string | null,
    message: string | null,
  ) =>
    tauriInvoke<null>("create_tag", {
      tabId,
      name,
      targetSha,
      message,
    }),

  // Ops: checkout / reset
  checkoutSha: (tabId: string, sha: string) =>
    tauriInvoke<null>("checkout_sha", { tabId, sha }),
  resetTo: (tabId: string, sha: string, mode: ResetMode) =>
    tauriInvoke<null>("reset_to", { tabId, sha, mode }),

  // Ops: merge / rebase / cherry-pick / revert
  mergeBranch: (tabId: string, branch: string) =>
    tauriInvoke<null>("merge_branch", { tabId, branch }),
  abortMerge: (tabId: string) => tauriInvoke<null>("abort_merge", { tabId }),
  rebaseOnto: (tabId: string, onto: string) =>
    tauriInvoke<null>("rebase_onto", { tabId, onto }),
  abortRebase: (tabId: string) => tauriInvoke<null>("abort_rebase", { tabId }),
  cherryPick: (tabId: string, sha: string) =>
    tauriInvoke<null>("cherry_pick", { tabId, sha }),
  revertCommit: (tabId: string, sha: string) =>
    tauriInvoke<null>("revert_commit", { tabId, sha }),

  // Conflict resolution
  repositoryOperationState: (tabId: string) =>
    tauriInvoke<RepoOperationState>("repository_operation_state", { tabId }),
  markConflictResolved: (tabId: string, file: string) =>
    tauriInvoke<null>("mark_conflict_resolved", { tabId, file }),
  resolveWithMergetool: (tabId: string, file: string) =>
    tauriInvoke<null>("resolve_with_mergetool", { tabId, file }),
  openConflictFile: (tabId: string, file: string) =>
    tauriInvoke<null>("open_conflict_file", { tabId, file }),
  continueOperation: (tabId: string) =>
    tauriInvoke<null>("continue_operation", { tabId }),
  abortOperation: (tabId: string) =>
    tauriInvoke<null>("abort_operation", { tabId }),
  getMergeToolSettings: () =>
    tauriInvoke<MergeToolSettings>("get_merge_tool_settings"),
  setMergeToolSettings: (settings: MergeToolSettings) =>
    tauriInvoke<null>("set_merge_tool_settings", { settings }),

  // Ops: push specific branch
  pushBranch: (
    tabId: string,
    branch: string,
    setUpstreamRemote: string | null,
  ) =>
    tauriInvoke<null>("push_branch", {
      tabId,
      branch,
      setUpstreamRemote,
    }),

  // Auth
  startGithubOauth: () =>
    tauriInvoke<{ login: string }>("start_github_oauth"),
  githubStatus: () => tauriInvoke<GithubStatus>("github_status"),
  githubLogout: () => tauriInvoke<null>("github_logout"),
  getGithubClientId: () =>
    tauriInvoke<string | null>("get_github_client_id"),
  setGithubClientId: (id: string | null) =>
    tauriInvoke<null>("set_github_client_id", { id }),

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
