import type { ScaleMode, Unit, ViewWindow } from "./types";

/**
 * Default vertical zoom of the scrollable drawing canvas (px). Young time at the
 * top, old at the bottom. Zoom is expressed purely as canvas height: taller =
 * zoomed in. The age window always spans the full timeline and the log/linear
 * mapping is exact at every level — cells are always strictly to scale.
 *
 * The default is deliberately tall so that on first load — in the default
 * logarithmic scale, scrolled to the top — the Holocene epoch and its ~4 kyr
 * sub-stages (down to the Greenlandian) are large enough to show their labels.
 * Deep time is then a scroll, or a zoom-out, away.
 */
export const DEFAULT_HEIGHT = 36_000;
/** Deepest zoom-in (px). */
export const MAX_HEIGHT = 18_000_000;
/** Cells shorter than this (px) drop their inline label (kept on hover). */
export const LABEL_MIN_PX = 13;
/** Minimum vertical spacing between numeric-axis labels (px). */
export const AXIS_MIN_GAP_PX = 15;

/** Left edge (% of the chart drawing area) for each rank depth, 0 … 6. */
export const RANK_LEFT = [0, 8, 16, 26, 33, 44, 62];
export const CHART_RIGHT = 100;

/** Header label anchor (% across) for each rank depth. */
export const RANK_HEADER_X = [4, 12, 21, 35, 38, 53, 81];

/** Map an age (Ma) to a 0..1 fraction within the current view window. */
export function frac(age: number, view: ViewWindow, mode: ScaleMode): number {
  if (mode === "log") {
    const lo = Math.log(view.young + 1);
    const hi = Math.log(view.old + 1);
    return (Math.log(age + 1) - lo) / (hi - lo);
  }
  return (age - view.young) / (view.old - view.young);
}

/** Inverse of {@link frac}: the age (Ma) at a 0..1 fraction of the view window. */
export function ageAtFrac(f: number, view: ViewWindow, mode: ScaleMode): number {
  if (mode === "log") {
    const lo = Math.log(view.young + 1);
    const hi = Math.log(view.old + 1);
    return Math.exp(f * (hi - lo) + lo) - 1;
  }
  return view.young + f * (view.old - view.young);
}

/** Map an age (Ma) to a pixel y-coordinate (young at top). */
export function yOf(
  age: number,
  view: ViewWindow,
  mode: ScaleMode,
  height = DEFAULT_HEIGHT,
): number {
  return frac(age, view, mode) * height;
}

export interface Box {
  top: number;
  height: number;
  visible: boolean;
}

/** Vertical box (px) for a unit within the current view, clamped to canvas. */
export function cellBox(
  u: Unit,
  view: ViewWindow,
  mode: ScaleMode,
  height = DEFAULT_HEIGHT,
): Box {
  const rawTop = yOf(u.end, view, mode, height);
  const rawBot = yOf(u.beginning, view, mode, height);
  const top = Math.max(0, Math.min(height, rawTop));
  const bot = Math.max(0, Math.min(height, rawBot));
  return { top, height: bot - top, visible: bot - top > 0.3 };
}

export interface Band {
  left: number;
  right: number;
}

/**
 * Horizontal band (%) where a unit's label sits: from its own rank column to
 * the column of its shallowest child (or the right edge when it is a leaf).
 * This auto-widens labels when intermediate ranks are skipped.
 */
export function labelBand(u: Unit, byId: Map<string, Unit>): Band {
  const left = RANK_LEFT[u.depth] ?? 0;
  let right = CHART_RIGHT;
  if (u.children.length) {
    let minDepth = Number.POSITIVE_INFINITY;
    for (const id of u.children) {
      const c = byId.get(id);
      if (c) minDepth = Math.min(minDepth, c.depth);
    }
    if (Number.isFinite(minDepth)) right = RANK_LEFT[minDepth] ?? CHART_RIGHT;
  }
  return { left, right };
}

/** Format an age for display: small values keep more precision. */
export function formatMa(v: number): string {
  if (v === 0) return "0";
  if (v < 0.01) return v.toFixed(4);
  if (v < 1) return v.toFixed(3);
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return v.toFixed(0);
}
