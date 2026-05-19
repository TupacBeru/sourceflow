import { useEffect } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { TabBar } from "@/components/Tabs/TabBar";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar } from "@/components/Toolbar/Toolbar";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { HistoryView } from "@/components/History/HistoryView";
import { WorkingCopyView } from "@/components/WorkingCopy/WorkingCopyView";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useActiveTab, useRepo } from "@/store/repoStore";

export default function App() {
  const init = useRepo((s) => s.init);
  const tabs = useRepo((s) => s.tabs);
  const active = useActiveTab();
  const view = active?.view ?? "history";

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <TitleBar />
      {tabs.length > 0 && <TabBar />}
      {active ? (
        <>
          <Toolbar />
          <ViewSwitcher />
          <ErrorBanner />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
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
    </div>
  );
}
