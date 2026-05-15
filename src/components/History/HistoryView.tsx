import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { useRepo } from "@/store/repoStore";

const ROW_HEIGHT = 56;

export function HistoryView() {
  const commits = useRepo((s) => s.commits);
  const selected = useRepo((s) => s.selectedCommit);
  const setSelected = useRepo((s) => s.setSelectedCommit);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        No commits yet
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  return (
    <div ref={parentRef} className="flex-1 overflow-auto scrollbar-thin">
      <div
        style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
      >
        {items.map((row) => {
          const c = commits[row.index];
          if (!c) return null;
          const isSelected = c.sha === selected;
          return (
            <button
              key={c.sha}
              onClick={() => setSelected(c.sha)}
              className={cn(
                "absolute left-0 top-0 flex w-full items-center gap-3 border-b border-zinc-800/60 px-4 text-left text-xs transition-colors",
                isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-800/40",
              )}
              style={{
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
            >
              <span className="font-mono text-[11px] text-zinc-500">{c.short_sha}</span>
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
