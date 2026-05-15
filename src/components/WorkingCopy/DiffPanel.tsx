import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { DiffPayload } from "@/lib/types";
import { useRepo } from "@/store/repoStore";

export function DiffPanel() {
  const sel = useRepo((s) => s.selectFile);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sel) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .fileDiff(sel.path, sel.staged)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch(() => {
        if (!cancelled) setDiff(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sel?.path, sel?.staged]);

  if (!sel) {
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
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs font-mono text-zinc-300">
        {sel.staged ? "staged" : "unstaged"} &middot; {diff.path}
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
