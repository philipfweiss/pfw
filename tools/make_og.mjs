// Regenerate web/public/og.png — the social card: the portrait caught
// mid-stroke (face painted, the world still graphite) on the site's paper,
// with the name set in EB Garamond beside it.
//
// Usage:  node tools/make_og.mjs [previewUrl]
//   1. cd web && npm run build && npx astro preview --port 4322
//   2. node tools/make_og.mjs
//   3. rebuild so dist/ picks up the new og.png
//
// Playwright is not a dependency of this repo (it would bloat the Pages
// build); the script borrows a sibling install. Override with PLAYWRIGHT_DIR.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PW =
  process.env.PLAYWRIGHT_DIR ?? "/Users/philipweiss/novel/typhon/site/web/node_modules/playwright/index.mjs";
const url = process.argv[2] ?? "http://localhost:4322/";
const { chromium } = await import(PW);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "web", "public", "og.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url);
await page.waitForTimeout(21000); // mid-wash: the face has color, the scene is still pencil

const data = await page.evaluate(async () => {
  await document.fonts.ready;
  const src = document.getElementById("painting");
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const x = c.getContext("2d");
  // the split page: warm sheet on the left, paper on the right
  x.fillStyle = "#fcfbf8";
  x.fillRect(0, 0, 1200, 630);
  x.fillStyle = "#fbf6ea";
  x.fillRect(0, 0, 600, 630);
  x.fillStyle = "#edebe4";
  x.fillRect(600, 0, 1, 630);
  x.drawImage(src, 40, 55, 520, 520);
  x.fillStyle = "#1d1b18";
  x.font = '500 84px "EB Garamond Variable", Georgia, serif';
  x.fillText("Philip Weiss", 660, 305);
  x.fillStyle = "#5b564e";
  x.font = 'italic 400 34px "EB Garamond Variable", Georgia, serif';
  x.fillText("philipweiss.net", 663, 360);
  return c.toDataURL("image/png");
});

writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
await browser.close();
console.log("wrote", out);
