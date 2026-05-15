import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";

import { useRepo } from "@/store/repoStore";

export function EmptyState() {
  const openRepo = useRepo((s) => s.openRepo);
  const error = useRepo((s) => s.error);
  const loading = useRepo((s) => s.loadingRepo);

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
          Select a folder containing a Git repository to get started. SourceFlow
          will remember your last opened repo.
        </p>
        <button
          onClick={() => void pick()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:opacity-60"
        >
          <FolderOpen size={16} />
          {loading ? "Opening..." : "Choose folder"}
        </button>
        {error && (
          <p className="mt-4 rounded border border-red-900/50 bg-red-950/40 px-3 py-2 text-left text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
