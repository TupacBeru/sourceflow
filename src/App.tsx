import { useEffect } from "react";

import { BackgroundFetcher } from "@/components/BackgroundFetcher";
import { LiveRepoSync } from "@/components/LiveRepoSync";
import { ContextMenuHost } from "@/components/ContextMenu/ContextMenu";
import { DialogHost } from "@/components/Dialog/DialogHost";
import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { TabBar } from "@/components/Tabs/TabBar";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar } from "@/components/Toolbar/Toolbar";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { HistoryView } from "@/components/History/HistoryView";
import { WorkingCopyView } from "@/components/WorkingCopy/WorkingCopyView";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useResizableSplit } from "@/lib/useResizableSplit";
import { useActiveTab, useRepo } from "@/store/repoStore";

export default function App() {
  const init = useRepo((s) => s.init);
  const tabs = useRepo((s) => s.tabs);
  const initializing = useRepo((s) => s.initializing);
  const active = useActiveTab();
  const view = active?.view ?? "history";

  // Sidebar (branches) resize. Default 18rem = previous fixed `w-72`.
  const {
    containerRef: workspaceRef,
    sizeStyle: sidebarStyle,
    handleProps: sidebarSplit,
  } = useResizableSplit({
    side: "left",
    defaultFraction: 0.22,
    minSize: 200,
    maxFraction: 0.5,
    storageKey: "sourceflow:sidebarWidth",
  });

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <BackgroundFetcher />
      <LiveRepoSync />
      <ContextMenuHost />
      <DialogHost />
      <TitleBar />
      {initializing && tabs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
          Restoring repositories…
        </div>
      ) : (
        <>
          {tabs.length > 0 && <TabBar />}
          {active ? (
            <>
              <Toolbar />
              <ViewSwitcher />
              <ErrorBanner />
              <div ref={workspaceRef} className="flex min-h-0 flex-1">
                <Sidebar style={sidebarStyle} />
                <div {...sidebarSplit} title="Drag to resize sidebar" />
                <main className="flex min-h-0 flex-1 flex-col">
                  {view === "history" ? <HistoryView /> : <WorkingCopyView />}
                </main>
              </div>
            </>
          ) : (
            <>
              <ErrorBanner />
              <EmptyState />
            </>
          )}
        </>
      )}
    </div>
  );
}
