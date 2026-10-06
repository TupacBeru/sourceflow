import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, X } from "lucide-react";

import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ContextMenu/ContextMenu";
import { NewRepoMenu } from "@/components/Repo/NewRepoMenu";
import { cn } from "@/lib/cn";
import { isDirty, useRepo, type TabState } from "@/store/repoStore";

type DragOverInfo = { id: string; side: "left" | "right" } | null;

export function TabBar() {
  const tabs = useRepo((s) => s.tabs);
  const activeTabId = useRepo((s) => s.activeTabId);
  const recentlyClosed = useRepo((s) => s.recentlyClosed);
  const openRepo = useRepo((s) => s.openRepo);
  const closeTab = useRepo((s) => s.closeTab);
  const setActiveTab = useRepo((s) => s.setActiveTab);
  const reorderTabs = useRepo((s) => s.reorderTabs);

  const [showRecent, setShowRecent] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DragOverInfo>(null);

  /// Compute the reordered id array based on where a tab was dropped, then
  /// apply it via the store. Mirrors the same insertion logic used by browser
  /// tab strips: drop to the LEFT of target → place dragged tab before target;
  /// drop to the RIGHT → place after.
  const performReorder = (draggedId: string, targetId: string, side: "left" | "right") => {
    if (draggedId === targetId) return;
    const ids = tabs.map((t) => t.id);
    const from = ids.indexOf(draggedId);
    if (from < 0) return;
    ids.splice(from, 1);
    let to = ids.indexOf(targetId);
    if (to < 0) return;
    if (side === "right") to += 1;
    ids.splice(to, 0, draggedId);
    reorderTabs(ids);
  };

  return (
    <div className="flex items-stretch border-b border-zinc-800 bg-zinc-900/80">
      <TabScroller>
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            dragging={draggingId === tab.id}
            insertLeft={dragOver?.id === tab.id && dragOver.side === "left"}
            insertRight={dragOver?.id === tab.id && dragOver.side === "right"}
            menuItems={() => buildTabMenu(tab, tabs, closeTab)}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => void closeTab(tab.id)}
            onDragStart={(e) => {
              setDraggingId(tab.id);
              // dataTransfer is required for Firefox to start a drag at all.
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.id);
            }}
            onDragOver={(e) => {
              if (!draggingId || draggingId === tab.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const side: "left" | "right" =
                e.clientX < rect.left + rect.width / 2 ? "left" : "right";
              setDragOver((curr) =>
                curr?.id === tab.id && curr.side === side ? curr : { id: tab.id, side },
              );
            }}
            onDragLeave={() => {
              setDragOver((curr) => (curr?.id === tab.id ? null : curr));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dragged = e.dataTransfer.getData("text/plain") || draggingId;
              const target = dragOver ?? { id: tab.id, side: "right" as const };
              if (dragged) {
                performReorder(dragged, target.id, target.side);
              }
              setDraggingId(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOver(null);
            }}
          />
        ))}
      </TabScroller>
      <div className="relative flex items-stretch border-l border-zinc-800">
        <NewRepoMenu showRecentChevron={recentlyClosed.length > 0}>
          {recentlyClosed.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRecent((v) => !v)}
              className="flex items-center px-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
              title="Recently closed repositories"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </NewRepoMenu>
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

/// Horizontal tab overflow. The native scrollbar is hidden because WebKitGTK
/// draws it thick enough to swallow a short tab row. A 4px thumb sits under
/// the tabs instead, so the labels keep their full height.
function TabScroller({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startScroll: number;
    travel: number;
  } | null>(null);
  const [metrics, setMetrics] = useState({
    scrollLeft: 0,
    clientWidth: 0,
    scrollWidth: 0,
  });

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setMetrics((prev) => {
      const next = {
        scrollLeft: Math.round(el.scrollLeft),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
      if (
        prev.scrollLeft === next.scrollLeft &&
        prev.clientWidth === next.clientWidth &&
        prev.scrollWidth === next.scrollWidth
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // Measure once, after the tab row is in the DOM. A layout effect with no
  // dependency list setStates on every pass. On WebKitGTK those measurements
  // never settle, React aborts with "maximum update depth exceeded", and the
  // window opens blank. Later label and window-size changes come through the
  // ResizeObserver below.
  useLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(content);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const overflow = maxScroll > 1;
  const thumbWidth = overflow
    ? Math.max(28, (metrics.clientWidth / metrics.scrollWidth) * metrics.clientWidth)
    : 0;
  const thumbTravel = Math.max(0, metrics.clientWidth - thumbWidth);
  const thumbX = maxScroll > 0 ? (metrics.scrollLeft / maxScroll) * thumbTravel : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="h-12 overflow-x-auto overflow-y-hidden scrollbar-none"
      >
        {/* Not a flex item of the scroller: a flex child shrinks to the
            viewport, so scrollWidth stays equal to clientWidth until resize. */}
        <div ref={contentRef} className="flex h-full w-max min-w-full items-stretch">
          {children}
        </div>
      </div>
      <div className="relative h-1 shrink-0">
        {overflow && (
          <div
            className="group absolute -top-1 bottom-0 cursor-ew-resize"
            style={{ width: thumbWidth, transform: `translateX(${thumbX}px)` }}
            onPointerDown={(e) => {
              const el = scrollerRef.current;
              if (!el) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const width = Math.max(28, (el.clientWidth / el.scrollWidth) * el.clientWidth);
              dragRef.current = {
                startX: e.clientX,
                startScroll: el.scrollLeft,
                travel: Math.max(1, el.clientWidth - width),
              };
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              const el = scrollerRef.current;
              if (!drag || !el || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const max = el.scrollWidth - el.clientWidth;
              const dx = e.clientX - drag.startX;
              el.scrollLeft = drag.startScroll + (dx / drag.travel) * max;
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          >
            <div className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-zinc-500 group-hover:bg-zinc-300" />
          </div>
        )}
      </div>
    </div>
  );
}

interface TabItemProps {
  tab: TabState;
  active: boolean;
  dragging: boolean;
  insertLeft: boolean;
  insertRight: boolean;
  menuItems: () => ContextMenuItem[];
  onClick: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
}

function TabItem({
  tab,
  active,
  dragging,
  insertLeft,
  insertRight,
  menuItems,
  onClick,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TabItemProps) {
  const dirty = isDirty(tab.status);
  return (
    <ContextMenu items={menuItems}>
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseDown={(e) => {
        // Middle-click closes the tab (browser convention).
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      className={cn(
        "group relative flex min-w-[160px] max-w-[260px] cursor-pointer items-center gap-2.5 border-r border-zinc-800/60 px-4 text-sm transition-opacity",
        active
          ? "bg-zinc-950 text-zinc-50"
          : "bg-zinc-900/40 text-zinc-200 hover:bg-zinc-900/70 hover:text-zinc-50",
        dragging && "opacity-40",
      )}
      title={`${tab.label}${tab.repo?.head_branch ? ` (${tab.repo.head_branch})` : ""}\n${tab.path}`}
    >
      {/* Insertion indicators - drawn as 2px vertical lines on the edge
          where the dragged tab will land. */}
      {insertLeft && (
        <span className="pointer-events-none absolute inset-y-1 -left-px w-0.5 bg-blue-500" />
      )}
      {insertRight && (
        <span className="pointer-events-none absolute inset-y-1 -right-px w-0.5 bg-blue-500" />
      )}

      {/* Active tab indicator stripe */}
      {active && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-blue-500" />
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
    </ContextMenu>
  );
}

function buildTabMenu(
  tab: TabState,
  tabs: TabState[],
  closeTab: (id: string) => Promise<void>,
): ContextMenuItem[] {
  const others = tabs.filter((t) => t.id !== tab.id);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };
  return [
    {
      label: "Close tab",
      shortcut: "Mid-click",
      onClick: () => void closeTab(tab.id),
    },
    {
      label: `Close other tabs (${others.length})`,
      disabled: others.length === 0,
      onClick: () => {
        for (const t of others) void closeTab(t.id);
      },
    },
    { type: "separator" },
    {
      label: "Copy repo path",
      onClick: () => void copy(tab.path),
    },
  ];
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
      <div className="absolute right-0 top-full z-20 w-80 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-xs shadow-xl">
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
