import rawData from "../data/timescale.json";
import {
  AXIS_MIN_GAP_PX,
  CHART_HEIGHT,
  LABEL_MIN_PX,
  RANK_LEFT,
  cellBox,
  formatMa,
  labelBand,
  yOf,
} from "../lib/layout";
import { definitionFor, ui } from "../lib/i18n";
import type { ScaleMode, TimescaleData, Unit, ViewWindow } from "../lib/types";

const data = rawData as unknown as TimescaleData;
const { meta, units } = data;
const MAX_AGE = meta.maxAge;

// --- indexes ----------------------------------------------------------------
const byId = new Map<string, Unit>(units.map((u) => [u.id, u]));
const bandCache = new Map<string, { left: number; right: number }>();
for (const u of units) bandCache.set(u.id, labelBand(u, byId));

// Map each boundary value to its original lexical string so the axis and panel
// display the exact ICS precision (e.g. 251.902, 66.00, 0.0117).
const maLex = new Map<number, string>();
for (const u of units) {
  maLex.set(u.beginning, u.beginningStr);
  maLex.set(u.end, u.endStr);
}
const maStr = (v: number) => maLex.get(v) ?? formatMa(v);

// --- state ------------------------------------------------------------------
const FULL: ViewWindow = { young: 0, old: MAX_AGE };
let view: ViewWindow = { ...FULL };
let mode: ScaleMode = (localStorage.getItem("zz_mode") as ScaleMode) || "log";
let lang =
  localStorage.getItem("zz_lang") ||
  (navigator.language?.slice(0, 2) === "id" ? "id" : "en");
if (!meta.languages.some((l) => l.code === lang)) lang = "en";
let selectedId: string | null = null;

// --- dom --------------------------------------------------------------------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvas = $("#canvas");
const axis = $("#axis");
const panel = $("#panel");
const panelBody = $("#panel-body");
const scroller = $("#chart-scroll");
const searchInput = $<HTMLInputElement>("#search");
const searchResults = $("#search-results");
const langSelect = $<HTMLSelectElement>("#lang");
const resetBtn = $("#reset");

// --- helpers ----------------------------------------------------------------
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const nameOf = (u: Unit) => u.label[lang] || u.label.en || u.id;
const rankTitle = (u: Unit) => ui(lang).ranks[u.depth]?.title ?? u.rank;

function spanText(u: Unit): string {
  const t = ui(lang);
  const young = u.end === 0 ? t.present : maStr(u.end);
  return `${maStr(u.beginning)} – ${young} ${t.ma}`;
}

const isFull = () => view.young === FULL.young && view.old === FULL.old;

// --- chart render -----------------------------------------------------------
function render() {
  const html: string[] = [];
  for (const u of units) {
    const box = cellBox(u, view, mode);
    if (!box.visible) continue;
    const band = bandCache.get(u.id)!;
    const width = band.right - band.left;
    const rot = u.depth <= 4 ? " ts-rot" : "";
    const sel = u.id === selectedId ? " ts-selected" : "";
    const showLabel = box.height >= LABEL_MIN_PX;
    const name = esc(nameOf(u));
    html.push(
      `<button type="button" class="ts-cell${rot}${sel}" data-id="${u.id}" ` +
        `style="top:${box.top.toFixed(2)}px;height:${box.height.toFixed(2)}px;` +
        `left:${band.left}%;width:${width}%;--bg:${u.color};color:${u.textColor}" ` +
        `aria-label="${name}, ${esc(rankTitle(u))}, ${esc(spanText(u))}">` +
        (showLabel ? `<span class="ts-label">${name}</span>` : "") +
        `</button>`,
    );
  }
  canvas.style.height = `${CHART_HEIGHT}px`;
  axis.style.height = `${CHART_HEIGHT}px`;
  canvas.innerHTML = html.join("");
  renderAxis();
  $("#chart-loading")?.remove();
  resetBtn.classList.toggle("hidden", isFull());
}

function renderAxis() {
  const vals = new Set<number>();
  for (const u of units) {
    for (const v of [u.beginning, u.end]) {
      if (v >= view.young - 1e-9 && v <= view.old + 1e-9) vals.add(v);
    }
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const selUnit = selectedId ? byId.get(selectedId) : null;
  const keep = new Set<number>(selUnit ? [selUnit.beginning, selUnit.end] : []);
  const ticks: { v: number; y: number; strong: boolean }[] = [];
  let lastY = -Infinity;
  for (const v of sorted) {
    const y = yOf(v, view, mode);
    if (y < -2 || y > CHART_HEIGHT + 2) continue;
    const strong = keep.has(v);
    if (!strong && y - lastY < AXIS_MIN_GAP_PX) continue;
    lastY = y;
    ticks.push({ v, y, strong });
  }
  axis.innerHTML = ticks
    .map(
      (t) =>
        `<div class="ts-tick${t.strong ? " ts-tick-strong" : ""}" style="top:${t.y.toFixed(2)}px">` +
        `<span class="ts-tick-line"></span><span class="ts-tick-label">${maStr(t.v)}</span></div>`,
    )
    .join("");
}

// --- selection / zoom -------------------------------------------------------
function select(id: string, opts: { scroll?: boolean } = {}) {
  selectedId = id;
  render();
  openPanel(byId.get(id)!);
  history.replaceState(null, "", `#${id}`);
  if (opts.scroll) {
    const cell = canvas.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (cell) {
      const top = cell.offsetTop - scroller.clientHeight / 2 + cell.offsetHeight / 2;
      scroller.scrollTo({ top, behavior: "smooth" });
    }
  }
}

function zoomTo(u: Unit) {
  const pad = Math.max((u.beginning - u.end) * 0.06, 0.0005);
  view = { young: Math.max(0, u.end - pad), old: Math.min(MAX_AGE, u.beginning + pad) };
  selectedId = u.id;
  render();
  openPanel(u);
  scroller.scrollTo({ top: 0, behavior: "smooth" });
}

function resetView() {
  view = { ...FULL };
  render();
}

// --- info panel -------------------------------------------------------------
function chip(id: string): string {
  const u = byId.get(id);
  if (!u) return "";
  return `<button type="button" class="ts-chip" data-goto="${id}" style="--bg:${u.color}">${esc(nameOf(u))}</button>`;
}

function openPanel(u: Unit) {
  const t = ui(lang);
  const en = u.label.en;
  const localized = nameOf(u);
  const secondary = localized !== en ? `<span class="block text-sm font-normal text-stone-400 dark:text-stone-500">${esc(en)}</span>` : "";
  const beginErr = u.beginningError ? ` <span class="text-stone-400 dark:text-stone-500">±${u.beginningError}</span>` : "";
  const endErr = u.endError ? ` <span class="text-stone-400 dark:text-stone-500">±${u.endError}</span>` : "";
  const young = u.end === 0 ? t.present : `${maStr(u.end)}${endErr}`;
  const duration = u.beginning - u.end;
  const gssp = u.ratifiedGSSP
    ? `<span class="ts-badge ts-badge-ok">${t.panel.gssp} · ${t.panel.ratified}</span>`
    : `<span class="ts-badge ts-badge-wait">${t.panel.gssp} · ${t.panel.pending}</span>`;
  const code = u.notation ? `<span class="ts-badge ts-badge-code">${esc(u.notation)}</span>` : "";
  const kids = u.children.length
    ? `<div class="ts-field"><dt>${t.panel.subdivisions}</dt><dd class="flex flex-wrap gap-1.5">${u.children.map(chip).join("")}</dd></div>`
    : "";
  const parent = u.parent
    ? `<div class="ts-field"><dt>${t.panel.partOf}</dt><dd>${chip(u.parent)}</dd></div>`
    : "";

  panelBody.innerHTML = `
    <div class="mb-3 flex items-start justify-between gap-2">
      <h2 class="text-xl font-bold leading-tight text-stone-900 dark:text-stone-100">
        <span class="inline-block h-3 w-3 translate-y-px rounded-sm align-baseline" style="background:${u.color}"></span>
        ${esc(localized)} ${secondary}
      </h2>
      <button type="button" id="panel-close" class="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 lg:hidden dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="${t.panel.close}">
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 5 10 10M15 5 5 15" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-1.5">
      <span class="ts-badge ts-badge-rank">${esc(rankTitle(u))}</span>${code}${gssp}
    </div>
    <dl class="space-y-2.5 text-sm">
      <div class="ts-field"><dt>${t.panel.span}</dt><dd class="font-medium tabular-nums">${maStr(u.beginning)}${beginErr} – ${young} ${t.ma}</dd></div>
      <div class="ts-field"><dt>${t.panel.duration}</dt><dd class="tabular-nums">${formatMa(duration)} ${t.myr}</dd></div>
      ${parent}
      ${kids}
      <div class="ts-field"><dt>${t.panel.definition}</dt><dd class="text-stone-600 dark:text-stone-300">${esc(definitionFor(meta.definitionTemplates[lang] || meta.definitionTemplates.en, u.beginningStr, u.endStr))}</dd></div>
    </dl>
    <div class="mt-4 flex items-center gap-3 border-t border-stone-100 pt-3 dark:border-stone-800">
      <button type="button" id="panel-zoom" class="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">⤢ ${esc(t.zoom)}</button>
      <a href="${meta.source}" target="_blank" rel="noopener" class="text-sm text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">${t.panel.source} ↗</a>
    </div>`;
  panel.setAttribute("data-open", "true");

  $("#panel-close")?.addEventListener("click", closePanel);
  $("#panel-zoom")?.addEventListener("click", () => zoomTo(u));
}

function closePanel() {
  panel.setAttribute("data-open", "false");
}

// --- search -----------------------------------------------------------------
function runSearch(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) {
    searchResults.classList.add("hidden");
    return;
  }
  const matches = units
    .filter((u) => {
      const n = nameOf(u).toLowerCase();
      const e = u.label.en.toLowerCase();
      return n.includes(query) || e.includes(query);
    })
    .sort((a, b) => a.depth - b.depth || a.beginning - b.beginning)
    .slice(0, 12);
  if (!matches.length) {
    searchResults.innerHTML = `<li class="px-3 py-2 text-stone-400 dark:text-stone-500">${ui(lang).noResults}</li>`;
    searchResults.classList.remove("hidden");
    return;
  }
  searchResults.innerHTML = matches
    .map(
      (u) =>
        `<li><button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-700/60" data-goto="${u.id}">` +
        `<span class="h-3 w-3 shrink-0 rounded-sm" style="background:${u.color}"></span>` +
        `<span class="min-w-0 flex-1 truncate font-medium text-stone-700 dark:text-stone-200">${esc(nameOf(u))}</span>` +
        `<span class="shrink-0 text-xs text-stone-400 dark:text-stone-500">${esc(rankTitle(u))}</span></button></li>`,
    )
    .join("");
  searchResults.classList.remove("hidden");
}

// --- chrome / i18n ----------------------------------------------------------
function updateChrome() {
  const t = ui(lang);
  document.documentElement.lang = lang;
  for (const d of [0, 1, 2, 3, 5, 6]) {
    const host = document.querySelector(`[data-rank-header="${d}"]`);
    if (!host) continue;
    const r = t.ranks[d];
    host.innerHTML =
      `<span class="text-[11px] font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">${esc(r.title)}</span>` +
      (r.chrono ? `<span class="text-[9px] uppercase tracking-wide text-stone-400 dark:text-stone-500">${esc(r.chrono)}</span>` : "");
  }
  const setText = (sel: string, v: string) => {
    const n = document.querySelector(sel);
    if (n) n.textContent = v;
  };
  setText('[data-i18n="tagline"]', t.tagline);
  setText('[data-i18n="zoomHint"]', t.zoomHint);
  searchInput.placeholder = t.searchPlaceholder;
  resetBtn.textContent = t.reset;
  document.querySelectorAll<HTMLButtonElement>(".ts-scale").forEach((b) => {
    b.textContent = b.dataset.scale === "log" ? t.log : t.linear;
  });
  // refresh panel content if something is selected, else the prompt
  if (selectedId && byId.get(selectedId)) openPanel(byId.get(selectedId)!);
  else if (panelBody.querySelector("[data-i18n='prompt']") || !selectedId)
    panelBody.innerHTML = `<p class="py-10 text-center text-sm text-stone-400 dark:text-stone-500" data-i18n="prompt">${esc(t.panel.prompt)}</p>`;
}

function updateScaleButtons() {
  document.querySelectorAll<HTMLButtonElement>(".ts-scale").forEach((b) => {
    const active = b.dataset.scale === mode;
    // Active = white pill (reads well on both light and dark tracks); inactive
    // falls back to the muted token defined in .ts-scale.
    b.classList.toggle("bg-white", active);
    b.classList.toggle("text-teal-700", active);
    b.classList.toggle("shadow-sm", active);
  });
}

// --- tooltip ----------------------------------------------------------------
const tip = document.createElement("div");
tip.className = "ts-tooltip";
tip.style.display = "none";
document.body.appendChild(tip);

function moveTip(x: number, y: number) {
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > innerHeight - 8) top = y - r.height - pad;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// --- events -----------------------------------------------------------------
canvas.addEventListener("click", (e) => {
  const cell = (e.target as HTMLElement).closest(".ts-cell") as HTMLElement | null;
  if (cell?.dataset.id) select(cell.dataset.id);
});
canvas.addEventListener("dblclick", (e) => {
  const cell = (e.target as HTMLElement).closest(".ts-cell") as HTMLElement | null;
  const u = cell?.dataset.id ? byId.get(cell.dataset.id) : null;
  if (u) zoomTo(u);
});
canvas.addEventListener("mousemove", (e) => {
  const cell = (e.target as HTMLElement).closest(".ts-cell") as HTMLElement | null;
  const u = cell?.dataset.id ? byId.get(cell.dataset.id) : null;
  if (!u) {
    tip.style.display = "none";
    return;
  }
  tip.innerHTML = `<b>${esc(nameOf(u))}</b><span>${esc(rankTitle(u))} · ${esc(spanText(u))}</span>`;
  tip.style.display = "block";
  moveTip(e.clientX, e.clientY);
});
canvas.addEventListener("mouseleave", () => (tip.style.display = "none"));

// delegated "go to unit" for chips + search results
document.addEventListener("click", (e) => {
  const goto = (e.target as HTMLElement).closest("[data-goto]") as HTMLElement | null;
  if (goto?.dataset.goto) {
    const u = byId.get(goto.dataset.goto);
    if (u) {
      searchResults.classList.add("hidden");
      searchInput.value = "";
      select(u.id, { scroll: true });
    }
  }
});

document.querySelectorAll<HTMLButtonElement>(".ts-scale").forEach((b) =>
  b.addEventListener("click", () => {
    mode = (b.dataset.scale as ScaleMode) || "log";
    localStorage.setItem("zz_mode", mode);
    updateScaleButtons();
    render();
  }),
);

langSelect.addEventListener("change", () => {
  lang = langSelect.value;
  localStorage.setItem("zz_lang", lang);
  updateChrome();
  applyTheme(); // refresh the (localized) theme-button label
  render();
});

resetBtn.addEventListener("click", resetView);

searchInput.addEventListener("input", () => runSearch(searchInput.value));
searchInput.addEventListener("focus", () => runSearch(searchInput.value));
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest("#search, #search-results"))
    searchResults.classList.add("hidden");
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchResults.classList.add("hidden");
    closePanel();
  }
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

// --- theme (light / dark / follow system) -----------------------------------
type ThemePref = "system" | "light" | "dark";
const THEME_ICON: Record<ThemePref, string> = {
  system: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  light: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41"/></svg>`,
  dark: `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
};
const themeBtn = $("#theme");
const themeMql = matchMedia("(prefers-color-scheme: dark)");
let themePref = (localStorage.getItem("zz_theme") as ThemePref) || "system";

function applyTheme() {
  const resolved = themePref === "system" ? (themeMql.matches ? "dark" : "light") : themePref;
  document.documentElement.dataset.theme = resolved;
  const t = ui(lang);
  themeBtn.innerHTML = THEME_ICON[themePref];
  const label = `${t.theme}: ${t.themes[themePref]}`;
  themeBtn.title = label;
  themeBtn.setAttribute("aria-label", label);
}

themeBtn.addEventListener("click", () => {
  themePref = themePref === "system" ? "light" : themePref === "light" ? "dark" : "system";
  localStorage.setItem("zz_theme", themePref);
  applyTheme();
});
themeMql.addEventListener("change", () => {
  if (themePref === "system") applyTheme();
});

// --- init -------------------------------------------------------------------
langSelect.value = lang;
updateScaleButtons();
updateChrome();
applyTheme();
render();

// deep link: #UnitId
const hashId = decodeURIComponent(location.hash.slice(1));
if (hashId && byId.has(hashId)) {
  const u = byId.get(hashId)!;
  if (u.depth >= 3) zoomTo(u);
  else select(u.id, { scroll: true });
}
