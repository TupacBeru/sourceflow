import { useState } from "react";
import { Check } from "lucide-react";

import { api } from "@/lib/tauri";
import { useActiveTab, useRepo } from "@/store/repoStore";

export function CommitForm() {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(false);
  const active = useActiveTab();
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  if (!active) return null;
  const tabId = active.id;
  const head = active.repo?.head_branch ?? "(detached)";
  const stagedCount = active.status.staged.length;

  // Amend allows empty message (keeps previous) and zero staged (just rewords).
  const canCommit =
    amend || (message.trim().length > 0 && (stagedCount > 0 || allowEmpty));

  const onCommit = async () => {
    const result = await withBusy("Committing...", () =>
      api.commitChanges(tabId, message, amend, allowEmpty),
    );
    if (result !== null) {
      setMessage("");
      setAmend(false);
      setAllowEmpty(false);
      await reloadAll(tabId);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) {
      e.preventDefault();
      void onCommit();
    }
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/40 p-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKey}
        placeholder={
          amend
            ? "Amend last commit (leave empty to keep message)"
            : "Commit message"
        }
        rows={3}
        className="w-full resize-none rounded-md border border-zinc-700/60 bg-zinc-950 p-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-600 focus:outline-none"
      />
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={amend}
              onChange={(e) => {
                setAmend(e.target.checked);
                if (e.target.checked) setAllowEmpty(false);
              }}
              className="accent-blue-600"
            />
            Amend last commit
          </label>
          <label
            className="flex items-center gap-2 text-xs text-zinc-400"
            title="Create a commit with no file changes (git commit --allow-empty). Useful for CI keyword triggers."
          >
            <input
              type="checkbox"
              checked={allowEmpty}
              disabled={amend}
              onChange={(e) => setAllowEmpty(e.target.checked)}
              className="accent-blue-600"
            />
            Allow empty
          </label>
        </div>
        <button
          onClick={() => void onCommit()}
          disabled={!canCommit}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:opacity-50"
          title="Ctrl+Enter"
        >
          <Check size={14} />
          Commit to <span className="font-mono">{head}</span>
        </button>
        </div>
        {allowEmpty && stagedCount === 0 && (
          <p className="text-[11px] text-zinc-500">
            No file changes will be included in this commit.
          </p>
        )}
      </div>
    </div>
  );
}
