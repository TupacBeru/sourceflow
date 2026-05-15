import { EyeOff, Minus, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { FileEntry } from "@/lib/types";
import { useRepo } from "@/store/repoStore";

export function FileList() {
  const status = useRepo((s) => s.status);
  const selectFile = useRepo((s) => s.selectFile);
  const setSelectFile = useRepo((s) => s.setSelectFile);
  const reloadStatus = useRepo((s) => s.reloadStatus);
  const withBusy = useRepo((s) => s.withBusy);

  const stage = async (path: string) => {
    await withBusy(`Staging ${path}`, () => api.stageFile(path));
    await reloadStatus();
  };
  const unstage = async (path: string) => {
    await withBusy(`Unstaging ${path}`, () => api.unstageFile(path));
    await reloadStatus();
  };
  const discard = async (path: string) => {
    if (!confirm(`Discard changes to ${path}? This cannot be undone.`)) return;
    await withBusy(`Discarding ${path}`, () => api.discardFile(path));
    await reloadStatus();
  };
  const ignore = async (path: string) => {
    await withBusy(`Adding ${path} to .gitignore`, () => api.ignoreFile(path));
    await reloadStatus();
  };
  const stageAll = async (entries: FileEntry[]) => {
    await withBusy("Staging files...", async () => {
      for (const e of entries) await api.stageFile(e.path);
    });
    await reloadStatus();
  };
  const unstageAll = async (entries: FileEntry[]) => {
    await withBusy("Unstaging files...", async () => {
      for (const e of entries) await api.unstageFile(e.path);
    });
    await reloadStatus();
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <Group
        label="Staged"
        count={status.staged.length}
        action={
          status.staged.length > 0 ? (
            <ActionButton onClick={() => void unstageAll(status.staged)}>
              Unstage All
            </ActionButton>
          ) : null
        }
      >
        {status.staged.map((f) => (
          <FileRow
            key={`s-${f.path}`}
            file={f}
            staged
            selected={selectFile?.path === f.path && selectFile.staged}
            onSelect={() => setSelectFile({ path: f.path, staged: true })}
            onPrimary={() => void unstage(f.path)}
            primaryIcon={<Minus size={12} />}
            primaryTitle="Unstage"
          />
        ))}
        {status.staged.length === 0 && <Empty text="No staged changes" />}
      </Group>

      <Group
        label="Unstaged"
        count={status.unstaged.length}
        action={
          status.unstaged.length > 0 ? (
            <ActionButton onClick={() => void stageAll(status.unstaged)}>
              Stage All
            </ActionButton>
          ) : null
        }
      >
        {status.unstaged.map((f) => (
          <FileRow
            key={`u-${f.path}`}
            file={f}
            staged={false}
            selected={selectFile?.path === f.path && !selectFile.staged}
            onSelect={() => setSelectFile({ path: f.path, staged: false })}
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

      <Group
        label="Untracked"
        count={status.untracked.length}
        action={
          status.untracked.length > 0 ? (
            <ActionButton onClick={() => void stageAll(status.untracked)}>
              Stage All
            </ActionButton>
          ) : null
        }
      >
        {status.untracked.map((f) => (
          <FileRow
            key={`n-${f.path}`}
            file={f}
            staged={false}
            selected={selectFile?.path === f.path && !selectFile.staged}
            onSelect={() => setSelectFile({ path: f.path, staged: false })}
            onPrimary={() => void stage(f.path)}
            primaryIcon={<Plus size={12} />}
            primaryTitle="Stage"
            secondary={
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
            }
          />
        ))}
        {status.untracked.length === 0 && <Empty text="No untracked files" />}
      </Group>

      {status.conflicted.length > 0 && (
        <Group label="Conflicted" count={status.conflicted.length}>
          {status.conflicted.map((f) => (
            <div
              key={`c-${f.path}`}
              className="px-3 py-1 text-xs text-red-300"
            >
              {f.path}
            </div>
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
        color: staged ? "bg-amber-700 text-amber-100" : "bg-amber-900/60 text-amber-200",
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
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-1 text-[11px] italic text-zinc-600">{text}</div>;
}
