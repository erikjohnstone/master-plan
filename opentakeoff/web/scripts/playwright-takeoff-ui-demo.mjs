/**
 * Playwright UI demos — live compile via shared Session+ODL path (not injected JSON).
 * Primary agent runs this — no computerUse subagent.
 *
 * Loads the plan, calls window.__opentakeoff.compileCorpusTakeoff (hits
 * /__ot/compile-corpus-takeoff → Session + ODL), waits for rollup, records video.
 *
 * Usage:
 *   node scripts/playwright-takeoff-ui-demo.mjs hvac|bas|both
 */
import { chromium } from "playwright";
import { mkdirSync, copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corpus = resolve(root, "../opentakeoff-corpus");
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");
const artifacts = "/opt/cursor/artifacts";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const apiKey = (process.env.CEREBRAS_API_KEY || (existsSync("/tmp/cerebras_ui_key.txt")
  ? readFileSync("/tmp/cerebras_ui_key.txt", "utf8")
  : "")).trim();

mkdirSync(artifacts, { recursive: true });
mkdirSync("/tmp/ot-pw-videos", { recursive: true });

const JOBS = {
  hvac: {
    kind: "hvac_equipment",
    label: "hvac",
    title: "HVAC equipment takeoff",
    goal: "Compile a complete HVAC equipment quantity takeoff of this set (compile_corpus_takeoff kind=hvac_equipment).",
    expectItems: 396,
  },
  bas: {
    kind: "bas_points",
    label: "bas",
    title: "BAS points takeoff",
    goal: "Compile a complete BAS / DDC points takeoff of this set (compile_corpus_takeoff kind=bas_points).",
    expectRows: 122,
  },
};

const kindArg = (process.argv[2] || "both").toLowerCase();
const jobs = kindArg === "both" ? [JOBS.hvac, JOBS.bas]
  : kindArg === "bas" ? [JOBS.bas]
    : [JOBS.hvac];

if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);

async function runOne(job) {
  const videoDir = `/tmp/ot-pw-videos/${job.label}-${Date.now()}`;
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ["--use-gl=angle", "--window-size=1440,900"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  await page.addInitScript(({ endpoint, apiKey, model }) => {
    localStorage.setItem("opentakeoff_ai_endpoint", endpoint);
    localStorage.setItem("opentakeoff_ai_key", apiKey);
    localStorage.setItem("opentakeoff_ai_model", model);
    localStorage.setItem("opentakeoff_ai_provider", "openai");
  }, {
    endpoint: "https://api.cerebras.ai/v1",
    apiKey: apiKey || "demo-key",
    model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(600);

  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.compileCorpusTakeoff === "function"
      && typeof window.__opentakeoff?.openAgent === "function",
    { timeout: 180000 },
  );
  // Let the first sheet paint so the canvas is visibly a takeoff UI.
  await page.waitForTimeout(3000);

  // Re-check after paint (indexing may re-render); never call a stale hook.
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.openAgent === "function",
    { timeout: 60000 },
  );
  await page.evaluate(() => window.__opentakeoff.openAgent());
  await page.waitForTimeout(400);

  const goalBox = page.locator('textarea[name="agent-goal"]');
  if (await goalBox.count()) {
    await goalBox.fill(job.goal);
    await page.waitForTimeout(400);
  }

  // LIVE compile through shared Session+ODL path (same as MCP) — no injected JSON.
  const compileResult = await page.evaluate(async (kind) => {
    return await window.__opentakeoff.compileCorpusTakeoff(kind, { download: false });
  }, job.kind);

  if (compileResult?.error) {
    throw new Error(`UI compile failed: ${compileResult.error}`);
  }

  const rollup = page.locator('[aria-label="Compiled takeoff rollup"]');
  await rollup.waitFor({ state: "visible", timeout: 120000 });
  await rollup.scrollIntoViewIfNeeded();

  const shown = await page.evaluate(() => window.__opentakeoff.lastCorpusTakeoff());
  if (job.expectItems != null && shown?.totals?.items !== job.expectItems) {
    throw new Error(`HVAC rollup items ${shown?.totals?.items} != expected ${job.expectItems} (compile=${JSON.stringify(compileResult?.totals)})`);
  }
  if (job.expectRows != null && shown?.totals?.rows !== job.expectRows) {
    throw new Error(`BAS rollup rows ${shown?.totals?.rows} != expected ${job.expectRows} (compile=${JSON.stringify(compileResult?.totals)})`);
  }

  await page.waitForTimeout(4000);

  const outName = `takeoff_ui_${job.label}_live_compile_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await context.close();
  await browser.close();

  const vids = readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
  if (!vids.length) throw new Error(`No video for ${job.label}`);
  const dest = resolve(artifacts, `${outName}.webm`);
  copyFileSync(resolve(videoDir, vids[0]), dest);
  console.log(JSON.stringify({
    label: job.label,
    kind: job.kind,
    video: dest,
    takeoff_id: shown.takeoff_id,
    totals: shown.totals,
    compile: {
      takeoff_id: compileResult.takeoff_id,
      totals: compileResult.totals,
    },
    path: "live Session+ODL via /__ot/compile-corpus-takeoff",
  }, null, 2));
  return dest;
}

const paths = [];
for (const job of jobs) {
  console.log(`\n=== Playwright UI live compile: ${job.title} ===`);
  paths.push(await runOne(job));
}
console.log("\nDONE", paths);
