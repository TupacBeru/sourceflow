import { AlertTriangle, Settings } from "lucide-react";

import { prompt } from "@/components/Dialog/DialogHost";
import { api } from "@/lib/tauri";
import type { OperationKind } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

function kindLabel(kind: OperationKind): string {
  switch (kind) {
    case "merge":
      return "Merge";
    case "rebase":
      return "Rebase";
    case "cherrypick":
      return "Cherry-pick";
    case "revert":
      return "Revert";
    default:
      return "Operation";
  }
}

export function ConflictBanner() {
  const active = useActiveTab();
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  if (!active) return null;
  const op = active.operationState;
  if (op.kind === "none") return null;

  const tabId = active.id;
  const title = op.label ?? `${kindLabel(op.kind)} in progress`;
  const toolName = op.merge_tool_name ?? "mergetool";

  const onContinue = async () => {
    await withBusy(`Continuing ${kindLabel(op.kind).toLowerCase()}...`, () =>
      api.continueOperation(tabId),
    );
    await reloadAll(tabId);
  };

  const onAbort = async () => {
    if (
      !confirm(
        `Abort this ${kindLabel(op.kind).toLowerCase()}? Unresolved changes will be discarded.`,
      )
    ) {
      return;
    }
    await withBusy(`Aborting ${kindLabel(op.kind).toLowerCase()}...`, () =>
      api.abortOperation(tabId),
    );
    await reloadAll(tabId);
  };

  const onSetMergeTool = async () => {
    const current = await api.getMergeToolSettings().catch(() => ({
      merge_tool: null,
    }));
    const res = await prompt({
      title: "Merge tool override",
      body: (
        <span className="text-zinc-400">
          Leave empty to use your global <code>git config merge.tool</code>{" "}
          (e.g. meld, vimdiff, kdiff3).
        </span>
      ),
      fields: [
        {
          id: "tool",
          label: "merge.tool name",
          placeholder: "meld",
          defaultValue: current.merge_tool ?? "",
        },
      ],
      confirmLabel: "Save",
    });
    if (!res) return;
    const name = (res.tool ?? "").trim();
    await api.setMergeToolSettings({ merge_tool: name || null });
    await reloadAll(tabId);
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-amber-800/60 bg-amber-950/40 px-4 py-2 text-sm">
      <AlertTriangle size={16} className="shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-amber-100">{title}</div>
        <div className="text-xs text-amber-200/80">
          {op.conflicted_count > 0
            ? `${op.conflicted_count} conflicted file${op.conflicted_count === 1 ? "" : "s"} — right-click each to resolve with ${toolName}`
            : "All conflicts resolved — you can continue"}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onSetMergeTool()}
        className="rounded p-1 text-amber-300/80 hover:bg-amber-900/50 hover:text-amber-100"
        title="Change merge tool"
      >
        <Settings size={14} />
      </button>
      <button
        type="button"
        onClick={() => void onAbort()}
        className="rounded border border-amber-700/60 px-3 py-1 text-xs text-amber-200 hover:bg-amber-900/50"
      >
        Abort
      </button>
      <button
        type="button"
        onClick={() => void onContinue()}
        disabled={!op.can_continue}
        className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          op.can_continue
            ? "Complete the operation"
            : "Resolve all conflicts first"
        }
      >
        Continue
      </button>
    </div>
  );
}
