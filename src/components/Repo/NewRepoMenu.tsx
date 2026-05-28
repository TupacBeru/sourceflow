import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Plus } from "lucide-react";

import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { CloneRepositoryDialog } from "./CloneRepositoryDialog";
import { useRepo } from "@/store/repoStore";

type NewRepoMenuProps = {
  showRecentChevron?: boolean;
  children?: React.ReactNode;
};

export function NewRepoMenu({ showRecentChevron, children }: NewRepoMenuProps) {
  const openRepo = useRepo((s) => s.openRepo);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const pickAndOpen = async () => {
    setMenuOpen(false);
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Open repository",
    });
    if (typeof selected === "string") await openRepo(selected);
  };

  const openClone = () => {
    setMenuOpen(false);
    setCloneOpen(true);
  };

  return (
    <div ref={rootRef} className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 px-4 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
        title="Open or clone repository"
        aria-expanded={menuOpen}
      >
        <Plus size={16} />
      </button>
      {showRecentChevron && children}
      {menuOpen && (
        <div className="absolute right-0 top-full z-30 mt-0 min-w-[200px] rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl">
          <MenuItem
            icon={<FolderOpen size={14} />}
            label="Open repository…"
            onClick={() => void pickAndOpen()}
          />
          <MenuItem
            icon={<Download size={14} />}
            label="Clone repository…"
            onClick={openClone}
          />
        </div>
      )}
      <CloneRepositoryDialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
    >
      {icon}
      {label}
    </button>
  );
}
