import { useMemo, useState } from "react";
import { Archive, ChevronDown, ChevronRight, GitBranch, Cloud } from "lucide-react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { BranchInfo } from "@/lib/types";
import { useRepo } from "@/store/repoStore";

export function Sidebar() {
  const branches = useRepo((s) => s.branches);
  const stashes = useRepo((s) => s.stashes);
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  const [open, setOpen] = useState({ local: true, remote: true, stash: true });

  const local = useMemo(
    () => branches.filter((b) => b.kind === "local"),
    [branches],
  );
  const remote = useMemo(
    () => branches.filter((b) => b.kind === "remote"),
    [branches],
  );

  const checkout = async (b: BranchInfo) => {
    const target = b.kind === "remote" ? b.name.replace(/^[^/]+\//, "") : b.name;
    await withBusy(`Checking out ${target}...`, () => api.checkoutBranch(target));
    await reloadAll();
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900/30 text-sm scrollbar-thin">
      <Section
        label="Local"
        icon={<GitBranch size={14} />}
        count={local.length}
        open={open.local}
        onToggle={() => setOpen((s) => ({ ...s, local: !s.local }))}
      >
        {local.map((b) => (
          <BranchRow key={b.full_ref} branch={b} onActivate={() => void checkout(b)} />
        ))}
        {local.length === 0 && <Empty text="No local branches" />}
      </Section>

      <Section
        label="Remote"
        icon={<Cloud size={14} />}
        count={remote.length}
        open={open.remote}
        onToggle={() => setOpen((s) => ({ ...s, remote: !s.remote }))}
      >
        {remote.map((b) => (
          <BranchRow key={b.full_ref} branch={b} onActivate={() => void checkout(b)} />
        ))}
        {remote.length === 0 && <Empty text="No remote branches" />}
      </Section>

      <Section
        label="Stashes"
        icon={<Archive size={14} />}
        count={stashes.length}
        open={open.stash}
        onToggle={() => setOpen((s) => ({ ...s, stash: !s.stash }))}
      >
        {stashes.map((s) => (
          <div
            key={s.sha}
            className="px-6 py-1 text-xs text-zinc-300"
            title={s.message}
          >
            <span className="font-mono text-zinc-500">stash@{`{${s.index}}`}</span>{" "}
            <span className="truncate">{s.message}</span>
          </div>
        ))}
        {stashes.length === 0 && <Empty text="No stashes" />}
      </Section>
    </aside>
  );
}

function Section({
  label,
  icon,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800/60 py-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-zinc-600">{count}</span>
      </button>
      {open && <div className="py-1">{children}</div>}
    </div>
  );
}

function BranchRow({
  branch,
  onActivate,
}: {
  branch: BranchInfo;
  onActivate: () => void;
}) {
  return (
    <button
      onDoubleClick={onActivate}
      onClick={onActivate}
      className={cn(
        "flex w-full items-center gap-2 px-6 py-1 text-left text-xs hover:bg-zinc-800/50",
        branch.is_head && "bg-zinc-800/70 font-semibold text-zinc-50",
      )}
      title={branch.full_ref}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" style={{ opacity: branch.is_head ? 1 : 0 }} />
      <span className="truncate">{branch.name}</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-6 py-1 text-xs italic text-zinc-600">{text}</div>;
}
