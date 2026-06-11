/**
 * Build-time parser: chart.ttl (ICS International Chronostratigraphic Chart, RDF/Turtle)
 *   -> src/data/timescale.json   (structured, render-ready)
 *
 * Source data: https://github.com/i-c-stratigraphy/chart (CC-BY 4.0, ICS).
 * Run with: bun run scripts/parse-chart.ts
 */
import { DataFactory, Parser, Store, type Quad_Object, type Term } from "n3";

const ROOT = new URL("..", import.meta.url).pathname;
const TTL_PATH = `${ROOT}chart.ttl`;
const OUT_PATH = `${ROOT}src/data/timescale.json`;
// Fetched fresh on every build; override the branch/source with CHART_TTL_URL.
const TTL_URL =
  process.env.CHART_TTL_URL ||
  "https://raw.githubusercontent.com/i-c-stratigraphy/chart/main/chart.ttl";

// --- Vocabulary IRIs --------------------------------------------------------
const NS = {
  ischart: "http://resource.geosciml.org/classifier/ics/ischart/",
  gts: "http://resource.geosciml.org/ontology/timescale/gts#",
  rank: "http://resource.geosciml.org/ontology/timescale/rank/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  time: "http://www.w3.org/2006/time#",
  schema: "https://schema.org/",
  sh: "http://www.w3.org/ns/shacl#",
  dcterms: "http://purl.org/dc/terms/",
};
const P = {
  rank: NS.gts + "rank",
  ratifiedGSSP: NS.gts + "ratifiedGSSP",
  prefLabel: NS.skos + "prefLabel",
  definition: NS.skos + "definition",
  broader: NS.skos + "broader",
  narrower: NS.skos + "narrower",
  notation: NS.skos + "notation",
  hasBeginning: NS.time + "hasBeginning",
  hasEnd: NS.time + "hasEnd",
  inMYA: NS.ischart + "inMYA",
  marginOfError: NS.schema + "marginOfError",
  color: NS.schema + "color",
  order: NS.sh + "order",
};

/** Geochronologic rank -> column depth (0 = broadest). */
const RANK_DEPTH: Record<string, number> = {
  "Super-Eon": 0,
  Eon: 1,
  Era: 2,
  Period: 3,
  "Sub-Period": 4,
  Epoch: 5,
  Age: 6,
};

// --- helpers ----------------------------------------------------------------
const localName = (iri: string): string =>
  iri.split(/[/#]/).pop() as string;

const num = (t: Quad_Object | undefined): number | null =>
  t ? Number.parseFloat(t.value) : null;

/** Collect a predicate's literals into a { lang: value } map. */
function langMap(store: Store, subject: Term, predicate: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of store.getObjects(subject, predicate, null)) {
    const lang = (o as { language?: string }).language || "en";
    // Prefer the first value seen for a given tag (source has no dupes per tag).
    if (!(lang in out)) out[lang] = o.value;
  }
  return out;
}

/** Relative luminance -> readable text colour for a CGMW swatch. */
function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1b1b1b";
  const n = Number.parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.55 ? "#1b1b1b" : "#ffffff";
}

// --- load source ------------------------------------------------------------
// Always pull the freshest chart.ttl, caching it locally; fall back to the
// cached copy when offline, and to the committed JSON if there is none.
async function loadTtl(): Promise<string | null> {
  try {
    const res = await fetch(TTL_URL, {
      headers: { "User-Agent": "zaman-zamin-build" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("ischart:") || !text.includes("skos:"))
      throw new Error("response did not look like the chart Turtle");
    await Bun.write(TTL_PATH, text); // cache for dev + offline fallback
    console.log(`↓ fetched fresh chart.ttl (${(text.length / 1024).toFixed(0)} KiB) from ${TTL_URL}`);
    return text;
  } catch (err) {
    console.warn(`! could not download chart.ttl: ${(err as Error).message}`);
    const cached = Bun.file(TTL_PATH);
    if (await cached.exists()) {
      console.warn(`  falling back to cached ${TTL_PATH}`);
      return cached.text();
    }
    return null;
  }
}

const ttl = await loadTtl();
if (ttl === null) {
  console.warn(`! no chart.ttl available — keeping existing ${OUT_PATH}`);
  process.exit(0);
}
const store = new Store(new Parser().parse(ttl));

type Boundary = { mya: number; lex: string; error: number | null };
function boundary(subject: Term, predicate: string): Boundary | null {
  const node = store.getObjects(subject, predicate, null)[0];
  if (!node) return null;
  const lit = store.getObjects(node, P.inMYA, null)[0];
  if (!lit) return null;
  const mya = Number.parseFloat(lit.value);
  if (Number.isNaN(mya)) return null;
  return { mya, lex: lit.value, error: num(store.getObjects(node, P.marginOfError, null)[0]) };
}

interface Unit {
  id: string;
  rank: string;
  depth: number;
  parent: string | null;
  children: string[];
  order: number;
  beginning: number; // older boundary (Ma)
  end: number; // younger boundary (Ma)
  beginningStr: string; // original lexical value, preserves ICS precision
  endStr: string;
  beginningError: number | null;
  endError: number | null;
  color: string;
  textColor: string;
  notation: string | null;
  ratifiedGSSP: boolean;
  label: Record<string, string>;
}

/** Per-language reference definitions, used to derive sentence templates. */
const refDefinitions: Record<string, Record<string, string>> = {};

const units: Unit[] = [];
const languages = new Set<string>();

// Every geochronologic unit is a subject carrying a gts:rank.
for (const q of store.getQuads(null, P.rank, null, null)) {
  const subject = q.subject;
  const id = localName(subject.value);
  const rank = localName(q.object.value);

  const begin = boundary(subject, P.hasBeginning);
  const end = boundary(subject, P.hasEnd);
  if (!begin || !end) {
    console.warn(`! ${id} missing boundaries — skipped`);
    continue;
  }

  const label = langMap(store, subject, P.prefLabel);
  for (const l of Object.keys(label)) languages.add(l);
  // Keep one reference unit's multilingual definition to derive templates from.
  if (id === "Cambrian") Object.assign(refDefinitions, { Cambrian: langMap(store, subject, P.definition) });

  const colorRaw = store.getObjects(subject, P.color, null)[0]?.value ?? "#cccccc";
  const color = colorRaw.startsWith("#") ? colorRaw : `#${colorRaw}`;
  const parentTerm = store.getObjects(subject, P.broader, null)[0];
  const orderTerm = store.getObjects(subject, P.order, null)[0];

  units.push({
    id,
    rank,
    depth: RANK_DEPTH[rank] ?? 6,
    parent: parentTerm ? localName(parentTerm.value) : null,
    children: store
      .getObjects(subject, P.narrower, null)
      .map((o) => localName(o.value)),
    order: orderTerm ? Number.parseFloat(orderTerm.value) : 0,
    beginning: begin.mya,
    end: end.mya,
    beginningStr: begin.lex,
    endStr: end.lex,
    beginningError: begin.error,
    endError: end.error,
    color,
    textColor: textColorFor(color),
    notation: store.getObjects(subject, P.notation, null)[0]?.value ?? null,
    ratifiedGSSP: store.getObjects(subject, P.ratifiedGSSP, null)[0]?.value === "true",
    label,
  });
}

// Derive a sentence template per language from the reference unit (Cambrian:
// "A time period from 538.8 to 486.85 million years ago" -> "... {0} ... {1} ...").
const definitionTemplates: Record<string, string> = {};
const refDefs = refDefinitions.Cambrian ?? {};
for (const [lang, text] of Object.entries(refDefs)) {
  const tpl = text.replace("538.8", "{0}").replace("486.85", "{1}");
  if (tpl.includes("{0}") && tpl.includes("{1}")) definitionTemplates[lang] = tpl;
}

// Order siblings by sh:order, then youngest-first for stable rendering.
units.sort((a, b) => a.depth - b.depth || a.order - b.order || a.end - b.end);

// Re-sort each unit's children by the order of their actual records.
const orderOf = new Map(units.map((u, i) => [u.id, i]));
for (const u of units) {
  u.children.sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
}

// Some positional subdivisions (Upper/Middle/Lower …) and unnamed Cambrian
// series/stages carry no skos:prefLabel — only a definition. Synthesize names:
// English from the id, Indonesian from the localized parent + position word.
const byIdUnit = new Map(units.map((u) => [u.id, u]));
const prettify = (id: string) =>
  id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").trim();
const POS_ID: Record<string, string> = { Upper: "Atas", Middle: "Tengah", Lower: "Bawah" };
let synthesized = 0;
for (const u of units) {
  if (Object.keys(u.label).length > 0) continue;
  synthesized++;
  u.label.en = prettify(u.id);
  const pos = /^(Upper|Middle|Lower)/.exec(u.id)?.[1];
  const parent = u.parent ? byIdUnit.get(u.parent) : undefined;
  if (pos && parent?.label.id) u.label.id = `${parent.label.id} ${POS_ID[pos]}`;
  else u.label.id = prettify(u.id);
}

// --- metadata ---------------------------------------------------------------
const grab = (term: string, pred = P.prefLabel) =>
  langMap(store, DataFactory.namedNode(NS.dcterms + term), pred);

const maxAge = units.reduce((m, u) => Math.max(m, u.beginning), 0);

// Friendly display names for the language tags present in the data.
const LANG_NAMES: Record<string, string> = {
  en: "English",
  id: "Bahasa Indonesia",
  az: "Azərbaycanca",
  ca: "Català",
  cs: "Čeština",
  de: "Deutsch",
  es: "Español",
  "es-a": "Español (América)",
  "es-419": "Español (Latinoamérica)",
  eu: "Euskara",
  fi: "Suomi",
  fr: "Français",
  hu: "Magyar",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  lt: "Lietuvių",
  nl: "Nederlands",
  "nl-be": "Nederlands (België)",
  no: "Norsk",
  pl: "Polski",
  pt: "Português",
  "pt-br": "Português (Brasil)",
  ru: "Русский",
  sk: "Slovenčina",
  tr: "Türkçe",
  zh: "中文",
};

const langList = [...languages].sort((a, b) =>
  a === "en" ? -1 : b === "en" ? 1 : a === "id" ? -1 : b === "id" ? 1 : a.localeCompare(b),
);

const out = {
  meta: {
    title: "ICS International Chronostratigraphic Chart",
    version: "2024-12",
    source: "https://stratigraphy.org/chart",
    data: "https://github.com/i-c-stratigraphy/chart",
    license: "CC-BY 4.0",
    maxAge,
    languages: langList.map((code) => ({ code, name: LANG_NAMES[code] ?? code })),
    citation: grab("bibliographicCitation"),
    publisher: grab("created"),
    contributor: grab("contributor"),
    definitionTemplates,
  },
  units,
};

await Bun.write(OUT_PATH, JSON.stringify(out));

// --- report -----------------------------------------------------------------
const byRank = units.reduce<Record<string, number>>((acc, u) => {
  acc[u.rank] = (acc[u.rank] ?? 0) + 1;
  return acc;
}, {});
const bytes = (await Bun.file(OUT_PATH).text()).length;
console.log(`✓ parsed ${units.length} units → ${OUT_PATH}`);
console.log(`  ranks: ${JSON.stringify(byRank)}`);
console.log(`  languages (${langList.length}): ${langList.join(", ")}`);
console.log(`  maxAge: ${maxAge} Ma   size: ${(bytes / 1024).toFixed(1)} KiB`);
console.log(`  synthesized labels (no prefLabel in source): ${synthesized}`);
const roots = units.filter((u) => !u.parent).map((u) => u.id);
console.log(`  roots: ${roots.join(", ")}`);
