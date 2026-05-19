import { create } from "zustand";

import { api } from "@/lib/tauri";
import type {
  AheadBehind,
  BranchInfo,
  CommitInfo,
  GithubStatus,
  RepoSummary,
  StashInfo,
  WorkingStatus,
} from "@/lib/types";

export type MainView = "history" | "working";

/// Per-tab state. Each open repository has its own slice.
export interface TabState {
  id: string;
  /// Stable canonical path of the repo (used as the persistence key).
  path: string;
  /// Display label - basename of the path. May change if the user renames the dir.
  label: string;
  repo: RepoSummary | null;
  loading: boolean;
  view: MainView;
  branches: BranchInfo[];
  stashes: StashInfo[];
  commits: CommitInfo[];
  status: WorkingStatus;
  aheadBehind: AheadBehind;
  selectedCommit: string | null;
  /// File path within the currently selected historical commit (Commit
  /// History view). Reset whenever `selectedCommit` changes.
  selectedCommitFile: string | null;
  selectFile: { path: string; staged: boolean } | null;
}

interface RepoStore {
  tabs: TabState[];
  activeTabId: string | null;
  recentlyClosed: string[];
  github: GithubStatus;
  busy: string | null;
  error: string | null;

  /// Lifecycle.
  init: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (orderedIds: string[]) => void;

  /// Active-tab convenience accessors.
  activeTab: () => TabState | null;

  /// Per-tab mutations.
  setView: (tabId: string, view: MainView) => void;
  setSelectedCommit: (tabId: string, sha: string | null) => void;
  setSelectedCommitFile: (tabId: string, file: string | null) => void;
  setSelectFile: (
    tabId: string,
    sel: { path: string; staged: boolean } | null,
  ) => void;

  /// Per-tab data refresh.
  reloadAll: (tabId: string) => Promise<void>;
  reloadStatus: (tabId: string) => Promise<void>;
  reloadGithub: () => Promise<void>;

  /// Error / busy plumbing - shared across tabs (only one operation
  /// runs in the UI at a time for now). Per-tab busy comes in Phase 3.
  withBusy: <T>(label: string, fn: () => Promise<T>) => Promise<T | null>;
  setError: (msg: string | null) => void;
}

const EMPTY_STATUS: WorkingStatus = {
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
};

const EMPTY_AB: AheadBehind = { ahead: 0, behind: 0, upstream: null };

function makeTab(id: string, path: string): TabState {
  const label = path.split("/").filter(Boolean).pop() ?? path;
  return {
    id,
    path,
    label,
    repo: null,
    loading: false,
    view: "history",
    branches: [],
    stashes: [],
    commits: [],
    status: EMPTY_STATUS,
    aheadBehind: EMPTY_AB,
    selectedCommit: null,
    selectedCommitFile: null,
    selectFile: null,
  };
}

function newId(): string {
  // crypto.randomUUID is available in modern browsers + Tauri WebView.
  return globalThis.crypto.randomUUID();
}

function formatErr(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : String(e);
}

/// Persist current tab list + active tab to disk.
async function persistTabs(state: RepoStore) {
  await api
    .saveTabs(state.tabs.map((t) => ({ id: t.id, path: t.path })))
    .catch(() => undefined);
  await api.setActiveTab(state.activeTabId).catch(() => undefined);
}

/// Apply a partial update to a single tab and return a new tabs array.
function patchTab(
  tabs: TabState[],
  tabId: string,
  patch: Partial<TabState>,
): TabState[] {
  return tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t));
}

export const useRepo = create<RepoStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentlyClosed: [],
  github: { connected: false, login: null },
  busy: null,
  error: null,

  activeTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },

  setView: (tabId, view) =>
    set((s) => ({ tabs: patchTab(s.tabs, tabId, { view }) })),

  setSelectedCommit: (tabId, sha) =>
    set((s) => ({
      // Picking a different commit invalidates whatever file was selected
      // inside the previous one.
      tabs: patchTab(s.tabs, tabId, {
        selectedCommit: sha,
        selectedCommitFile: null,
      }),
    })),

  setSelectedCommitFile: (tabId, file) =>
    set((s) => ({
      tabs: patchTab(s.tabs, tabId, { selectedCommitFile: file }),
    })),

  setSelectFile: (tabId, sel) =>
    set((s) => ({ tabs: patchTab(s.tabs, tabId, { selectFile: sel }) })),

  setError: (msg) => set({ error: msg }),

  withBusy: async (label, fn) => {
    set({ busy: label, error: null });
    try {
      const result = await fn();
      set({ busy: null });
      return result;
    } catch (e) {
      set({ busy: null, error: formatErr(e) });
      return null;
    }
  },

  init: async () => {
    const [persisted, gh] = await Promise.all([
      api.loadAppState().catch(() => null),
      api
        .githubStatus()
        .catch(() => ({ connected: false, login: null }) as GithubStatus),
    ]);
    set({ github: gh });

    if (!persisted) return;

    // Legacy migration: if Phase 1 last_repo_path is set but tabs is empty,
    // adopt it as the first tab.
    let toRestore = persisted.tabs ?? [];
    if (toRestore.length === 0 && persisted.last_repo_path) {
      toRestore = [{ id: newId(), path: persisted.last_repo_path }];
    }

    set({ recentlyClosed: persisted.recently_closed ?? [] });

    for (const t of toRestore) {
      // Guard against double-invocation (React StrictMode runs effects twice
      // in dev) and against the same repo path being persisted twice.
      if (get().tabs.some((existing) => existing.id === t.id || existing.path === t.path)) {
        continue;
      }
      try {
        const summary = await api.openRepository(t.id, t.path);
        const tab = makeTab(t.id, summary.path);
        // Re-check after the await - another concurrent init() may have
        // already pushed this tab while we were waiting on the IPC call.
        if (get().tabs.some((existing) => existing.id === t.id || existing.path === summary.path)) {
          continue;
        }
        set((s) => ({ tabs: [...s.tabs, { ...tab, repo: summary }] }));
        await get().reloadAll(t.id);
      } catch {
        // Skip repos that no longer exist on disk - they'll be pruned on next save.
      }
    }

    const wanted = persisted.active_tab_id;
    const fallback = get().tabs[0]?.id ?? null;
    set({
      activeTabId: wanted && get().tabs.some((t) => t.id === wanted) ? wanted : fallback,
    });

    await persistTabs(get());
  },

  openRepo: async (path) => {
    // If this path is already open, just focus that tab.
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      await api.setActiveTab(existing.id).catch(() => undefined);
      return;
    }

    const tabId = newId();
    set((s) => ({
      tabs: [...s.tabs, { ...makeTab(tabId, path), loading: true }],
      activeTabId: tabId,
      error: null,
    }));
    try {
      const summary = await api.openRepository(tabId, path);
      // Use canonical path from the summary.
      set((s) => ({
        tabs: patchTab(s.tabs, tabId, {
          repo: summary,
          path: summary.path,
          label: summary.name,
          loading: false,
        }),
      }));
      await get().reloadAll(tabId);
      await persistTabs(get());
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.filter((t) => t.id !== tabId),
        activeTabId: s.tabs.find((t) => t.id !== tabId)?.id ?? null,
        error: formatErr(e),
      }));
    }
  },

  closeTab: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    await api.closeRepository(tabId).catch(() => undefined);
    if (tab.path) {
      await api.pushRecentlyClosed(tab.path).catch(() => undefined);
    }
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== tabId);
      const nextActive =
        s.activeTabId === tabId
          ? (remaining[0]?.id ?? null)
          : s.activeTabId;
      return {
        tabs: remaining,
        activeTabId: nextActive,
        recentlyClosed: tab.path
          ? [tab.path, ...s.recentlyClosed.filter((p) => p !== tab.path)].slice(0, 10)
          : s.recentlyClosed,
      };
    });
    await persistTabs(get());
  },

  setActiveTab: (tabId) => {
    if (!get().tabs.some((t) => t.id === tabId)) return;
    set({ activeTabId: tabId });
    void api.setActiveTab(tabId).catch(() => undefined);
  },

  reorderTabs: (orderedIds) => {
    const byId = new Map(get().tabs.map((t) => [t.id, t]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((t): t is TabState => Boolean(t));
    set({ tabs: reordered });
    void persistTabs(get());
  },

  reloadAll: async (tabId) => {
    if (!get().tabs.some((t) => t.id === tabId)) return;
    const [branches, stashes, commits, status, ab] = await Promise.all([
      api.listBranches(tabId).catch(() => [] as BranchInfo[]),
      api.listStashes(tabId).catch(() => [] as StashInfo[]),
      api.commitHistory(tabId, 2000).catch(() => [] as CommitInfo[]),
      api.workingStatus(tabId).catch(() => EMPTY_STATUS),
      api.aheadBehind(tabId).catch(() => EMPTY_AB),
    ]);
    set((s) => ({
      tabs: patchTab(s.tabs, tabId, {
        branches,
        stashes,
        commits,
        status,
        aheadBehind: ab,
      }),
    }));
  },

  reloadStatus: async (tabId) => {
    if (!get().tabs.some((t) => t.id === tabId)) return;
    const [status, ab] = await Promise.all([
      api.workingStatus(tabId).catch(() => EMPTY_STATUS),
      api.aheadBehind(tabId).catch(() => EMPTY_AB),
    ]);
    set((s) => ({
      tabs: patchTab(s.tabs, tabId, { status, aheadBehind: ab }),
    }));
  },

  reloadGithub: async () => {
    const gh = await api
      .githubStatus()
      .catch(() => ({ connected: false, login: null }) as GithubStatus);
    set({ github: gh });
  },
}));

export const isDirty = (s: WorkingStatus) =>
  s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length > 0;

/// Selector helper that throws if there's no active tab (for components
/// that only render when one exists).
export function useActiveTab(): TabState | null {
  return useRepo((s) =>
    s.tabs.find((t) => t.id === s.activeTabId) ?? null,
  );
}

/// Selector for one slice of the active tab. Falls back to a default if no
/// tab is active.
export function useActiveTabField<T>(
  field: (t: TabState) => T,
  fallback: T,
): T {
  return useRepo((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ? field(tab) : fallback;
  });
}
