import { useRepo } from "@/store/repoStore";

/** After merge/rebase/pull, jump to Working Copy when conflicts need resolution. */
export function focusConflictsIfNeeded(tabId: string) {
  const tab = useRepo.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.operationState.kind === "none") return;
  useRepo.getState().setView(tabId, "working");
  const first = tab.status.conflicted[0];
  if (first) {
    useRepo.getState().setSelectFile(tabId, { path: first.path, staged: false });
  }
}

export function isTauriError(e: unknown, kind: string): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "kind" in e &&
    (e as { kind: unknown }).kind === kind
  );
}
