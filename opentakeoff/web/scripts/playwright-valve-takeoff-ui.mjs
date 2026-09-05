/**
 * UI proof: complete control-valve takeoff via the same compile path the Agent
 * tool uses (window.__opentakeoff.compileCorpusTakeoff).
 *
 * Asserts contractor-grade panel output:
 *   - 163 lines (64 CHW + 99 HHW)
 *   - Served equipment / Service / Cv columns (no dual CHW CV + HHW CV)
 *   - Clickable Tag cites (data-takeoff-cite)
 *   - No markdown ** wrappers on tags
 *
 * Usage: OT_UI_URL=http://127.0.0.1:5173/ node scripts/playwright-valve-takeoff-ui.mjs
 */
import { chromium } from "playwright";
import {
  mkdirSync, existsSync, copyFileSync, writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corpus = resolve(root, "../opentakeoff-corpus");
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");
const artifacts = "/opt/cursor/artifacts";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";

if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);
mkdirSync(artifacts, { recursive: true });
mkdirSync("/tmp/ot-pw-videos", { recursive: true });

const EXPECT_LINES = 163;
const EXPECT_CHW = 64;
const EXPECT_HHW = 99;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: "/tmp/ot-pw-videos", size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(180_000);

const fail = async (msg) => {
  const shot = `${artifacts}/valve_takeoff_ui_FAIL.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`${msg} (shot ${shot})`);
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  console.log("upload blueprint PDF");
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);

  // Wait for canvas / sheets to appear
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.compileCorpusTakeoff === "function",
    null,
    { timeout: 180_000 },
  ).catch(() => fail("window.__opentakeoff.compileCorpusTakeoff never appeared"));
  await page.waitForTimeout(2500);

  // Deterministic compile — same tool path Agent uses for corpus_valves
  const compiled = await page.evaluate(async () => {
    const out = await window.__opentakeoff.compileCorpusTakeoff("control_valves", { download: false });
    return out;
  });

  if (compiled?.error) await fail(`compile error: ${compiled.error}`);
  if (compiled?.kind !== "control_valves") await fail(`kind=${compiled?.kind}`);
  if (compiled?.totals?.items !== EXPECT_LINES) {
    await fail(`totals.items=${compiled?.totals?.items} want ${EXPECT_LINES}`);
  }
  const counts = compiled?.category_counts || {};
  if (counts.CHW_CONTROL_VALVE !== EXPECT_CHW || counts.HHW_CONTROL_VALVE !== EXPECT_HHW) {
    await fail(`category_counts=${JSON.stringify(counts)}`);
  }

  await page.evaluate(() => window.__opentakeoff.openTakeoff?.());
  await page.waitForTimeout(800);

  const stats = page.locator("[data-takeoff-stats]");
  if (!(await stats.count())) await fail("Takeoff panel stats missing");
  const linesAttr = await stats.getAttribute("data-lines");
  const eaAttr = await stats.getAttribute("data-ea");
  if (Number(linesAttr) !== EXPECT_LINES) await fail(`panel lines=${linesAttr}`);
  if (eaAttr && Number(eaAttr) !== EXPECT_LINES) await fail(`panel EA=${eaAttr}`);

  const bodyText = await page.locator('[role="dialog"]').innerText();
  if (/\*\*[A-Z0-9-]{3,}\*\*/.test(bodyText)) await fail("markdown **tags** still visible in panel");
  if (/\bCHW\s*CV\b/i.test(bodyText) && /\bHHW\s*CV\b/i.test(bodyText)) {
    await fail("dual CHW CV + HHW CV columns present");
  }
  if (!/Served equipment|UNIT MARK/i.test(bodyText)) await fail("missing Served equipment column");
  if (!/\bCv\b|\bCV\b/.test(bodyText)) await fail("missing Cv column");
  // Service may appear as lead Type (CHW/HHW) or a Service column — both OK.
  if (!/\bService\b|\bTYPE\b[\s\S]{0,80}\bCHW\b|\bHHW\b/i.test(bodyText)) {
    await fail("missing Service / CHW|HHW type");
  }
  const citeCount = await page.locator("[data-takeoff-cite]").count();
  if (citeCount < 10) await fail(`too few cites: ${citeCount}`);
  console.log("cites", citeCount);
  await page.locator("[data-takeoff-cite]").first().click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${artifacts}/valve_takeoff_ui_panel.png`, fullPage: true });
  writeFileSync(`${artifacts}/valve_takeoff_ui_result.json`, JSON.stringify({
    ok: true,
    compiled: {
      kind: compiled.kind,
      takeoff_id: compiled.takeoff_id,
      totals: compiled.totals,
      category_counts: compiled.category_counts,
    },
    panel: { lines: Number(linesAttr), ea: eaAttr ? Number(eaAttr) : null },
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    lines: Number(linesAttr),
    chw: counts.CHW_CONTROL_VALVE,
    hhw: counts.HHW_CONTROL_VALVE,
  }));
} finally {
  const vid = page.video();
  await context.close();
  await browser.close();
  if (vid) {
    const vpath = await vid.path();
    const dest = `${artifacts}/valve_takeoff_ui_proof.webm`;
    try { copyFileSync(vpath, dest); console.log("video", dest); } catch {}
  }
}
