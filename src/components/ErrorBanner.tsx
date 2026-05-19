import { X } from "lucide-react";

import { useRepo } from "@/store/repoStore";

export function ErrorBanner() {
  const error = useRepo((s) => s.error);
  const setError = useRepo((s) => s.setError);

  if (!error) return null;
  return (
    <div className="flex items-start gap-2 border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-xs text-red-200">
      <span className="flex-1 whitespace-pre-wrap font-mono">{error}</span>
      <button
        onClick={() => setError(null)}
        className="text-red-300 hover:text-red-100"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
