/**
 * Real browser/PDF.js verification for the bundled DINO symbol verifier.
 *
 * SHOULD THIS BE ON THE SHARED PATH? No. This is a browser-evidence test;
 * schedule truth, tags, counts, and citations remain in the shared path.
 * It loads the Carson controller-module corpus case, whose review bboxes are
 * independently frozen in the symbol-sweep ground truth, and calls the exact
 * canvas adapter that the Agent tool delegates to. A result is review ranking
 * only, never an installed-quantity assertion.
 *
 * Usage:
 *   OT_UI_URL=http://127.0.0.1:5179 node scripts/playwright-symbol-metric-browser.mjs /absolute/corpus/root [/tmp/output]
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const corpus = process.argv[2];
const out = process.argv[3] || "/tmp/opentakeoff-symbol-metric-browser";
if (!corpus) throw new Error("usage: playwright-symbol-metric-browser.mjs <corpus-root> [output-dir]");
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const rawCases = JSON.parse(readFileSync(resolve(corpus, "ground_truth/symbol_sweep/cases.json"), "utf8"));
const cases = Array.isArray(rawCases) ? rawCases : rawCases.cases;
if (!Array.isArray(cases)) throw new Error("symbol-sweep ground truth did not contain a cases array");
const fixture = cases.find((item) => item.id === "43-carson-m601-vlc853e-controller-modules");
if (!fixture) throw new Error("frozen controller-module fixture is missing");
const pdf = resolve(corpus, fixture.source_pdf);
if (!existsSync(pdf)) throw new Error(`fixture PDF missing: ${pdf}`);
mkdirSync(out, { recursive: true });

const rectFromCenter = (at) => {
  const [left, top] = fixture.seed_rect[0];
  const [right, bottom] = fixture.seed_rect[1];
  const [seedX, seedY] = fixture.seed.at;
  return [left + at[0] - seedX, top + at[1] - seedY, right + at[0] - seedX, bottom + at[1] - seedY];
};
const request = {
  reference: { id: "reference", sheet: "", bbox_px: [...fixture.seed_rect[0], ...fixture.seed_rect[1]] },
  candidates: fixture.instances.map((item) => ({ id: item.id, sheet: "", bbox_px: rectFromCenter(item.at) })),
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.OT_BROWSER_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });
  const sheet = await page.evaluate((pageNumber) => {
    const open = window.__opentakeoff.probe.sheets()[0]?.key || "";
    const file = open.includes("#") ? open.slice(0, open.lastIndexOf("#")) : open;
    const key = `${file}#${pageNumber}`;
    window.__opentakeoff.probe.openSheets([key]);
    return key;
  }, fixture.page);
  console.error(`requested ${sheet}`);
  const rendered = await page.waitForFunction(
    (key) => window.__opentakeoff.probe.sheets().some((item) => item.key === key && item.w > 0),
    sheet,
    { timeout: 120_000 },
  ).then(() => true).catch(() => false);
  if (!rendered) {
    const sheets = await page.evaluate(() => window.__opentakeoff.probe.sheets());
    throw new Error(`requested sheet ${sheet} did not render; live sheets: ${JSON.stringify(sheets)}`);
  }
  request.reference.sheet = sheet;
  request.candidates.forEach((candidate) => { candidate.sheet = sheet; });
  const result = await page.evaluate((visualRequest) => window.__opentakeoff.probe.visualSymbolReview(visualRequest), request);
  assert.equal(result.decision, "ranked_review");
  assert.equal(result.model, "dinov2_symbol_metric_v1");
  assert.equal(result.candidates.length, fixture.instances.length);
  assert.ok(result.candidates.every((candidate) => candidate.decision === "ranked_review"));
  assert.ok(result.candidates.every((candidate) => Number.isFinite(candidate.cosine_similarity)));
  assert.ok(["wasm", "webgpu"].includes(result.execution_provider));
  await page.screenshot({ path: resolve(out, "controller-module-source.png") });
  writeFileSync(resolve(out, "result.json"), JSON.stringify({
    fixture: fixture.id,
    input_kind: "independently frozen physical-body bboxes",
    result,
    page_errors: errors,
  }, null, 2));
  console.log(JSON.stringify({ fixture: fixture.id, candidates: result.candidates.length, provider: result.execution_provider, top: result.candidates.slice(0, 5), page_errors: errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
