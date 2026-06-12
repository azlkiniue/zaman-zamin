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

const fmt = (v: number, max: number, locale: string) =>
  v.toLocaleString(locale, { maximumFractionDigits: max });

/**
 * Compact age for the numeric axis, using the standard geological SI units so
 * sub-million-year values stay legible: thousand (ka), million (Ma), billion
 * (Ga) years. e.g. 0.0117 → "11.7 ka", 251.902 → "252 Ma", 4567 → "4.6 Ga".
 */
export function compactAge(ma: number, locale = "en"): string {
  if (ma === 0) return "0";
  if (ma < 1) {
    const ka = (ma * 1e6) / 1000;
    return `${fmt(ka, ka < 100 ? 1 : 0, locale)} ka`;
  }
  if (ma < 1000) {
    return `${fmt(ma, ma < 10 ? 2 : ma < 100 ? 1 : 0, locale)} Ma`;
  }
  return `${fmt(ma / 1000, 1, locale)} Ga`;
}

/** Translatable words for the long-form, plain-language age. */
export interface AgeWords {
  years: string;
  million: string;
  billion: string;
  present: string;
  locale: string;
}

/** A value split into its number and unit so spans can share a common unit. */
function ageParts(ma: number, w: AgeWords): { num: string; unit: string; band: number } {
  if (ma < 1) {
    // Under a million years reads best as a plain year count: "11,700 years".
    const years = Math.round((ma * 1e6) / 100) * 100;
    return { num: fmt(years, 0, w.locale), unit: w.years, band: 0 };
  }
  if (ma < 1000) {
    return { num: fmt(ma, ma < 10 ? 2 : 1, w.locale), unit: `${w.million} ${w.years}`, band: 1 };
  }
  return { num: fmt(ma / 1000, 2, w.locale), unit: `${w.billion} ${w.years}`, band: 2 };
}

/** A single age in plain language, e.g. "11,700 years" or "2.58 million years". */
export function humanAge(ma: number, w: AgeWords): string {
  if (ma === 0) return w.present;
  const p = ageParts(ma, w);
  return `${p.num} ${p.unit}`;
}

/**
 * An age span in plain language. Ends sharing a magnitude share the unit
 * ("251.9 – 247.2 million years"); ends that differ keep their own so the young
 * end stays legible ("2.58 million years – 11,700 years").
 */
export function humanSpan(begin: number, end: number, w: AgeWords): string {
  const b = ageParts(begin, w);
  if (end === 0) return `${b.num} ${b.unit} – ${w.present}`;
  const e = ageParts(end, w);
  if (b.band === e.band) return `${b.num} – ${e.num} ${b.unit}`;
  return `${b.num} ${b.unit} – ${e.num} ${e.unit}`;
}
