import { useEffect, useState, type CSSProperties } from "react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import { relativeTime } from "@/lib/format";
import { useResizableSplit } from "@/lib/useResizableSplit";
import type { CommitInfo, DiffPayload, FileEntry } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

/**
 * Bottom panel rendered under the commit list whenever a commit is selected.
 * Shows the commit metadata, the list of files changed, and the diff of the
 * currently picked file in that commit.
 */
export function CommitDetails() {
  const active = useActiveTab();
  const setSelectedCommitFile = useRepo((s) => s.setSelectedCommitFile);

  const tabId = active?.id ?? null;
  const sha = active?.selectedCommit ?? null;
  const selectedFile = active?.selectedCommitFile ?? null;
  const commit = active?.commits.find((c) => c.sha === sha) ?? null;

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  useEffect(() => {
    if (!tabId || !sha) {
      setFiles([]);
      setFilesError(null);
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    setFilesError(null);
    api
      .commitFiles(tabId, sha)
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        // Auto-select the first file so users see a diff immediately.
        if (list.length > 0) {
          setSelectedCommitFile(tabId, list[0]!.path);
        } else {
          setSelectedCommitFile(tabId, null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setFilesError(
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, sha, setSelectedCommitFile]);

  return (
    <CommitDetailsBody
      active={active}
      sha={sha}
      commit={commit}
      files={files}
      loadingFiles={loadingFiles}
      filesError={filesError}
      selectedFile={selectedFile}
      onSelectFile={(p) =>
        active && setSelectedCommitFile(active.id, p)
      }
    />
  );
}

interface CommitDetailsBodyProps {
  active: ReturnType<typeof useActiveTab>;
  sha: string | null;
  commit: CommitInfo | null;
  files: FileEntry[];
  loadingFiles: boolean;
  filesError: string | null;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

function CommitDetailsBody({
  active,
  sha,
  commit,
  files,
  loadingFiles,
  filesError,
  selectedFile,
  onSelectFile,
}: CommitDetailsBodyProps) {
  // Hook MUST run unconditionally; we render an empty body when no commit.
  const {
    containerRef,
    sizeStyle: filesSidebarStyle,
    handleProps: splitterProps,
  } = useResizableSplit({
    side: "left",
    defaultFraction: 0.3,
    minSize: 180,
    maxFraction: 0.7,
    storageKey: "sourceflow:commitFilesWidth",
  });

  if (!active || !sha || !commit) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Select a commit to inspect its changes
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CommitHeader commit={commit} />
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <FilesSidebar
          style={filesSidebarStyle}
          files={files}
          loading={loadingFiles}
          error={filesError}
          selected={selectedFile}
          onSelect={onSelectFile}
        />
        <div {...splitterProps} title="Drag to resize file list" />
        <CommitDiffPanel tabId={active.id} sha={sha} file={selectedFile} />
      </div>
    </div>
  );
}

function CommitHeader({ commit }: { commit: CommitInfo }) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">
          {commit.summary || "(no message)"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-zinc-500">
          {commit.short_sha}
        </span>
      </div>
      <div className="mt-1 truncate text-[11px] text-zinc-500">
        <span className="text-zinc-400">{commit.author_name}</span>
        {commit.author_email && (
          <span className="text-zinc-600"> &lt;{commit.author_email}&gt;</span>
        )}{" "}
        &middot; {relativeTime(commit.timestamp)}
      </div>
      {commit.body && (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400 scrollbar-thin">
          {commit.body}
        </pre>
      )}
    </div>
  );
}

function FilesSidebar({
  style,
  files,
  loading,
  error,
  selected,
  onSelect,
}: {
  style: CSSProperties;
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900/30 scrollbar-thin"
      style={style}
    >
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span>Files Changed</span>
        <span className="text-zinc-600">{files.length}</span>
      </div>
      {error && (
        <div className="px-3 py-2 text-[11px] text-red-300">{error}</div>
      )}
      {loading && files.length === 0 && (
        <div className="px-3 py-2 text-[11px] italic text-zinc-500">
          Loading...
        </div>
      )}
      {!loading && !error && files.length === 0 && (
        <div className="px-3 py-2 text-[11px] italic text-zinc-600">
          No file changes (merge or empty commit)
        </div>
      )}
      {files.map((f) => (
        <button
          key={f.path}
          onClick={() => onSelect(f.path)}
          className={cn(
            "flex items-center gap-2 px-3 py-1 text-left text-xs",
            selected === f.path ? "bg-zinc-800/80" : "hover:bg-zinc-800/40",
          )}
          title={f.path}
        >
          <StatusBadge status={f.status} />
          <span className="flex-1 truncate font-mono text-[11px] text-zinc-200">
            {f.path}
          </span>
        </button>
      ))}
    </div>
  );
}

function CommitDiffPanel({
  tabId,
  sha,
  file,
}: {
  tabId: string;
  sha: string;
  file: string | null;
}) {
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setDiff(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api
      .commitFileDiff(tabId, sha, file)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDiff(null);
        setErr(
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, sha, file]);

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Select a file to view its diff
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading diff...
      </div>
    );
  }
  if (err) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-red-300">
        {err}
      </div>
    );
  }
  if (!diff) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        No diff available
      </div>
    );
  }
  if (diff.is_binary) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Binary file - no preview
      </div>
    );
  }

  const lines = diff.patch.split("\n");
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5 font-mono text-xs text-zinc-300">
        {diff.path}
        {diff.old_path && (
          <span className="text-zinc-500"> &larr; {diff.old_path}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-zinc-950 font-mono text-xs leading-5 scrollbar-thin">
        {lines.map((line, i) => {
          const first = line[0] ?? " ";
          const cls =
            first === "+"
              ? "bg-emerald-900/30 text-emerald-200"
              : first === "-"
                ? "bg-red-900/30 text-red-200"
                : line.startsWith("@@")
                  ? "bg-zinc-800/60 text-blue-300"
                  : "text-zinc-400";
          return (
            <div key={i} className={cn("whitespace-pre px-3", cls)}>
              {line || "\u00a0"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FileEntry["status"] }) {
  const { letter, color } = describe(status);
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
        color,
      )}
      title={status}
    >
      {letter}
    </span>
  );
}

function describe(s: FileEntry["status"]) {
  switch (s) {
    case "index_new":
    case "worktree_new":
      return { letter: "A", color: "bg-emerald-700 text-emerald-100" };
    case "index_modified":
    case "worktree_modified":
      return { letter: "M", color: "bg-amber-700 text-amber-100" };
    case "index_deleted":
    case "worktree_deleted":
      return { letter: "D", color: "bg-red-800 text-red-100" };
    case "index_renamed":
    case "worktree_renamed":
      return { letter: "R", color: "bg-purple-800 text-purple-100" };
    case "index_typechange":
    case "worktree_typechange":
      return { letter: "T", color: "bg-indigo-800 text-indigo-100" };
    case "conflicted":
      return { letter: "!", color: "bg-red-700 text-red-100" };
    default:
      return { letter: "·", color: "bg-zinc-700 text-zinc-300" };
  }
}
