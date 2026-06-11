/**
 * UI strings. Unit *names* come from the RDF data in all 26 languages; the UI
 * chrome is translated here for English and Indonesian (the project's languages)
 * and falls back to English for any other selected language.
 */
export interface RankInfo {
  title: string;
  chrono?: string;
}

export interface UIStrings {
  tagline: string;
  scale: string;
  log: string;
  linear: string;
  language: string;
  search: string;
  searchPlaceholder: string;
  reset: string;
  zoom: string;
  zoomHint: string;
  ranks: RankInfo[]; // indexed by depth 0..6
  panel: {
    rank: string;
    code: string;
    span: string;
    duration: string;
    partOf: string;
    subdivisions: string;
    gssp: string;
    ratified: string;
    pending: string;
    definition: string;
    source: string;
    close: string;
    prompt: string;
    none: string;
  };
  ma: string;
  myr: string;
  present: string;
  noResults: string;
  dataNote: string;
}

const en: UIStrings = {
  tagline: "Interactive geological time scale",
  scale: "Scale",
  log: "Logarithmic",
  linear: "Linear",
  language: "Language",
  search: "Search",
  searchPlaceholder: "Search intervals…",
  reset: "Reset view",
  zoom: "Zoom in",
  zoomHint: "Click an interval for details · double-click to zoom in",
  ranks: [
    { title: "Supereon" },
    { title: "Eon", chrono: "Eonothem" },
    { title: "Era", chrono: "Erathem" },
    { title: "Period", chrono: "System" },
    { title: "Subperiod", chrono: "Subsystem" },
    { title: "Epoch", chrono: "Series" },
    { title: "Age", chrono: "Stage" },
  ],
  panel: {
    rank: "Rank",
    code: "Code",
    span: "Age span",
    duration: "Duration",
    partOf: "Part of",
    subdivisions: "Subdivisions",
    gssp: "GSSP",
    ratified: "Ratified",
    pending: "Not yet defined",
    definition: "Definition",
    source: "View on stratigraphy.org",
    close: "Close",
    prompt: "Select an interval on the chart to see its details.",
    none: "—",
  },
  ma: "Ma",
  myr: "Myr",
  present: "present",
  noResults: "No matching intervals",
  dataNote: "Data: ICS International Chronostratigraphic Chart",
};

const id: UIStrings = {
  tagline: "Skala waktu geologi interaktif",
  scale: "Skala",
  log: "Logaritmik",
  linear: "Linear",
  language: "Bahasa",
  search: "Cari",
  searchPlaceholder: "Cari interval…",
  reset: "Atur ulang",
  zoom: "Perbesar",
  zoomHint: "Klik interval untuk detail · klik dua kali untuk memperbesar",
  ranks: [
    { title: "Adi-Eon" },
    { title: "Eon", chrono: "Eonotem" },
    { title: "Era", chrono: "Eratem" },
    { title: "Periode", chrono: "Sistem" },
    { title: "Sub-periode", chrono: "Sub-sistem" },
    { title: "Kala", chrono: "Seri" },
    { title: "Umur", chrono: "Tingkat" },
  ],
  panel: {
    rank: "Tingkatan",
    code: "Kode",
    span: "Rentang usia",
    duration: "Durasi",
    partOf: "Bagian dari",
    subdivisions: "Subdivisi",
    gssp: "GSSP",
    ratified: "Disahkan",
    pending: "Belum ditetapkan",
    definition: "Definisi",
    source: "Lihat di stratigraphy.org",
    close: "Tutup",
    prompt: "Pilih interval pada bagan untuk melihat detailnya.",
    none: "—",
  },
  ma: "Ma", // mega-annum — used in Indonesian geology too
  myr: "juta tahun",
  present: "sekarang",
  noResults: "Tidak ada interval yang cocok",
  dataNote: "Data: Bagan Kronostratigrafi Internasional ICS",
};

const TABLE: Record<string, UIStrings> = { en, id };

export function ui(lang: string): UIStrings {
  return TABLE[lang] ?? en;
}

/** Fill a localized definition template, e.g. "… {0} … {1} …". */
export function definitionFor(
  template: string | undefined,
  beginning: number | string,
  end: number | string,
): string {
  if (!template) return "";
  return template.replaceAll("{0}", String(beginning)).replaceAll("{1}", String(end));
}
