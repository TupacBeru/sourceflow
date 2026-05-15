import { useEffect } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar } from "@/components/Toolbar/Toolbar";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { HistoryView } from "@/components/History/HistoryView";
import { WorkingCopyView } from "@/components/WorkingCopy/WorkingCopyView";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useRepo } from "@/store/repoStore";

export default function App() {
  const init = useRepo((s) => s.init);
  const repo = useRepo((s) => s.repo);
  const view = useRepo((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <TitleBar />
      {repo ? (
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
        <EmptyState />
      )}
    </div>
  );
}
