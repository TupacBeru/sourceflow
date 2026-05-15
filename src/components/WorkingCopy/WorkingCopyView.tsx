import { useEffect } from "react";

import { useRepo } from "@/store/repoStore";

import { FileList } from "./FileList";
import { DiffPanel } from "./DiffPanel";
import { CommitForm } from "./CommitForm";

export function WorkingCopyView() {
  const reloadStatus = useRepo((s) => s.reloadStatus);
  useEffect(() => {
    void reloadStatus();
  }, [reloadStatus]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30">
          <FileList />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <DiffPanel />
        </div>
      </div>
      <CommitForm />
    </div>
  );
}
