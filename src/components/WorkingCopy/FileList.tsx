import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Check, EyeOff, Minus, Plus, Trash2, Wrench } from "lucide-react";

import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ContextMenu/ContextMenu";
import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { FileEntry } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

type FileSection = "staged" | "unstaged" | "untracked";

type SelectableFile = FileEntry & { section: FileSection };

function fileKey(f: Pick<SelectableFile, "section" | "path">) {
  return `${f.section}:${f.path}`;
}

export function FileList() {
  const active = useActiveTab();
  const setSelectFile = useRepo((s) => s.setSelectFile);
  const reloadStatus = useRepo((s) => s.reloadStatus);
  const withBusy = useRepo((s) => s.withBusy);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);

  const tabId = active?.id ?? null;
  const status = active?.status;
  const selectFile = active?.selectFile;
  const op = active?.operationState;
  const mergeToolLabel = op?.merge_tool_name ?? "external tool";

  useEffect(() => {
    setSelection(new Set());
    setAnchorKey(null);
  }, [tabId]);

  const stagedFiles = useMemo<SelectableFile[]>(
    () => (status?.staged ?? []).map((f) => ({ ...f, section: "staged" as const })),
    [status?.staged],
  );
  const unstagedFiles = useMemo<SelectableFile[]>(
    () =>
      (status?.unstaged ?? []).map((f) => ({ ...f, section: "unstaged" as const })),
    [status?.unstaged],
  );
  const untrackedFiles = useMemo<SelectableFile[]>(
    () =>
      (status?.untracked ?? []).map((f) => ({ ...f, section: "untracked" as const })),
    [status?.untracked],
  );

  const filesByKey = useMemo(() => {
    const map = new Map<string, SelectableFile>();
    for (const f of [...stagedFiles, ...unstagedFiles, ...untrackedFiles]) {
      map.set(fileKey(f), f);
    }
    return map;
  }, [stagedFiles, unstagedFiles, untrackedFiles]);

  const resolveSelection = useCallback(
    (keys: Iterable<string>) =>
      [...keys]
        .map((k) => filesByKey.get(k))
        .filter((f): f is SelectableFile => Boolean(f)),
    [filesByKey],
  );

  if (!active || !status || !tabId) return null;

  const stagePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    await withBusy(
      paths.length === 1 ? `Staging ${paths[0]}` : `Staging ${paths.length} files…`,
      async () => {
        for (const path of paths) await api.stageFile(tabId, path);
      },
    );
    await reloadStatus(tabId);
  };

  const unstagePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    await withBusy(
      paths.length === 1
        ? `Unstaging ${paths[0]}`
        : `Unstaging ${paths.length} files…`,
      async () => {
        for (const path of paths) await api.unstageFile(tabId, path);
      },
    );
    await reloadStatus(tabId);
  };

  const discardPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    const msg =
      paths.length === 1
        ? `Discard changes to ${paths[0]}? This cannot be undone.`
        : `Discard changes to ${paths.length} files? This cannot be undone.`;
    if (!confirm(msg)) return;
    await withBusy(
      paths.length === 1
        ? `Discarding ${paths[0]}`
        : `Discarding ${paths.length} files…`,
      async () => {
        for (const path of paths) await api.discardFile(tabId, path);
      },
    );
    setSelection(new Set());
    await reloadStatus(tabId);
  };

  const ignorePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    await withBusy(
      paths.length === 1
        ? `Adding ${paths[0]} to .gitignore`
        : `Ignoring ${paths.length} files…`,
      async () => {
        for (const path of paths) await api.ignoreFile(tabId, path);
      },
    );
    await reloadStatus(tabId);
  };

  const deleteUntrackedPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    const msg =
      paths.length === 1
        ? `Delete ${paths[0]} from disk? This cannot be undone (not in Git).`
        : `Delete ${paths.length} untracked files from disk? This cannot be undone.`;
    if (!confirm(msg)) return;
    await withBusy(
      paths.length === 1 ? `Deleting ${paths[0]}` : `Deleting ${paths.length} files…`,
      async () => {
        for (const path of paths) await api.deleteUntrackedFile(tabId, path);
      },
    );
    setSelection(new Set());
    await reloadStatus(tabId);
  };

  const stageAll = async (entries: FileEntry[]) => {
    await stagePaths(entries.map((e) => e.path));
  };

  const unstageAll = async (entries: FileEntry[]) => {
    await unstagePaths(entries.map((e) => e.path));
  };

  const selectRange = (list: SelectableFile[], fromKey: string, toKey: string) => {
    const fromIdx = list.findIndex((f) => fileKey(f) === fromKey);
    const toIdx = list.findIndex((f) => fileKey(f) === toKey);
    if (fromIdx < 0 || toIdx < 0) return new Set([toKey]);
    const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    return new Set(list.slice(lo, hi + 1).map(fileKey));
  };

  const handleRowClick = (
    e: MouseEvent,
    file: SelectableFile,
    sectionList: SelectableFile[],
  ) => {
    const key = fileKey(file);
    setSelectFile(tabId, {
      path: file.path,
      staged: file.section === "staged",
    });

    if (e.shiftKey && anchorKey) {
      setSelection(selectRange(sectionList, anchorKey, key));
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setAnchorKey(key);
      return;
    }

    setSelection(new Set([key]));
    setAnchorKey(key);
  };

  const ensureContextSelection = (file: SelectableFile) => {
    const key = fileKey(file);
    setSelection((prev) => (prev.has(key) ? prev : new Set([key])));
    setAnchorKey(key);
    setSelectFile(tabId, {
      path: file.path,
      staged: file.section === "staged",
    });
  };

  const menuForFiles = (files: SelectableFile[]): ContextMenuItem[] => {
    if (files.length === 0) return [];

    const staged = files.filter((f) => f.section === "staged");
    const unstaged = files.filter((f) => f.section === "unstaged");
    const untracked = files.filter((f) => f.section === "untracked");
    const toStage = [...unstaged, ...untracked];
    const toDiscard = [...staged, ...unstaged];

    const items: ContextMenuItem[] = [];

    if (toStage.length > 0) {
      items.push({
        label: toStage.length === 1 ? "Stage" : `Stage ${toStage.length} files`,
        icon: <Plus size={12} />,
        onClick: () => void stagePaths(toStage.map((f) => f.path)),
      });
    }
    if (staged.length > 0) {
      items.push({
        label:
          staged.length === 1 ? "Unstage" : `Unstage ${staged.length} files`,
        icon: <Minus size={12} />,
        onClick: () => void unstagePaths(staged.map((f) => f.path)),
      });
    }
    if (items.length > 0) items.push({ type: "separator" });

    if (toDiscard.length > 0) {
      items.push({
        label:
          toDiscard.length === 1
            ? "Discard changes"
            : `Discard changes (${toDiscard.length})`,
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: () => void discardPaths(toDiscard.map((f) => f.path)),
      });
    }
    if (untracked.length > 0) {
      items.push({
        label:
          untracked.length === 1
            ? "Delete from disk"
            : `Delete from disk (${untracked.length})`,
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: () => void deleteUntrackedPaths(untracked.map((f) => f.path)),
      });
    }
    if (files.length > 0) {
      items.push({
        label:
          files.length === 1
            ? "Add to .gitignore"
            : `Add to .gitignore (${files.length})`,
        icon: <EyeOff size={12} />,
        onClick: () => void ignorePaths(files.map((f) => f.path)),
      });
    }

    return items;
  };

  const toStage = [...status.unstaged, ...status.untracked];
  const canStageAll = toStage.length > 0;
  const canUnstageAll = status.staged.length > 0;
  const selectionCount = selection.size;

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
        <ActionButton
          onClick={() => void stageAll(toStage)}
          disabled={!canStageAll}
        >
          Stage All
        </ActionButton>
        <ActionButton
          onClick={() => void unstageAll(status.staged)}
          disabled={!canUnstageAll}
        >
          Unstage All
        </ActionButton>
        {selectionCount > 1 && (
          <span className="ml-auto text-[10px] text-zinc-500">
            {selectionCount} selected
          </span>
        )}
      </div>
      <Group label="Staged" count={status.staged.length}>
        {stagedFiles.map((f) => (
          <FileRow
            key={`s-${f.path}`}
            file={f}
            staged
            selected={selection.has(fileKey(f))}
            onClick={(e) => handleRowClick(e, f, stagedFiles)}
            onContextMenu={() => ensureContextSelection(f)}
            menuItems={() => menuForFiles(resolveSelection(selection))}
            onPrimary={() => void unstagePaths([f.path])}
            primaryIcon={<Minus size={12} />}
            primaryTitle="Unstage"
          />
        ))}
        {status.staged.length === 0 && <Empty text="No staged changes" />}
      </Group>

      <Group label="Unstaged" count={status.unstaged.length}>
        {unstagedFiles.map((f) => (
          <FileRow
            key={`u-${f.path}`}
            file={f}
            staged={false}
            selected={selection.has(fileKey(f))}
            onClick={(e) => handleRowClick(e, f, unstagedFiles)}
            onContextMenu={() => ensureContextSelection(f)}
            menuItems={() => menuForFiles(resolveSelection(selection))}
            onPrimary={() => void stagePaths([f.path])}
            primaryIcon={<Plus size={12} />}
            primaryTitle="Stage"
          />
        ))}
        {status.unstaged.length === 0 && <Empty text="No unstaged changes" />}
      </Group>

      <Group label="Untracked" count={status.untracked.length}>
        {untrackedFiles.map((f) => (
          <FileRow
            key={`n-${f.path}`}
            file={f}
            staged={false}
            selected={selection.has(fileKey(f))}
            onClick={(e) => handleRowClick(e, f, untrackedFiles)}
            onContextMenu={() => ensureContextSelection(f)}
            menuItems={() => menuForFiles(resolveSelection(selection))}
            onPrimary={() => void stagePaths([f.path])}
            primaryIcon={<Plus size={12} />}
            primaryTitle="Stage"
          />
        ))}
        {status.untracked.length === 0 && <Empty text="No untracked files" />}
      </Group>

      {status.conflicted.length > 0 && (
        <Group label="Conflicted" count={status.conflicted.length}>
          {status.conflicted.map((f) => (
            <ContextMenu
              key={`c-${f.path}`}
              items={() =>
                conflictMenuItems(tabId, f.path, mergeToolLabel, {
                  resolve: () =>
                    withBusy(`Opening ${mergeToolLabel}...`, () =>
                      api.resolveWithMergetool(tabId, f.path),
                    ).then(() => reloadStatus(tabId)),
                  markResolved: () =>
                    withBusy(`Marking ${f.path} resolved`, () =>
                      api.markConflictResolved(tabId, f.path),
                    ).then(() => reloadStatus(tabId)),
                  openEditor: () =>
                    api.openConflictFile(tabId, f.path).then(() =>
                      reloadStatus(tabId),
                    ),
                  select: () =>
                    setSelectFile(tabId, { path: f.path, staged: false }),
                })
              }
            >
              <button
                type="button"
                onClick={() =>
                  setSelectFile(tabId, { path: f.path, staged: false })
                }
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-xs",
                  selectFile?.path === f.path
                    ? "bg-red-900/50"
                    : "hover:bg-red-900/30",
                )}
                title="Right-click to resolve"
              >
                <StatusBadge status="conflicted" staged={false} />
                <span className="flex-1 truncate font-mono text-[11px] text-red-200">
                  {f.path}
                </span>
              </button>
            </ContextMenu>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({
  label,
  count,
  action,
  children,
}: {
  label: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800/60">
      <div className="flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span>
          {label} <span className="text-zinc-600">({count})</span>
        </span>
        {action}
      </div>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function FileRow({
  file,
  staged,
  selected,
  onClick,
  onContextMenu,
  menuItems,
  onPrimary,
  primaryIcon,
  primaryTitle,
}: {
  file: FileEntry;
  staged: boolean;
  selected: boolean;
  onClick: (e: MouseEvent) => void;
  onContextMenu: () => void;
  menuItems: () => ContextMenuItem[];
  onPrimary: () => void;
  primaryIcon: React.ReactNode;
  primaryTitle: string;
}) {
  return (
    <ContextMenu items={menuItems}>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick(e as unknown as MouseEvent);
        }}
        className={cn(
          "group flex cursor-pointer items-center gap-2 px-3 py-1 text-xs",
          selected ? "bg-sky-900/40 ring-1 ring-inset ring-sky-700/50" : "hover:bg-zinc-800/40",
        )}
        title="Ctrl+click to multi-select · Shift+click for range · Right-click for actions"
      >
        <StatusBadge status={file.status} staged={staged} />
        <span className="flex-1 truncate font-mono text-[11px] text-zinc-200">
          {file.path}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrimary();
          }}
          className="rounded p-0.5 text-zinc-400 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
          title={primaryTitle}
        >
          {primaryIcon}
        </button>
      </div>
    </ContextMenu>
  );
}

function StatusBadge({
  status,
  staged,
}: {
  status: FileEntry["status"];
  staged: boolean;
}) {
  const { letter, color } = describe(status, staged);
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold",
        color,
      )}
      title={status}
    >
      {letter}
    </span>
  );
}

function describe(s: FileEntry["status"], staged: boolean) {
  switch (s) {
    case "worktree_new":
      return { letter: "?", color: "bg-zinc-700 text-zinc-200" };
    case "index_new":
      return { letter: "A", color: "bg-emerald-700 text-emerald-100" };
    case "worktree_modified":
    case "index_modified":
      return {
        letter: "M",
        color: staged
          ? "bg-amber-700 text-amber-100"
          : "bg-amber-900/60 text-amber-200",
      };
    case "worktree_deleted":
    case "index_deleted":
      return { letter: "D", color: "bg-red-800 text-red-100" };
    case "worktree_renamed":
    case "index_renamed":
      return { letter: "R", color: "bg-purple-800 text-purple-100" };
    case "worktree_typechange":
    case "index_typechange":
      return { letter: "T", color: "bg-indigo-800 text-indigo-100" };
    case "conflicted":
      return { letter: "!", color: "bg-red-700 text-red-100" };
    default:
      return { letter: "·", color: "bg-zinc-700 text-zinc-300" };
  }
}

function ActionButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function conflictMenuItems(
  _tabId: string,
  _path: string,
  toolLabel: string,
  actions: {
    resolve: () => void | Promise<void>;
    markResolved: () => void | Promise<void>;
    openEditor: () => void | Promise<void>;
    select: () => void;
  },
): ContextMenuItem[] {
  return [
    {
      label: `Resolve using ${toolLabel}…`,
      icon: <Wrench size={12} />,
      onClick: () => void actions.resolve(),
    },
    {
      label: "Mark resolved",
      icon: <Check size={12} />,
      onClick: () => void actions.markResolved(),
    },
    { type: "separator" },
    {
      label: "Open in editor",
      onClick: () => void actions.openEditor(),
    },
    {
      label: "Show conflicts",
      onClick: () => actions.select(),
    },
  ];
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-3 py-1 text-[11px] italic text-zinc-600">{text}</div>
  );
}
