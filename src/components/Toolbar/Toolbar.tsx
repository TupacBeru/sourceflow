import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Check, RefreshCw } from "lucide-react";

import { prompt } from "@/components/Dialog/DialogHost";
import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import { useActiveTab, useRepo } from "@/store/repoStore";
import { PullSplitButton } from "./PullSplitButton";

/** Compact "5m ago" / "just now" formatter; ticks once a minute. */
function useRelativeMinutes(timestamp: number | null): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!timestamp) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return "just now";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function Toolbar() {
  const active = useActiveTab();
  const busy = useRepo((s) => s.busy);
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);
  const tabId = active?.id ?? "";
  // Hooks must run unconditionally - pass `null` when no active tab.
  const lastFetched = useRelativeMinutes(active?.lastFetchedAt ?? null);
  if (!active) return null;

  const { ahead, behind, upstream } = active.aheadBehind;
  const disabled = busy !== null;
  const upToDate = upstream && ahead === 0 && behind === 0;
  const headBranch = active.repo?.head_branch ?? null;
  const detached = Boolean(active.repo?.is_detached);
  const canPush = !disabled && !detached && Boolean(headBranch);
  const unpublished = !upstream && !detached && Boolean(headBranch);

  const onPush = async () => {
    await withBusy(
      unpublished && headBranch
        ? `Publishing ${headBranch}...`
        : "Pushing...",
      () => api.pushCurrent(tabId),
    );
    await reloadAll(tabId);
  };
  const onFetch = async () => {
    await withBusy("Fetching...", () => api.fetchAll(tabId));
    await reloadAll(tabId);
  };

  const onStash = async () => {
    const res = await prompt({
      title: "Stash changes",
      body: (
        <span className="text-zinc-400">
          Saves tracked and untracked changes to the stash stack (like{" "}
          <code>git stash push -u</code>). Leave the message empty for a default
          name.
        </span>
      ),
      fields: [
        {
          id: "message",
          label: "Stash message",
          placeholder: "WIP on …",
          type: "textarea",
        },
      ],
      confirmLabel: "Stash",
    });
    if (!res) return;
    const message = (res.message ?? "").trim();
    await withBusy("Stashing...", () =>
      api.stashPush(tabId, message || null),
    );
    await reloadAll(tabId);
  };

  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/30 px-3 py-2">
      <PullSplitButton
        tabId={tabId}
        upstream={upstream}
        behind={behind}
        disabled={disabled}
      />
      <ToolbarButton
        icon={<ArrowUp size={16} />}
        label="Push"
        badge={ahead > 0 ? ahead : undefined}
        badgeColor="emerald"
        highlight={ahead > 0 || unpublished}
        onClick={() => void onPush()}
        disabled={!canPush}
        title={
          detached || !headBranch
            ? "Cannot push a detached HEAD"
            : upstream
              ? `Push to ${upstream}`
              : `Publish ${headBranch} to origin (sets upstream)`
        }
      />
      <ToolbarButton
        icon={<RefreshCw size={16} />}
        label="Fetch"
        onClick={() => void onFetch()}
        disabled={disabled}
        title="Fetch all remotes"
      />
      <ToolbarButton
        icon={<Archive size={16} />}
        label="Stash"
        onClick={() => void onStash()}
        disabled={disabled}
        title="Stash tracked and untracked changes"
      />
      <div className="ml-auto flex items-center gap-2 text-xs">
        {busy ? (
          <span className="text-zinc-400">{busy}</span>
        ) : upstream ? (
          <>
            <TrackingStatus ahead={ahead} behind={behind} upToDate={!!upToDate} />
            <span className="text-zinc-500">{upstream}</span>
          </>
        ) : (
          <span
            className="text-zinc-500"
            title="This branch has no remote tracking branch. Push publishes it to origin."
          >
            Not published
          </span>
        )}
        {!busy && (
          <span
            className="flex items-center gap-1 border-l border-zinc-800 pl-2 text-[11px] text-zinc-500"
            title={
              active.backgroundFetching
                ? "Checking remote..."
                : lastFetched
                  ? `Last fetched ${lastFetched}`
                  : "Will check remote shortly"
            }
          >
            <RefreshCw
              size={11}
              className={cn(
                "text-zinc-500",
                active.backgroundFetching && "animate-spin text-zinc-300",
              )}
            />
            {active.backgroundFetching
              ? "checking..."
              : lastFetched ?? "soon"}
          </span>
        )}
      </div>
    </div>
  );
}

function TrackingStatus({
  ahead,
  behind,
  upToDate,
}: {
  ahead: number;
  behind: number;
  upToDate: boolean;
}) {
  if (upToDate) {
    return (
      <span
        className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-emerald-300"
        title="Up to date with upstream"
      >
        <Check size={11} />
        Up to date
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      {behind > 0 && (
        <span
          title={`${behind} commit${behind === 1 ? "" : "s"} to pull`}
          className="flex items-center gap-0.5 rounded bg-amber-700/40 px-1.5 py-0.5 text-[11px] font-medium text-amber-200"
        >
          <ArrowDown size={11} />
          {behind}
        </span>
      )}
      {ahead > 0 && (
        <span
          title={`${ahead} commit${ahead === 1 ? "" : "s"} to push`}
          className="flex items-center gap-0.5 rounded bg-emerald-700/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-200"
        >
          <ArrowUp size={11} />
          {ahead}
        </span>
      )}
    </span>
  );
}

type BadgeColor = "blue" | "amber" | "emerald";

function ToolbarButton({
  icon,
  label,
  badge,
  badgeColor = "blue",
  highlight,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeColor?: BadgeColor;
  /** Adds a subtle colored ring so an actionable button stands out. */
  highlight?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const badgeCls =
    badgeColor === "amber"
      ? "bg-amber-600"
      : badgeColor === "emerald"
        ? "bg-emerald-600"
        : "bg-blue-600";
  const ringCls = highlight
    ? badgeColor === "amber"
      ? "ring-1 ring-amber-500/60"
      : badgeColor === "emerald"
        ? "ring-1 ring-emerald-500/60"
        : "ring-1 ring-blue-500/60"
    : "";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-100 shadow-sm hover:bg-zinc-800 disabled:opacity-50",
        ringCls,
      )}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] leading-none text-white",
            badgeCls,
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
