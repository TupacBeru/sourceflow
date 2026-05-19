import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ContextMenu/ContextMenu";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { useGitActions, type GitActions } from "@/lib/useGitActions";
import { useResizableSplit } from "@/lib/useResizableSplit";
import type { CommitInfo } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

import { CommitDetails } from "./CommitDetails";
import { GraphCell, ROW_HEIGHT, computeGraphWidth } from "./GraphCell";

export function HistoryView() {
  const active = useActiveTab();
  const setSelected = useRepo((s) => s.setSelectedCommit);
  const actions = useGitActions(active?.id ?? "");

  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: active?.commits.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const graphWidth = useMemo(
    () => computeGraphWidth(active?.commits ?? []),
    [active?.commits],
  );

  const {
    containerRef,
    sizeStyle: detailsStyle,
    handleProps: splitterProps,
  } = useResizableSplit({
    side: "bottom",
    defaultFraction: 0.4,
    minSize: 140,
    maxFraction: 0.8,
    storageKey: "sourceflow:commitDetailsHeight",
  });

  if (!active) return null;

  if (active.commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        No commits yet
      </div>
    );
  }

  const headSha = active.repo?.head_sha ?? null;
  const items = virtualizer.getVirtualItems();
  const hasSelected = !!active.selectedCommit;
  const headBranchName = active.branches.find((b) => b.is_head)?.name ?? null;
  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto scrollbar-thin"
      >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((row) => {
          const c = active.commits[row.index];
          if (!c) return null;
          const prev = active.commits[row.index - 1];
          const isSelected = c.sha === active.selectedCommit;
          const isHead = !!headSha && c.sha === headSha;
          return (
            <ContextMenu
              key={c.sha}
              items={() =>
                commitMenuItems(c, actions, headBranchName, isHead)
              }
            >
              <button
                onClick={() => setSelected(active.id, c.sha)}
                className={cn(
                  "absolute left-0 top-0 flex w-full items-stretch border-b border-zinc-800/60 pr-4 text-left text-xs transition-colors",
                  isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-800/40",
                )}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <GraphCell
                  commit={c}
                  prevLanesAfter={prev?.lanes_after ?? []}
                  width={graphWidth}
                  isHead={isHead}
                  isSelected={isSelected}
                />
                <div className="flex flex-1 items-center gap-3 overflow-hidden pl-1">
                  <span className="font-mono text-[11px] text-zinc-500">
                    {c.short_sha}
                  </span>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      {c.refs.map((r) => (
                        <span
                          key={r}
                          className="rounded border border-zinc-700/60 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200"
                        >
                          {r}
                        </span>
                      ))}
                      <span className="truncate font-medium text-zinc-100">
                        {c.summary || "(no message)"}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">
                      <span className="text-zinc-400">{c.author_name}</span>{" "}
                      &middot; {relativeTime(c.timestamp)}
                    </div>
                  </div>
                </div>
              </button>
            </ContextMenu>
          );
        })}
      </div>
      </div>
      {hasSelected && (
        <>
          <div {...splitterProps} title="Drag to resize" />
          <div
            className="flex flex-col border-t border-zinc-800 bg-zinc-950"
            style={detailsStyle}
          >
            <CommitDetails />
          </div>
        </>
      )}
    </div>
  );
}

/** Right-click menu for a commit row. */
function commitMenuItems(
  c: CommitInfo,
  actions: GitActions,
  headBranchName: string | null,
  isHead: boolean,
): ContextMenuItem[] {
  const short = c.short_sha;
  const items: ContextMenuItem[] = [
    {
      label: `Check out ${short} (detached)`,
      disabled: isHead,
      onClick: () => void actions.checkoutSha(c.sha),
    },
    {
      label: `New branch from ${short}…`,
      onClick: () => void actions.newBranchFrom(c.sha),
    },
    { type: "separator" },
    {
      label: `Cherry-pick ${short} onto ${headBranchName ?? "HEAD"}`,
      disabled: isHead || !headBranchName,
      onClick: () => void actions.cherryPick(c.sha),
    },
    {
      label: `Revert ${short}`,
      disabled: c.parents.length > 1,
      onClick: () => void actions.revertCommit(c.sha),
    },
    { type: "separator" },
    {
      label: `Tag ${short}…`,
      onClick: () => void actions.createTag(c.sha),
    },
    {
      label: `Reset '${headBranchName ?? "HEAD"}' to ${short}…`,
      disabled: !headBranchName,
      danger: true,
      onClick: () => void actions.resetTo(c.sha),
    },
    { type: "separator" },
    {
      label: `Copy full SHA (${c.sha})`,
      onClick: () => void actions.copy(c.sha),
    },
    {
      label: `Copy short SHA (${short})`,
      onClick: () => void actions.copy(short),
    },
    {
      label: "Copy commit message",
      onClick: () =>
        void actions.copy(c.body ? `${c.summary}\n\n${c.body}` : c.summary),
    },
  ];
  return items;
}
