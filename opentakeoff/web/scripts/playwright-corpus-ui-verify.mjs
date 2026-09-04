/**
 * General-purpose real UI-path verification: load any real corpus PDF into
 * the actual running app (vite dev server, no LLM/agent needed), drive the
 * SAME deterministic tool path the Agent uses (window.__opentakeoff.*), and
 * report what the user-facing workflow actually shows — not just what the
 * backend unit tests say. Prints sheet-graph table titles/rows plus, for
 * each requested takeoff kind, the compiled totals and whether the takeoff
 * panel actually rendered (data-takeoff-stats). Also surfaces any console
 * errors, page errors, and failed network requests seen along the way (a
 * failed request to fonts.googleapis.com is expected/benign in a sandboxed
 * environment with no general internet egress — everything else is worth
 * a look). No video/screenshots kept — this is meant for quick, repeatable
 * spot-checks against real documents, not a recorded demo.
 *
 * Usage: node scripts/playwright-corpus-ui-verify.mjs <baseUrl> <pdfPath> [kind1,kind2,...] [--full]
 * Example: node scripts/playwright-corpus-ui-verify.mjs http://localhost:5173/ \
 *   ../../opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2/006_....pdf control_valves,hvac_equipment
 *
 * --full includes each table's real header row (not just its row count) —
 * opt-in since it makes the output much larger; use it when a real
 * cell-level check needs to see actual column labels (e.g. confirming a
 * parent/header-tier fix didn't corrupt a column name like "MBH").
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:5173/";
const pdfPath = process.argv[3];
const rest = process.argv.slice(4);
const full = rest.includes("--full");
const kinds = (rest.find((a) => a !== "--full") || "").split(",").filter(Boolean);
if (!pdfPath) {
  throw new Error("usage: node scripts/playwright-corpus-ui-verify.mjs <baseUrl> <pdfPath> [kinds] [--full]");
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(180_000);

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("requestfailed", (req) => {
  failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText });
});

const result = { pdf: pdfPath, ok: true, steps: [] };

const log = (...a) => console.error(new Date().toISOString(), ...a);

try {
  // Warm-up: vite's dep pre-bundling can trigger a full page reload on the
  // very first real navigation ("optimized dependencies changed. reloading")
  // — if that happens mid-upload it strands the wait forever. Settle it here.
  log("goto start");
  // NOT "networkidle": vite's dev server keeps its own HMR WebSocket open
  // permanently, so the page never truly goes network-idle and this would
  // hang forever. "domcontentloaded" (what the repo's own known-working
  // Playwright scripts already use) is correct here.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  log("goto done");
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  log("reload done");
  await page.waitForTimeout(1000);

  log("setInputFiles start");
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdfPath);
  log("setInputFiles done");
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.compileCorpusTakeoff === "function",
    null,
    { timeout: 180_000 },
  );
  log("__opentakeoff appeared");
  // Let text index + prewarm settle.
  await page.waitForTimeout(3000);
  const graphReady = await page.waitForFunction(
    () => window.__opentakeoff?.indexProgress?.()?.phase === "ready",
    null,
    { timeout: 180_000 },
  ).then(() => true).catch(() => false);
  log("indexProgress ready?", graphReady);
  result.steps.push({ step: "load", graphReady });

  log("debugGraph start");
  const dbg = await page.evaluate(async (fullOpt) => {
    try {
      return await window.__opentakeoff.debugGraph({ full: fullOpt });
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  }, full);
  log("debugGraph done", dbg?.table_count, dbg?.error);
  result.debugGraph = dbg;

  for (const kind of kinds) {
    const compiled = await page.evaluate(async (k) => {
      try {
        return await window.__opentakeoff.compileCorpusTakeoff(k, { download: false });
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    }, kind);
    result.steps.push({ step: `compile:${kind}`, compiled: {
      error: compiled?.error,
      kind: compiled?.kind,
      totals: compiled?.totals,
      category_counts: compiled?.category_counts,
      sheet_count: compiled?.sheet_count,
    } });
    if (compiled?.error) continue;
    // Open the takeoff panel and check it actually rendered without throwing.
    await page.evaluate(() => window.__opentakeoff.openTakeoff?.());
    await page.waitForTimeout(800);
    const stats = page.locator("[data-takeoff-stats]");
    const hasStats = await stats.count();
    const linesAttr = hasStats ? await stats.getAttribute("data-lines") : null;
    result.steps.push({ step: `panel:${kind}`, hasStats: !!hasStats, lines: linesAttr });
    // Close dialog if present, before next kind.
    const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
} catch (e) {
  result.ok = false;
  result.error = String(e?.message || e);
} finally {
  result.consoleErrors = consoleErrors.slice(0, 20);
  result.pageErrors = pageErrors.slice(0, 20);
  result.failedRequests = failedRequests.slice(0, 20);
  await context.close();
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
