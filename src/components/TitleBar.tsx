import { GitBranch } from "lucide-react";

import { ConnectGitHub } from "./Auth/ConnectGitHub";
import { useRepo } from "@/store/repoStore";

export function TitleBar() {
  const repo = useRepo((s) => s.repo);
  const close = useRepo((s) => s.closeRepo);

  return (
    <div className="flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight text-zinc-100">
          SourceFlow
        </span>
        {repo && (
          <button
            onClick={() => void close()}
            className="flex items-center gap-2 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Close repository"
          >
            <GitBranch size={14} />
            <span className="font-mono text-xs">{repo.name}</span>
            {repo.head_branch && (
              <span className="text-zinc-500">/ {repo.head_branch}</span>
            )}
          </button>
        )}
      </div>
      <ConnectGitHub />
    </div>
  );
}
