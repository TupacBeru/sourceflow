import { Check, EyeOff, Minus, Plus, Trash2, Wrench } from "lucide-react";

import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ContextMenu/ContextMenu";
import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { FileEntry } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

export function FileList() {
  const active = useActiveTab();
  const setSelectFile = useRepo((s) => s.setSelectFile);
  const reloadStatus = useRepo((s) => s.reloadStatus);
  const withBusy = useRepo((s) => s.withBusy);

  if (!active) return null;
  const tabId = active.id;
  const status = active.status;
  const selectFile = active.selectFile;
  const op = active.operationState;
  const mergeToolLabel = op.merge_tool_name ?? "external tool";

  const stage = async (path: string) => {
    await withBusy(`Staging ${path}`, () => api.stageFile(tabId, path));
    await reloadStatus(tabId);
  };
  const unstage = async (path: string) => {
    await withBusy(`Unstaging ${path}`, () => api.unstageFile(tabId, path));
    await reloadStatus(tabId);
  };
  const discard = async (path: string) => {
    if (!confirm(`Discard changes to ${path}? This cannot be undone.`)) return;
    await withBusy(`Discarding ${path}`, () => api.discardFile(tabId, path));
    await reloadStatus(tabId);
  };
  const ignore = async (path: string) => {
    await withBusy(`Adding ${path} to .gitignore`, () =>
      api.ignoreFile(tabId, path),
    );
    await reloadStatus(tabId);
  };
  const deleteUntracked = async (path: string) => {
    if (
      !confirm(
        `Delete ${path} from disk? This cannot be undone (file is not in Git).`,
      )
    ) {
      return;
    }
    await withBusy(`Deleting ${path}`, () =>
      api.deleteUntrackedFile(tabId, path),
    );
    await reloadStatus(tabId);
  };
  const stageAll = async (entries: FileEntry[]) => {
    if (entries.length === 0) return;
    await withBusy("Staging files...", async () => {
      for (const e of entries) await api.stageFile(tabId, e.path);
    });
    await reloadStatus(tabId);
  };
  const unstageAll = async (entries: FileEntry[]) => {
    if (entries.length === 0) return;
    await withBusy("Unstaging files...", async () => {
      for (const e of entries) await api.unstageFile(tabId, e.path);
    });
    await reloadStatus(tabId);
  };

  const toStage = [...status.unstaged, ...status.untracked];
  const canStageAll = toStage.length > 0;
  const canUnstageAll = status.staged.length > 0;

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
      </div>
      <Group label="Staged" count={status.staged.length}>
        {status.staged.map((f) => (
          <FileRow
            key={`s-${f.path}`}
            file={f}
            staged
            selected={selectFile?.path === f.path && selectFile.staged}
            onSelect={() => setSelectFile(tabId, { path: f.path, staged: true })}
            onPrimary={() => void unstage(f.path)}
            primaryIcon={<Minus size={12} />}
            primaryTitle="Unstage"
          />
        ))}
        {status.staged.length === 0 && <Empty text="No staged changes" />}
      </Group>

      <Group label="Unstaged" count={status.unstaged.length}>
        {status.unstaged.map((f) => (
          <FileRow
            key={`u-${f.path}`}
            file={f}
            staged={false}
            selected={selectFile?.path === f.path && !selectFile.staged}
            onSelect={() =>
              setSelectFile(tabId, { path: f.path, staged: false })
            }
            onPrimary={() => void stage(f.path)}
            primaryIcon={<Plus size={12} />}
            primaryTitle="Stage"
            secondary={
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void ignore(f.path);
                  }}
                  className="text-zinc-500 hover:text-amber-400"
                  title="Add to .gitignore"
                >
                  <EyeOff size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void discard(f.path);
                  }}
                  className="text-zinc-500 hover:text-red-400"
                  title="Discard changes"
                >
                  <Trash2 size={12} />
                </button>
              </>
            }
          />
        ))}
        {status.unstaged.length === 0 && <Empty text="No unstaged changes" />}
      </Group>

      <Group label="Untracked" count={status.untracked.length}>
        {status.untracked.map((f) => (
          <FileRow
            key={`n-${f.path}`}
            file={f}
            staged={false}
            selected={selectFile?.path === f.path && !selectFile.staged}
            onSelect={() =>
              setSelectFile(tabId, { path: f.path, staged: false })
            }
            onPrimary={() => void stage(f.path)}
            primaryIcon={<Plus size={12} />}
            primaryTitle="Stage"
            secondary={
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void ignore(f.path);
                  }}
                  className="text-zinc-500 hover:text-amber-400"
                  title="Add to .gitignore"
                >
                  <EyeOff size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteUntracked(f.path);
                  }}
                  className="text-zinc-500 hover:text-red-400"
                  title="Delete from disk"
                >
                  <Trash2 size={12} />
                </button>
              </>
            }
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
  onSelect,
  onPrimary,
  primaryIcon,
  primaryTitle,
  secondary,
}: {
  file: FileEntry;
  staged: boolean;
  selected: boolean;
  onSelect: () => void;
  onPrimary: () => void;
  primaryIcon: React.ReactNode;
  primaryTitle: string;
  secondary?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex cursor-pointer items-center gap-2 px-3 py-1 text-xs",
        selected ? "bg-zinc-800/80" : "hover:bg-zinc-800/40",
      )}
    >
      <StatusBadge status={file.status} staged={staged} />
      <span className="flex-1 truncate font-mono text-[11px] text-zinc-200">
        {file.path}
      </span>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
        {secondary}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrimary();
          }}
          className="text-zinc-300 hover:text-zinc-100"
          title={primaryTitle}
        >
          {primaryIcon}
        </button>
      </div>
    </div>
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
