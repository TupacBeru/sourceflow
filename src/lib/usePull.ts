import { useCallback } from "react";

import { prompt } from "@/components/Dialog/DialogHost";
import { api } from "@/lib/tauri";
import type { PullStrategy } from "@/lib/types";
import { focusConflictsIfNeeded, isTauriError } from "@/lib/repoUi";
import { useRepo } from "@/store/repoStore";

export function usePull(tabId: string) {
  const withBusyThrow = useRepo((s) => s.withBusyThrow);
  const reloadAll = useRepo((s) => s.reloadAll);

  const runPull = useCallback(
    async (strategy: PullStrategy, label: string) => {
      await withBusyThrow(label, () => api.pullCurrent(tabId, strategy));
      await reloadAll(tabId);
      focusConflictsIfNeeded(tabId);
    },
    [tabId, withBusyThrow, reloadAll],
  );

  /** Fast-forward when possible; otherwise prompt for merge vs rebase. */
  const pull = useCallback(async () => {
    try {
      await runPull("ff", "Pulling...");
    } catch (e) {
      if (!isTauriError(e, "pull_not_ff")) throw e;
      const res = await prompt({
        title: "Pull requires integrating remote commits",
        body: "Your branch and upstream have diverged. Fast-forward is not possible — choose how to integrate the remote changes.",
        fields: [],
        choices: [
          {
            id: "rebase",
            label: "Rebase onto upstream",
            description:
              "Replay your local commits on top of the remote branch (like git pull --rebase).",
          },
          {
            id: "merge",
            label: "Merge upstream into branch",
            description:
              "Create a merge commit combining both histories (like git pull --no-rebase).",
          },
        ],
        defaultChoice: "rebase",
        confirmLabel: "Pull",
      });
      if (!res) return;
      const strategy = (res.__choice ?? "rebase") as "merge" | "rebase";
      const label =
        strategy === "rebase" ? "Pulling (rebase)..." : "Pulling (merge)...";
      await runPull(strategy, label);
    }
  }, [runPull]);

  const pullFfOnly = useCallback(
    () => runPull("ff", "Pulling (fast-forward)..."),
    [runPull],
  );

  const pullRebase = useCallback(
    () => runPull("rebase", "Pulling (rebase)..."),
    [runPull],
  );

  const pullMerge = useCallback(
    () => runPull("merge", "Pulling (merge)..."),
    [runPull],
  );

  return { pull, pullFfOnly, pullRebase, pullMerge };
}
