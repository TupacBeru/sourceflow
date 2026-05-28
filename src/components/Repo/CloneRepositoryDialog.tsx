import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";

import { Dialog, DialogActions } from "@/components/Dialog/Dialog";
import { folderNameFromUrl } from "@/lib/cloneUrl";
import { formatError } from "@/lib/format";
import { api } from "@/lib/tauri";
import { useRepo } from "@/store/repoStore";

type CloneRepositoryDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function CloneRepositoryDialog({
  open,
  onClose,
}: CloneRepositoryDialogProps) {
  const github = useRepo((s) => s.github);
  const openRepo = useRepo((s) => s.openRepo);

  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderTouched, setFolderTouched] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCloning(false);
      setCloneError(null);
      return;
    }
    setUrl("");
    setFolderName("");
    setFolderTouched(false);
    setCloneError(null);
    void api.getLastCloneParent().then((p) => {
      if (p) setParentDir(p);
    });
  }, [open]);

  useEffect(() => {
    if (!open || folderTouched || cloning) return;
    if (url.trim()) setFolderName(folderNameFromUrl(url));
  }, [open, url, folderTouched, cloning]);

  const fullPath = useMemo(() => {
    if (!parentDir.trim() || !folderName.trim()) return "";
    const sep = parentDir.includes("\\") ? "\\" : "/";
    const base = parentDir.replace(/[/\\]+$/, "");
    return `${base}${sep}${folderName.trim()}`;
  }, [parentDir, folderName]);

  const canClone =
    github.connected &&
    url.trim().length > 0 &&
    parentDir.trim().length > 0 &&
    folderName.trim().length > 0;

  const requestClose = () => {
    if (cloning) return;
    onClose();
  };

  const browseParent = async () => {
    if (cloning) return;
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Clone into folder",
      defaultPath: parentDir || undefined,
    });
    if (typeof selected === "string") setParentDir(selected);
  };

  const onClone = async () => {
    if (!canClone || cloning) return;
    setCloning(true);
    setCloneError(null);
    try {
      const summary = await api.cloneRepository(
        url.trim(),
        parentDir.trim(),
        folderName.trim(),
      );
      await openRepo(summary.path);
      onClose();
    } catch (e) {
      setCloneError(formatError(e));
    } finally {
      setCloning(false);
    }
  };

  if (!open) return null;

  const fieldsDisabled = cloning;

  return (
    <Dialog open onClose={requestClose} blockClose={cloning} width={500}>
      <h2 className="text-base font-semibold text-zinc-100">Clone repository</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Clones from GitHub using your SourceFlow sign-in. Use an HTTPS or{" "}
        <code className="text-zinc-300">git@github.com:owner/repo</code> URL.
      </p>

      {!github.connected && (
        <p className="mt-3 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          Connect GitHub first (toolbar) so private repositories can be cloned
          without a browser login prompt.
        </p>
      )}

      {cloning && (
        <div
          className="mt-4 flex items-center gap-3 rounded-md border border-blue-800/50 bg-blue-950/30 px-3 py-3"
          role="status"
          aria-live="polite"
        >
          <Loader2
            className="shrink-0 animate-spin text-blue-400"
            size={22}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              Cloning repository…
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-400" title={fullPath}>
              {fullPath || url.trim()}
            </p>
          </div>
        </div>
      )}

      {cloneError && !cloning && (
        <p className="mt-3 rounded border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {cloneError}
        </p>
      )}

      <fieldset
        disabled={fieldsDisabled}
        className="mt-4 space-y-3 border-0 p-0 disabled:opacity-60"
      >
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Repository URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo.git"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Clone into
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={parentDir}
              placeholder="Choose parent directory…"
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-300 focus:outline-none disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => void browseParent()}
              className="flex shrink-0 items-center gap-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderOpen size={14} />
              Browse…
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Folder name
          </label>
          <input
            type="text"
            value={folderName}
            onChange={(e) => {
              setFolderTouched(true);
              setFolderName(e.target.value);
            }}
            placeholder="repo"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed"
          />
        </div>

        {fullPath && (
          <p className="text-xs text-zinc-500">
            Full path:{" "}
            <span className="font-mono text-zinc-400">{fullPath}</span>
          </p>
        )}
      </fieldset>

      <DialogActions
        onCancel={requestClose}
        onConfirm={() => void onClone()}
        confirmLabel={cloning ? "Cloning…" : "Clone"}
        confirmDisabled={!canClone}
        confirmLoading={cloning}
        cancelDisabled={cloning}
      />
    </Dialog>
  );
}
