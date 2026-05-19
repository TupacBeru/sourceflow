import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";

import { useRepo } from "@/store/repoStore";

export function EmptyState() {
  const openRepo = useRepo((s) => s.openRepo);
  const recentlyClosed = useRepo((s) => s.recentlyClosed);

  const pick = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open repository",
    });
    if (typeof selected === "string") {
      await openRepo(selected);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md text-center">
        <FolderOpen className="mx-auto mb-4 text-zinc-500" size={48} />
        <h1 className="mb-2 text-xl font-semibold text-zinc-100">
          Open a repository
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Select a folder containing a Git repository to get started. You can
          open multiple repositories in tabs.
        </p>
        <button
          onClick={() => void pick()}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-500"
        >
          <FolderOpen size={16} />
          Choose folder
        </button>
        {recentlyClosed.length > 0 && (
          <div className="mt-8 text-left">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Recent
            </div>
            <div className="flex flex-col gap-1">
              {recentlyClosed.slice(0, 5).map((path) => (
                <button
                  key={path}
                  onClick={() => void openRepo(path)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  title={path}
                >
                  <FolderOpen size={12} className="text-zinc-500" />
                  <span className="flex-1 truncate">{path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
