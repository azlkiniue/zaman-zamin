export type ScaleMode = "log" | "linear";

/** A single geochronologic unit (eon, era, period, …). */
export interface Unit {
  id: string;
  rank: string;
  depth: number; // 0 Super-Eon … 6 Age
  parent: string | null;
  children: string[];
  order: number;
  beginning: number; // older boundary, Ma
  end: number; // younger boundary, Ma
  beginningStr: string; // original lexical value (preserves ICS precision)
  endStr: string;
  beginningError: number | null;
  endError: number | null;
  color: string;
  textColor: string;
  notation: string | null;
  ratifiedGSSP: boolean;
  label: Record<string, string>;
}

export interface LangOption {
  code: string;
  name: string;
}

export interface TimescaleMeta {
  title: string;
  version: string;
  source: string;
  data: string;
  license: string;
  maxAge: number;
  languages: LangOption[];
  citation: Record<string, string>;
  publisher: Record<string, string>;
  contributor: Record<string, string>;
  definitionTemplates: Record<string, string>;
}

export interface TimescaleData {
  meta: TimescaleMeta;
  units: Unit[];
}

/** The visible slice of deep time, in Ma (young = top, old = bottom). */
export interface ViewWindow {
  young: number;
  old: number;
}
