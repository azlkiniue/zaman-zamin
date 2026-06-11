// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Deployment notes:
// - GitHub Pages *project* site (https://user.github.io/<repo>/): set BASE_PATH=/<repo>/
//   and SITE_URL=https://user.github.io. The included GitHub Action does this for you.
// - GitHub Pages *user/org* site or Cloudflare Pages: leave BASE_PATH as "/".
// `||` (not `??`) so an empty-string CI value falls back to the default.
const base = process.env.BASE_PATH || "/";
const site = process.env.SITE_URL || "https://example.org";

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  vite: {
    plugins: [tailwindcss()],
  },
});
