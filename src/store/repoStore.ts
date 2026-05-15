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

interface RepoState {
  repo: RepoSummary | null;
  loadingRepo: boolean;

  view: MainView;
  setView: (v: MainView) => void;

  branches: BranchInfo[];
  stashes: StashInfo[];
  commits: CommitInfo[];
  status: WorkingStatus;
  aheadBehind: AheadBehind;

  selectedCommit: string | null;
  selectFile: { path: string; staged: boolean } | null;

  github: GithubStatus;

  busy: string | null;
  error: string | null;

  init: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  closeRepo: () => Promise<void>;
  reloadAll: () => Promise<void>;
  reloadStatus: () => Promise<void>;
  reloadGithub: () => Promise<void>;

  setSelectedCommit: (sha: string | null) => void;
  setSelectFile: (sel: { path: string; staged: boolean } | null) => void;

  withBusy: <T>(label: string, fn: () => Promise<T>) => Promise<T | null>;
}

const EMPTY_STATUS: WorkingStatus = {
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
};

export const useRepo = create<RepoState>((set, get) => ({
  repo: null,
  loadingRepo: false,
  view: "history",
  setView: (view) => set({ view }),
  branches: [],
  stashes: [],
  commits: [],
  status: EMPTY_STATUS,
  aheadBehind: { ahead: 0, behind: 0, upstream: null },
  selectedCommit: null,
  selectFile: null,
  github: { connected: false, login: null },
  busy: null,
  error: null,

  setSelectedCommit: (sha) => set({ selectedCommit: sha }),
  setSelectFile: (sel) => set({ selectFile: sel }),

  withBusy: async (label, fn) => {
    set({ busy: label, error: null });
    try {
      const result = await fn();
      set({ busy: null });
      return result;
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
      set({ busy: null, error: msg });
      return null;
    }
  },

  init: async () => {
    const [persisted, gh] = await Promise.all([
      api.loadAppState().catch(() => ({ last_repo_path: null })),
      api.githubStatus().catch(() => ({ connected: false, login: null })),
    ]);
    set({ github: gh });

    if (persisted.last_repo_path) {
      try {
        await get().openRepo(persisted.last_repo_path);
      } catch {
        await api.saveLastRepo(null).catch(() => undefined);
      }
    }
  },

  openRepo: async (path) => {
    set({ loadingRepo: true, error: null });
    try {
      const repo = await api.openRepository(path);
      set({ repo, loadingRepo: false });
      await api.saveLastRepo(repo.path).catch(() => undefined);
      await get().reloadAll();
    } catch (e) {
      set({
        loadingRepo: false,
        error: e && typeof e === "object" && "message" in e ? String(e.message) : String(e),
      });
    }
  },

  closeRepo: async () => {
    await api.closeRepository().catch(() => undefined);
    await api.saveLastRepo(null).catch(() => undefined);
    set({
      repo: null,
      branches: [],
      stashes: [],
      commits: [],
      status: EMPTY_STATUS,
      aheadBehind: { ahead: 0, behind: 0, upstream: null },
      selectedCommit: null,
      selectFile: null,
    });
  },

  reloadAll: async () => {
    if (!get().repo) return;
    const [branches, stashes, commits, status, ab] = await Promise.all([
      api.listBranches().catch(() => []),
      api.listStashes().catch(() => []),
      api.commitHistory(2000).catch(() => []),
      api.workingStatus().catch(() => EMPTY_STATUS),
      api.aheadBehind().catch(() => ({ ahead: 0, behind: 0, upstream: null })),
    ]);
    set({ branches, stashes, commits, status, aheadBehind: ab });
  },

  reloadStatus: async () => {
    if (!get().repo) return;
    const [status, ab] = await Promise.all([
      api.workingStatus().catch(() => EMPTY_STATUS),
      api.aheadBehind().catch(() => ({ ahead: 0, behind: 0, upstream: null })),
    ]);
    set({ status, aheadBehind: ab });
  },

  reloadGithub: async () => {
    const gh = await api.githubStatus().catch(() => ({
      connected: false,
      login: null,
    }));
    set({ github: gh });
  },
}));

export const isDirty = (s: WorkingStatus) =>
  s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length > 0;
