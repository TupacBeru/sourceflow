import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

import { api } from "@/lib/tauri";
import { useRepo } from "@/store/repoStore";

export function Toolbar() {
  const ahead = useRepo((s) => s.aheadBehind.ahead);
  const behind = useRepo((s) => s.aheadBehind.behind);
  const upstream = useRepo((s) => s.aheadBehind.upstream);
  const busy = useRepo((s) => s.busy);
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  const onPull = async () => {
    await withBusy("Pulling...", () => api.pullCurrent());
    await reloadAll();
  };
  const onPush = async () => {
    await withBusy("Pushing...", () => api.pushCurrent());
    await reloadAll();
  };
  const onFetch = async () => {
    await withBusy("Fetching...", () => api.fetchAll());
    await reloadAll();
  };

  const disabled = busy !== null;

  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/30 px-3 py-2">
      <ToolbarButton
        icon={<ArrowDown size={16} />}
        label="Pull"
        badge={behind > 0 ? behind : undefined}
        onClick={() => void onPull()}
        disabled={disabled || !upstream}
        title={upstream ? `Pull from ${upstream}` : "No upstream configured"}
      />
      <ToolbarButton
        icon={<ArrowUp size={16} />}
        label="Push"
        badge={ahead > 0 ? ahead : undefined}
        onClick={() => void onPush()}
        disabled={disabled || !upstream}
        title={upstream ? `Push to ${upstream}` : "No upstream configured"}
      />
      <ToolbarButton
        icon={<RefreshCw size={16} />}
        label="Fetch"
        onClick={() => void onFetch()}
        disabled={disabled}
        title="Fetch all remotes"
      />
      <div className="ml-auto text-xs text-zinc-500">
        {busy ?? (upstream ? `Tracking ${upstream}` : "No upstream")}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  badge,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-100 shadow-sm hover:bg-zinc-800 disabled:opacity-50"
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
