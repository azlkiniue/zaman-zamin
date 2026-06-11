# zamān zamīn · زمان زمین

**An interactive geological time scale** — a fast, static rendering of the
[ICS International Chronostratigraphic Chart](https://stratigraphy.org/chart/).
The name means roughly *"earth time"* (Persian/Arabic
*zamān* = time, *zamīn* = earth/land).

The layout follows the classic interactive chart at
[stratigraphy.org/timescale](https://stratigraphy.org/timescale/) — columns for
**Supereon → Eon → Era → Period → Epoch → Age**, youngest at the top, oldest at
the bottom — but the data is the up-to-date set published at
[stratigraphy.org/chart](https://stratigraphy.org/chart/).

## Features

- **All 179 units** of the chart with official **CGMW colours** and exact
  boundary ages (with uncertainties) preserved from the source RDF.
- **Logarithmic** (default) or **linear** time axis — log keeps the
  detail-dense Phanerozoic legible while still showing all 4.567 Ga.
- **Click** any interval for a detail panel (rank, code, age span, duration,
  GSSP status, parent/subdivisions, definition); **double-click** to zoom in.
- **Search** (`/` to focus) and **deep links** (`#Jurassic` opens & zooms).
- **26 languages** from the source data, with a fully localized UI in
  **English** and **Bahasa Indonesia**.
- Numeric age axis with collision-aware labels, hover tooltips, keyboard
  focusable cells, and a responsive layout (side panel → bottom sheet on mobile).
- **Light / dark theme** that follows the system preference by default, with a
  toggle to force either (no flash on load).

## Tech stack

- [Astro](https://astro.build/) (static output) + [Tailwind CSS v4](https://tailwindcss.com/)
- [Bun](https://bun.sh/) as the runtime & package manager — **no Node.js required**
- Data parsed from RDF/Turtle at build time with [N3.js](https://github.com/rdfjs/N3.js)
- The interactive chart is a single dependency-free TypeScript module

## Develop

```sh
bun install
bun run dev      # http://localhost:4321
```

## Build

```sh
bun run build    # regenerates data, then builds to ./dist (static HTML/CSS/JS)
bun run preview  # serve the production build locally
```

`bun run build` runs `scripts/parse-chart.ts` first (the `prebuild` hook). That
script **downloads the latest `chart.ttl`** from the ICS repo, caches it locally,
and converts it into [`src/data/timescale.json`](./src/data/timescale.json) — so
every build (including CI) picks up the freshest chart automatically. If the
download fails it falls back to the cached `chart.ttl`, then to the committed JSON,
so builds never break offline.

## Updating the chart data

Nothing to do — the data is fetched on every build. To refresh it on its own
(e.g. during development) run:

```sh
bun run data            # download chart.ttl + regenerate src/data/timescale.json
```

Point it at a different branch or mirror with the `CHART_TTL_URL` env var:

```sh
CHART_TTL_URL=https://example.org/chart.ttl bun run data
```

## Deploy

The site is fully static — host the `dist/` folder anywhere.

### GitHub Pages

A workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) is
included. In the repository, go to **Settings → Pages → Build and deployment →
Source: GitHub Actions**, then push to `main`. The workflow auto-detects the
correct base path (works for both `user.github.io` and project repos).

### Cloudflare Pages

Create a Pages project from the repo with:

- **Build command:** `bun run build`
- **Build output directory:** `dist`
- (no base path needed — leave it at `/`)

To build for a sub-path manually, set the `BASE_PATH` env var, e.g.
`BASE_PATH=/zaman-zamin/ bun run build`.

## Data & licence

Chart data © [International Commission on Stratigraphy](https://stratigraphy.org/),
from [i-c-stratigraphy/chart](https://github.com/i-c-stratigraphy/chart),
licensed **[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.

> Cohen, K.M., Harper, D., Gibbard, P. & Car, N. (2025). The ICS International
> Chronostratigraphic Chart this decade. *Episodes* 48: 105–115. Modified 2024-12.
