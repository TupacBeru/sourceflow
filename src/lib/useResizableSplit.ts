import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Hook powering a draggable splitter between two flex children.
 *
 *  - `side` picks which child is being explicitly sized: `"bottom"` for a
 *    horizontal divider (resize the bottom panel vertically), `"right"` for
 *    a vertical divider (resize the right panel horizontally).
 *  - Until the user drags, the sized panel uses `defaultFraction` of the
 *    container (so it looks identical to a `flex: 40%` setup). On the first
 *    drag we switch to absolute pixels and remember them in `localStorage`
 *    so the layout survives reloads.
 *  - `maxFraction` clamps both during drag *and* in the rendered style, so
 *    if the user shrinks the window the sized panel can't eat the whole
 *    container.
 */
/**
 * Which edge of the container the *sized* panel is anchored to.
 *  - `"left"`  — sized panel is on the left; splitter sits to its right.
 *  - `"right"` — sized panel is on the right; splitter sits to its left.
 *  - `"top"`   — sized panel is on top.
 *  - `"bottom"`— sized panel is on the bottom (most common case).
 */
export type SplitSide = "left" | "right" | "top" | "bottom";

export interface ResizableSplitOptions {
  side: SplitSide;
  /** Fraction (0–1) of the container used before the user drags. */
  defaultFraction: number;
  /** Minimum size in px the panel can shrink to. */
  minSize: number;
  /** Maximum fraction (0–1) of the container the panel can grow to. */
  maxFraction?: number;
  /** localStorage key for persistence. Omit to skip persistence. */
  storageKey?: string;
}

export interface ResizableSplit {
  containerRef: React.RefObject<HTMLDivElement>;
  /** Inline style to apply to the sized panel. */
  sizeStyle: CSSProperties;
  /** Props to spread on the drag handle element. */
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
    role: string;
    "aria-label": string;
  };
}

export function useResizableSplit({
  side,
  defaultFraction,
  minSize,
  maxFraction = 0.8,
  storageKey,
}: ResizableSplitOptions): ResizableSplit {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number | null>(() => {
    if (!storageKey) return null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;
      const n = Number(saved);
      return Number.isFinite(n) && n >= minSize ? n : null;
    } catch {
      return null;
    }
  });

  // Use a ref so the live drag handler never closes over a stale value.
  const draggingRef = useRef(false);

  const isVertical = side === "top" || side === "bottom";

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // preventDefault stops the browser from starting a text selection
      // while you're dragging the splitter.
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [isVertical],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerSize = isVertical ? rect.height : rect.width;
      let raw: number;
      switch (side) {
        case "top":
          raw = e.clientY - rect.top;
          break;
        case "bottom":
          raw = rect.bottom - e.clientY;
          break;
        case "left":
          raw = e.clientX - rect.left;
          break;
        case "right":
          raw = rect.right - e.clientX;
          break;
      }
      const max = containerSize * maxFraction;
      const next = Math.max(minSize, Math.min(max, raw));
      setSize(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (storageKey) {
        setSize((s) => {
          if (s != null) {
            try {
              localStorage.setItem(storageKey, String(Math.round(s)));
            } catch {
              // Ignore quota / private-mode errors.
            }
          }
          return s;
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [side, isVertical, minSize, maxFraction, storageKey]);

  const sizeStyle: CSSProperties = isVertical
    ? {
        height: size != null ? `${size}px` : `${defaultFraction * 100}%`,
        maxHeight: `${maxFraction * 100}%`,
        minHeight: `${minSize}px`,
      }
    : {
        width: size != null ? `${size}px` : `${defaultFraction * 100}%`,
        maxWidth: `${maxFraction * 100}%`,
        minWidth: `${minSize}px`,
      };

  // Thin grab area with an even thinner visible line, so the hit target
  // is forgiving but it doesn't look like a 6px-tall border.
  const handleClassName = isVertical
    ? "group relative h-1.5 shrink-0 cursor-row-resize bg-transparent before:absolute before:left-0 before:right-0 before:top-1/2 before:-translate-y-1/2 before:h-px before:bg-zinc-800 hover:before:h-0.5 hover:before:bg-blue-500 active:before:bg-blue-400"
    : "group relative w-1.5 shrink-0 cursor-col-resize bg-transparent before:absolute before:top-0 before:bottom-0 before:left-1/2 before:-translate-x-1/2 before:w-px before:bg-zinc-800 hover:before:w-0.5 hover:before:bg-blue-500 active:before:bg-blue-400";

  return {
    containerRef,
    sizeStyle,
    handleProps: {
      onMouseDown,
      className: handleClassName,
      role: "separator",
      "aria-label": "Resize panel",
    },
  };
}
