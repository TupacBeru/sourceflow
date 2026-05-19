import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ChevronDown, FolderOpen, Plus, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { isDirty, useRepo, type TabState } from "@/store/repoStore";

export function TabBar() {
  const tabs = useRepo((s) => s.tabs);
  const activeTabId = useRepo((s) => s.activeTabId);
  const recentlyClosed = useRepo((s) => s.recentlyClosed);
  const openRepo = useRepo((s) => s.openRepo);
  const closeTab = useRepo((s) => s.closeTab);
  const setActiveTab = useRepo((s) => s.setActiveTab);

  const [showRecent, setShowRecent] = useState(false);

  const pickAndOpen = async () => {
    setShowRecent(false);
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Open repository",
    });
    if (typeof selected === "string") {
      await openRepo(selected);
    }
  };

  return (
    <div className="flex h-11 items-stretch border-b border-zinc-800 bg-zinc-900/80">
      <div className="flex flex-1 items-stretch overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => void closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="relative flex items-stretch border-l border-zinc-800">
        <button
          onClick={() => void pickAndOpen()}
          className="flex items-center gap-1.5 px-4 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
          title="Open repository"
        >
          <Plus size={16} />
        </button>
        {recentlyClosed.length > 0 && (
          <button
            onClick={() => setShowRecent((v) => !v)}
            className="flex items-center px-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            title="Recently closed repositories"
          >
            <ChevronDown size={14} />
          </button>
        )}
        {showRecent && (
          <RecentlyClosedMenu
            items={recentlyClosed}
            onPick={async (path) => {
              setShowRecent(false);
              await openRepo(path);
            }}
            onClose={() => setShowRecent(false)}
          />
        )}
      </div>
    </div>
  );
}

function TabItem({
  tab,
  active,
  onClick,
  onClose,
}: {
  tab: TabState;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  const dirty = isDirty(tab.status);
  return (
    <div
      onClick={onClick}
      onMouseDown={(e) => {
        // Middle-click closes the tab (browser convention).
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      className={cn(
        "group relative flex min-w-[160px] max-w-[260px] cursor-pointer items-center gap-2.5 border-r border-zinc-800/60 px-4 text-sm",
        active
          ? "bg-zinc-950 text-zinc-50"
          : "bg-zinc-900/40 text-zinc-200 hover:bg-zinc-900/70 hover:text-zinc-50",
      )}
      title={`${tab.label}${tab.repo?.head_branch ? ` (${tab.repo.head_branch})` : ""}\n${tab.path}`}
    >
      {/* Active tab indicator stripe */}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500" />
      )}

      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          dirty ? "bg-amber-400" : "bg-transparent",
        )}
        title={dirty ? "Uncommitted changes" : undefined}
      />

      {/* Two-line stack: repo name on top, branch underneath. Keeps
          repo identity dominant even when branch names are long. */}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium">{tab.label}</span>
        {tab.repo?.head_branch && (
          <span
            className={cn(
              "truncate font-mono text-[10px]",
              active ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {tab.repo.head_branch}
          </span>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        title="Close tab"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function RecentlyClosedMenu({
  items,
  onPick,
  onClose,
}: {
  items: string[];
  onPick: (path: string) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-10"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute right-0 top-9 z-20 w-80 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-xs shadow-xl">
        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Recently closed
        </div>
        {items.map((path) => (
          <button
            key={path}
            onClick={() => void onPick(path)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800"
            title={path}
          >
            <FolderOpen size={12} className="shrink-0 text-zinc-500" />
            <span className="flex-1 truncate">
              {path.split("/").filter(Boolean).pop() ?? path}
            </span>
            <span className="shrink-0 truncate text-[10px] text-zinc-600">
              {path}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
