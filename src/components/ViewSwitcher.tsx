import { History, Pencil } from "lucide-react";

import { cn } from "@/lib/cn";
import { isDirty, useActiveTab, useRepo } from "@/store/repoStore";

export function ViewSwitcher() {
  const active = useActiveTab();
  const setView = useRepo((s) => s.setView);
  if (!active) return null;

  const dirty = isDirty(active.status);
  const view = active.view;

  return (
    <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <Tab
        active={view === "history"}
        onClick={() => setView(active.id, "history")}
        icon={<History size={14} />}
      >
        Commit History
      </Tab>
      <Tab
        active={view === "working"}
        onClick={() => setView(active.id, "working")}
        icon={<Pencil size={14} />}
        dot={dirty}
      >
        Working Copy
      </Tab>
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
      )}
    >
      {icon}
      <span>{children}</span>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
    </button>
  );
}
