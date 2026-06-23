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
import type { BranchInfo, CommitInfo } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

import { CommitDetails } from "./CommitDetails";
import { GraphCell, ROW_HEIGHT, computeGraphWidth } from "./GraphCell";

export function HistoryView() {
  const active = useActiveTab();
  const setSelected = useRepo((s) => s.setSelectedCommit);
  const setHistoryScope = useRepo((s) => s.setHistoryScope);
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

  const headSha = active.repo?.head_sha ?? null;
  const items = virtualizer.getVirtualItems();
  const hasSelected = !!active.selectedCommit;
  const headBranchName = active.branches.find((b) => b.is_head)?.name ?? null;
  const branches = active.branches;
  const scope = active.historyScope;
  const tabId = active.id;
  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          History
        </span>
        <div className="ml-auto flex items-center overflow-hidden rounded border border-zinc-700/70">
          <ScopeButton
            active={scope === "all"}
            onClick={() => void setHistoryScope(tabId, "all")}
          >
            All branches
          </ScopeButton>
          <ScopeButton
            active={scope === "current"}
            onClick={() => void setHistoryScope(tabId, "current")}
          >
            Current branch
          </ScopeButton>
        </div>
      </div>
      {active.commits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          No commits yet
        </div>
      ) : (
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
                commitMenuItems(c, actions, branches, headBranchName, isHead)
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
      )}
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

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 text-[10px] font-medium transition-colors",
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

/** Right-click menu for a commit row. */
function commitMenuItems(
  c: CommitInfo,
  actions: GitActions,
  branches: BranchInfo[],
  headBranchName: string | null,
  isHead: boolean,
): ContextMenuItem[] {
  const short = c.short_sha;

  // Local branches that point at this commit (other than the one we're on) -
  // these enable SourceTree-style "merge a branch straight from the graph".
  const localBranchesHere = branches.filter(
    (b) => b.kind === "local" && !b.is_head && c.refs.includes(b.name),
  );

  const branchItems: ContextMenuItem[] = [];
  for (const b of localBranchesHere) {
    branchItems.push({
      label: `Check out '${b.name}'`,
      onClick: () => void actions.checkoutBranch(b),
    });
    if (headBranchName) {
      branchItems.push({
        label: `Merge '${b.name}' into ${headBranchName}`,
        onClick: () => void actions.mergeBranch(b.name, headBranchName),
      });
      branchItems.push({
        label: `Rebase ${headBranchName} onto '${b.name}'`,
        onClick: () => void actions.rebaseOnto(b.name, headBranchName),
      });
    }
  }
  if (branchItems.length > 0) branchItems.push({ type: "separator" });

  const items: ContextMenuItem[] = [
    ...branchItems,
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
