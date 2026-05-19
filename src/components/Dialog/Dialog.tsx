import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

/** Lightweight modal shell - centered card, click-outside + Esc to close. */
export function Dialog({
  open,
  onClose,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
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
  danger,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className={cn(
          "rounded px-3 py-1.5 text-sm font-medium text-white",
          "disabled:cursor-not-allowed disabled:opacity-50",
          danger
            ? "bg-red-600 hover:bg-red-500"
            : "bg-blue-600 hover:bg-blue-500",
        )}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
