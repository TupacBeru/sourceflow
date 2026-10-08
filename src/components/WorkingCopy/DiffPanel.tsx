import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { DiffPayload } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

function sameDiff(a: DiffPayload | null, b: DiffPayload): boolean {
  return (
    !!a &&
    a.path === b.path &&
    a.old_path === b.old_path &&
    a.is_binary === b.is_binary &&
    a.patch === b.patch
  );
}

export function DiffPanel() {
  const active = useActiveTab();
  const sel = active?.selectFile ?? null;
  const tabId = active?.id ?? null;
  const headSha = active?.repo?.head_sha ?? null;
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const selectionKey = `${tabId ?? ""}:${sel?.path ?? ""}:${String(sel?.staged ?? "")}`;
  const prevKey = useRef<string | null>(null);

  useEffect(() => {
    if (!sel || !tabId) {
      setDiff(null);
      prevKey.current = null;
      return;
    }
    const announce = prevKey.current !== selectionKey;
    prevKey.current = selectionKey;
    let cancelled = false;

    const load = (opts: { announce: boolean; clearOnError: boolean }) => {
      if (opts.announce) setLoading(true);
      api
        .fileDiff(tabId, sel.path, sel.staged)
        .then((d) => {
          if (cancelled) return;
          setDiff((prev) => (sameDiff(prev, d) ? prev : d));
        })
        .catch(() => {
          if (!cancelled && opts.clearOnError) setDiff(null);
        })
        .finally(() => {
          if (!cancelled && opts.announce) setLoading(false);
        });
    };

    load({ announce, clearOnError: true });
    // File contents can change without the path leaving the list (an agent
    // editing a file that is already modified). Refresh quietly.
    const timer = window.setInterval(() => {
      if (document.hidden || useRepo.getState().busy) return;
      load({ announce: false, clearOnError: false });
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tabId, sel?.path, sel?.staged, headSha, selectionKey]);

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
