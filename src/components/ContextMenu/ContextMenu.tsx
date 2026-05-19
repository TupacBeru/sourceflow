import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

// --- Types -----------------------------------------------------------------

export type ContextMenuItem =
  | { type: "separator" }
  | {
      type?: "item";
      label: string;
      shortcut?: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    };

// --- Imperative menu opener ------------------------------------------------

type MenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

// A tiny global so any component can open a menu without prop-drilling a
// provider through every panel. The single host is mounted once in <App>.
let setOpenMenu: ((s: MenuState | null) => void) | null = null;

export function openContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
  event.preventDefault();
  event.stopPropagation();
  if (!setOpenMenu) return;
  // Filter out empty/no-op item arrays so right-click with nothing to show is
  // simply ignored.
  if (items.filter((i) => i.type !== "separator").length === 0) return;
  setOpenMenu({ x: event.clientX, y: event.clientY, items });
}

// --- Host component (mount once near the root) -----------------------------

export function ContextMenuHost() {
  const [state, setState] = useState<MenuState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenMenu = setState;
    return () => {
      if (setOpenMenu === setState) setOpenMenu = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Closing on any mousedown outside or scroll matches SourceTree / GH
    // Desktop. We register `mousedown` (not `click`) so the menu disappears
    // before the underlying control reacts.
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [state]);

  // Position the menu so it always fits in the viewport.
  useLayoutEffect(() => {
    if (!state || !menuRef.current) {
      setPos(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = state.x;
    let y = state.y;
    if (x + rect.width > vw - 4) x = Math.max(4, vw - rect.width - 4);
    if (y + rect.height > vh - 4) y = Math.max(4, vh - rect.height - 4);
    setPos({ x, y });
  }, [state]);

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: (pos ?? state).x,
        top: (pos ?? state).y,
        // Hide briefly while we measure so we don't paint a flicker at the
        // original click position before it gets clamped.
        visibility: pos ? "visible" : "hidden",
      }}
      // Stop the host-level mousedown listener from immediately closing.
      onMouseDown={(e) => e.stopPropagation()}
      className="z-[10000] min-w-[180px] max-w-[280px] rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl shadow-black/60"
    >
      {state.items.map((item, idx) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${idx}`}
              className="my-1 h-px bg-zinc-800"
              role="separator"
            />
          );
        }
        return (
          <button
            key={`${item.label}-${idx}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              setState(null);
              // Defer so the menu's own click handler unmounts before the
              // action mutates state - prevents stale-DOM warnings on items
              // that re-render the right-clicked row.
              setTimeout(item.onClick, 0);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left",
              "disabled:cursor-not-allowed disabled:opacity-50",
              item.danger
                ? "text-red-300 hover:bg-red-900/40 hover:text-red-200"
                : "text-zinc-200 hover:bg-zinc-800 hover:text-white",
            )}
          >
            {item.icon && (
              <span className="flex h-4 w-4 items-center justify-center text-zinc-400">
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-zinc-500">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// --- Convenience wrapper: <ContextMenu items={...}><Row/></ContextMenu> ----

export function ContextMenu({
  items,
  children,
}: {
  items: ContextMenuItem[] | (() => ContextMenuItem[]);
  children: ReactElement;
}) {
  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      const resolved = typeof items === "function" ? items() : items;
      openContextMenu(e, resolved);
    },
    [items],
  );
  if (!isValidElement(children)) return children;
  type WithCtx = { onContextMenu?: (e: MouseEvent) => void };
  const original = (children.props as WithCtx).onContextMenu;
  return cloneElement(children as ReactElement<WithCtx>, {
    onContextMenu: (e: MouseEvent) => {
      original?.(e);
      onContextMenu(e);
    },
  });
}
