import { useEffect } from "react";

import { useResizableSplit } from "@/lib/useResizableSplit";
import { useActiveTab, useRepo } from "@/store/repoStore";

import { ConflictBanner } from "./ConflictBanner";
import { FileList } from "./FileList";
import { DiffPanel } from "./DiffPanel";
import { CommitForm } from "./CommitForm";

export function WorkingCopyView() {
  const active = useActiveTab();
  const reloadStatus = useRepo((s) => s.reloadStatus);

  const {
    containerRef,
    sizeStyle: fileListStyle,
    handleProps: splitterProps,
  } = useResizableSplit({
    side: "left",
    defaultFraction: 0.3,
    minSize: 200,
    maxFraction: 0.7,
    storageKey: "sourceflow:workingFileListWidth",
  });

  useEffect(() => {
    if (active) void reloadStatus(active.id);
  }, [active?.id, reloadStatus]);

  if (!active) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConflictBanner />
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <div
          className="flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30"
          style={fileListStyle}
        >
          <FileList />
        </div>
        <div {...splitterProps} title="Drag to resize file list" />
        <div className="flex min-h-0 flex-1 flex-col">
          <DiffPanel />
        </div>
      </div>
      {active.operationState.kind === "none" && <CommitForm />}
    </div>
  );
}
