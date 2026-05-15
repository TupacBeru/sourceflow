import { useState } from "react";
import { Check } from "lucide-react";

import { api } from "@/lib/tauri";
import { useRepo } from "@/store/repoStore";

export function CommitForm() {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const head = useRepo((s) => s.repo?.head_branch ?? "(detached)");
  const stagedCount = useRepo((s) => s.status.staged.length);
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  // Amend allows empty message (keeps previous) and zero staged (just rewords).
  const canCommit = amend || (message.trim().length > 0 && stagedCount > 0);

  const onCommit = async () => {
    const result = await withBusy("Committing...", () =>
      api.commitChanges(message, amend),
    );
    if (result !== null) {
      setMessage("");
      setAmend(false);
      await reloadAll();
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
        placeholder={amend ? "Amend last commit (leave empty to keep message)" : "Commit message"}
        rows={3}
        className="w-full resize-none rounded-md border border-zinc-700/60 bg-zinc-950 p-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-600 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
            className="accent-blue-600"
          />
          Amend last commit
        </label>
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
    </div>
  );
}
