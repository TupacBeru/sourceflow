import type { CommitInfo } from "@/lib/types";

export const ROW_HEIGHT = 56;
export const LANE_WIDTH = 14;
export const GRAPH_PAD = 12;

const DOT_R = 5;
const STROKE = 2;

const LANE_COLORS = [
  "#60a5fa", // blue
  "#34d399", // green
  "#f472b6", // pink
  "#fbbf24", // amber
  "#a78bfa", // purple
  "#fb7185", // rose
  "#22d3ee", // cyan
  "#facc15", // yellow
];

export function laneX(lane: number) {
  return GRAPH_PAD + lane * LANE_WIDTH;
}

function colorFor(i: number) {
  return LANE_COLORS[i % LANE_COLORS.length] ?? LANE_COLORS[0];
}

/** Pixel width needed for a graph column that fits every lane in `commits`. */
export function computeGraphWidth(commits: CommitInfo[]): number {
  let max = 1;
  for (const c of commits) {
    if (c.lane + 1 > max) max = c.lane + 1;
    if (c.lanes_after.length > max) max = c.lanes_after.length;
  }
  return GRAPH_PAD * 2 + max * LANE_WIDTH;
}

interface GraphCellProps {
  commit: CommitInfo;
  /** `lanes_after` from the commit one row up; `[]` for the topmost commit. */
  prevLanesAfter: (number | null)[];
  width: number;
  isHead?: boolean;
  isSelected?: boolean;
}

/**
 * One row of the commit graph: vertical/diagonal lines through the lanes, plus
 * a colored dot for this commit. Drawn in two halves (above and below the dot)
 * so it tiles correctly with the row above and below.
 */
export function GraphCell({
  commit,
  prevLanesAfter,
  width,
  isHead,
  isSelected,
}: GraphCellProps) {
  const dotX = laneX(commit.lane);
  const dotY = ROW_HEIGHT / 2;

  const lanesAfter = commit.lanes_after;

  const topElements: JSX.Element[] = [];
  prevLanesAfter.forEach((c, lane) => {
    if (c == null) return;
    const fromX = laneX(lane);
    const stroke = colorFor(c);
    if (lane === commit.lane) {
      // Lane drops straight into this dot.
      topElements.push(
        <line
          key={`t${lane}`}
          x1={fromX}
          y1={0}
          x2={dotX}
          y2={dotY}
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      );
    } else if (commit.merge_in_edges.some((e) => e.lane === lane)) {
      // Side branch merging into this dot - curve diagonally.
      const cpY = dotY * 0.55;
      topElements.push(
        <path
          key={`t${lane}`}
          d={`M ${fromX} 0 C ${fromX} ${cpY} ${dotX} ${cpY} ${dotX} ${dotY}`}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      );
    } else if (lanesAfter[lane] === c) {
      // Genuine passthrough - same lane, same color above and below this row.
      topElements.push(
        <line
          key={`t${lane}`}
          x1={fromX}
          y1={0}
          x2={fromX}
          y2={dotY}
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      );
    }
    // Otherwise the lane was reused/recolored below; the bottom half draws
    // the new lane via its fork edge, and the old colored line should not
    // visually carry past this row.
  });

  const bottomElements: JSX.Element[] = [];
  lanesAfter.forEach((c, lane) => {
    if (c == null) return;
    const toX = laneX(lane);
    const stroke = colorFor(c);
    if (lane === commit.lane) {
      // First parent continues in this lane: vertical line out of the dot.
      bottomElements.push(
        <line
          key={`b${lane}`}
          x1={dotX}
          y1={dotY}
          x2={toX}
          y2={ROW_HEIGHT}
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      );
    } else if (prevLanesAfter[lane] === c) {
      // Lane was already alive above with the same color - pass straight
      // through the bottom half.
      bottomElements.push(
        <line
          key={`b${lane}`}
          x1={toX}
          y1={dotY}
          x2={toX}
          y2={ROW_HEIGHT}
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      );
    }
    // Otherwise this is a brand-new lane forked off this commit; the fork
    // edge below draws the curve from the dot, so we skip the bare vertical
    // that would otherwise look uncapped at the top.
  });

  // Diagonals from the dot to additional-parent lanes in the row below.
  commit.fork_edges.forEach((edge, i) => {
    if (edge.lane === commit.lane) return;
    const toX = laneX(edge.lane);
    const cpY = ROW_HEIGHT - (ROW_HEIGHT - dotY) * 0.55;
    bottomElements.push(
      <path
        key={`f${i}`}
        d={`M ${dotX} ${dotY} C ${dotX} ${cpY} ${toX} ${cpY} ${toX} ${ROW_HEIGHT}`}
        fill="none"
        stroke={colorFor(edge.color)}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />,
    );
  });

  const dotFill = colorFor(commit.color);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 pointer-events-none"
    >
      {topElements}
      {bottomElements}
      {isHead && (
        <circle
          cx={dotX}
          cy={dotY}
          r={DOT_R + 3}
          fill="none"
          stroke={dotFill}
          strokeWidth={1.5}
          opacity={0.55}
        />
      )}
      <circle
        cx={dotX}
        cy={dotY}
        r={DOT_R}
        fill={dotFill}
        stroke={isSelected ? "#f4f4f5" : "#18181b"}
        strokeWidth={2}
      />
    </svg>
  );
}
