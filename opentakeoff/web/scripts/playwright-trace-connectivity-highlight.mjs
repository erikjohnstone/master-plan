/**
 * UI proof: trace_connectivity's own painted path — a bright neon-blue line
 * drawn directly on the sheet, via the real agent tool
 * (window.__opentakeoff.probe.traceConnectivity), not a second
 * implementation. Uses a real, already-verified corpus case
 * (itd-d1-lab-mechanical.pdf#4, EQ.19's own seed -> EF-1, from
 * opentakeoff-corpus/keys/itd-d1-lab.serves.csv).
 *
 * Usage: OT_UI_URL=http://127.0.0.1:5173/ node scripts/playwright-trace-connectivity-highlight.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corpus = resolve(root, "../opentakeoff-corpus");
const pdf = resolve(corpus, "raw/itd-d1-lab-mechanical.pdf");
const artifacts = "/opt/cursor/artifacts";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";

if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);
mkdirSync(artifacts, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(180_000);

const fail = async (msg) => {
  const shot = `${artifacts}/trace_highlight_FAIL.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`${msg} (shot ${shot})`);
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  console.log("upload blueprint PDF");
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);

  await page.waitForFunction(
    () => typeof window.__opentakeoff?.probe?.traceConnectivity === "function",
    null,
    { timeout: 180_000 },
  ).catch(() => fail("window.__opentakeoff.probe.traceConnectivity never appeared"));
  await page.waitForTimeout(2500);

  console.log("open page 4");
  await page.evaluate(() => window.__opentakeoff.probe.openSheets(["itd-d1-lab-mechanical.pdf#4"]));
  await page.waitForFunction(
    () => (window.__opentakeoff.probe.segCount("itd-d1-lab-mechanical.pdf#4") || 0) > 0,
    null,
    { timeout: 60_000 },
  ).catch(() => {});
  const segCount = await page.evaluate(() => window.__opentakeoff.probe.segCount("itd-d1-lab-mechanical.pdf#4"));
  console.log("segCount", segCount);

  const sheets = await page.evaluate(() => window.__opentakeoff.probe.sheets());
  console.log("sheets", JSON.stringify(sheets));
  const sheet = sheets.find((s) => /itd-d1-lab-mechanical\.pdf#4$/.test(s.key)) || sheets[0];
  if (!sheet) await fail("no sheet open");
  console.log("using sheet", sheet.key, sheet.w, sheet.h);

  // Real, already-verified case (itd-d1-lab.serves.csv, EQ.19's own seed row):
  // seed [2173,347] image px -> EF-1 at [2698,520] image px, normalized here.
  const from = [2173 / sheet.w, 347 / sheet.h];
  const equipment = [{ id: "EF-1", at: [2698 / sheet.w, 520 / sheet.h] }];

  const result = await page.evaluate(
    async ({ key, from, equipment }) => window.__opentakeoff.probe.traceConnectivity(key, { from, equipment }),
    { key: sheet.key, from, equipment },
  );
  console.log("trace result", JSON.stringify({ status: result.status, confidence: result.confidence, reached_equipment: result.reached_equipment, factors: result.factors, pathLen: result.path?.length }));
  if (result.status !== "reached") await fail(`expected reached, got ${result.status}: ${result.reason || ""}`);
  if (result.reached_equipment?.id !== "EF-1") await fail(`expected EF-1, got ${JSON.stringify(result.reached_equipment)}`);

  await page.waitForTimeout(800);
  const markups = await page.evaluate(() => window.__opentakeoff.probe.markups());
  const traceMarkup = markups.find((m) => m.source === "trace_connectivity");
  if (!traceMarkup) await fail("no trace_connectivity markup painted");
  console.log("trace markup", JSON.stringify({ type: traceMarkup.type, color: traceMarkup.color, opacity: traceMarkup.opacity, w: traceMarkup.w, pts: traceMarkup.pts?.length }));
  if (traceMarkup.color !== "#00e5ff") await fail(`expected neon blue #00e5ff, got ${traceMarkup.color}`);
  if (!(traceMarkup.pts?.length >= 2)) await fail("trace markup has no path points");

  await page.screenshot({ path: `${artifacts}/trace_highlight_full.png`, fullPage: true });

  // Zoom in on the traced region so the neon line is actually legible, not a
  // thin sliver at 21% fit-to-window zoom. The markup overlay SVG's own
  // viewBox is exactly the stage size in image px, so its on-screen
  // bounding rect gives an exact stage-px -> screen-px mapping regardless
  // of the app's own current pan/zoom transform — no need to reverse-
  // engineer that transform by hand.
  const midAt = result.path[Math.floor(result.path.length * 0.65)]; // near the equipment end, still on the line
  const screenPt = await page.evaluate((normPt) => {
    const svgs = [...document.querySelectorAll("svg")];
    const svg = svgs.find((s) => s.getAttribute("width") > 1000 && s.style.position === "absolute");
    if (!svg) return null;
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const stageX = normPt[0] * Number(svg.getAttribute("width"));
    const stageY = normPt[1] * Number(svg.getAttribute("height"));
    return {
      x: rect.left + ((stageX - vb.x) / vb.width) * rect.width,
      y: rect.top + ((stageY - vb.y) / vb.height) * rect.height,
    };
  }, midAt);
  if (!screenPt) await fail("could not locate markup overlay SVG");
  console.log("zooming at screen point", JSON.stringify(screenPt));
  await page.mouse.move(screenPt.x, screenPt.y);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${artifacts}/trace_highlight_zoom.png` });

  writeFileSync(`${artifacts}/trace_highlight_result.json`, JSON.stringify({
    ok: true, sheet: sheet.key, result: { status: result.status, reached_equipment: result.reached_equipment },
    markup: { type: traceMarkup.type, color: traceMarkup.color, opacity: traceMarkup.opacity, w: traceMarkup.w, pointCount: traceMarkup.pts.length },
  }, null, 2));

  console.log(JSON.stringify({ ok: true, status: result.status, markupColor: traceMarkup.color }));
} finally {
  await context.close();
  await browser.close();
}
