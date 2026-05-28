import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

/** Lightweight modal shell - centered card, click-outside + Esc to close. */
export function Dialog({
  open,
  onClose,
  children,
  width = 420,
  /** When true, Esc and backdrop clicks do not call `onClose`. */
  blockClose = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  blockClose?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !blockClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, blockClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (blockClose) return;
        if (!cardRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal
        style={{ width }}
        className="rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/60"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Standard footer row with Cancel + primary button (optionally `danger`). */
export function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel = "OK",
  confirmDisabled,
  confirmLoading,
  cancelDisabled,
  danger,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  cancelDisabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled || confirmLoading}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled || confirmLoading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white",
          "disabled:cursor-not-allowed disabled:opacity-50",
          danger
            ? "bg-red-600 hover:bg-red-500"
            : "bg-blue-600 hover:bg-blue-500",
        )}
      >
        {confirmLoading && (
          <span
            className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
        )}
        {confirmLabel}
      </button>
    </div>
  );
}
