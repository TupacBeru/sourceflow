import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import { usePull } from "@/lib/usePull";

type PullSplitButtonProps = {
  tabId: string;
  upstream: string | null;
  behind: number;
  disabled: boolean;
};

export function PullSplitButton({
  tabId,
  upstream,
  behind,
  disabled,
}: PullSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { pull, pullFfOnly, pullRebase, pullMerge } = usePull(tabId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn: () => Promise<void>) => {
    setOpen(false);
    void fn();
  };

  const highlight = behind > 0;
  const ringCls = highlight ? "ring-1 ring-amber-500/60" : "";
  const title = upstream
    ? `Pull from ${upstream}`
    : "No upstream configured";

  return (
    <div ref={rootRef} className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => void pull()}
        disabled={disabled || !upstream}
        title={title}
        className={cn(
          "flex items-center gap-2 rounded-l-md border border-r-0 border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-100 shadow-sm hover:bg-zinc-800 disabled:opacity-50",
          ringCls,
        )}
      >
        <ArrowDown size={16} />
        <span>Pull</span>
        {behind > 0 && (
          <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
            {behind}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !upstream}
        title="Pull options"
        aria-expanded={open}
        className={cn(
          "flex items-center rounded-r-md border border-zinc-700/60 bg-zinc-800/60 px-1.5 py-2 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50",
          ringCls,
        )}
      >
        <ChevronDown size={14} className={cn(open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[240px] rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl">
          <PullMenuItem
            label="Pull"
            hint="Fast-forward, or ask merge / rebase if needed"
            onClick={() => run(pull)}
          />
          <PullMenuItem
            label="Pull (fast-forward only)"
            hint="Fail if a merge or rebase would be required"
            onClick={() => run(pullFfOnly)}
          />
          <PullMenuItem
            label="Pull (rebase)"
            hint="git pull --rebase style"
            onClick={() => run(pullRebase)}
          />
          <PullMenuItem
            label="Pull (merge)"
            hint="Merge upstream into current branch"
            onClick={() => run(pullMerge)}
          />
        </div>
      )}
    </div>
  );
}

function PullMenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
    >
      <span>{label}</span>
      <span className="text-[11px] text-zinc-500">{hint}</span>
    </button>
  );
}
