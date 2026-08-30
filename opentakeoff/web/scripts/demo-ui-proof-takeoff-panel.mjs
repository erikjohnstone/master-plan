// UI proof: Takeoff panel compiles seeded rows into line items + exports.
// Does not require an LLM key — seeds via window.__otSeedAgentTakeoff.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const headed = process.argv.includes("--headed");
const baseUrl = process.env.OPENTAKEOFF_UI_URL || "http://127.0.0.1:5173";
const outDir = resolve("/opt/cursor/artifacts");
mkdirSync(outDir, { recursive: true });

const sampleRows = [
  {
    id: "demo-1", created_at: Date.now(), run_id: "proof",
    workflow: "VAV schedule + plan join",
    tag: "VAV-1", field: "CFM", value: 2170, unit: "CFM",
    sheet_id: "mech.pdf#6", table_title: "AIR TERMINAL BOX SCHEDULE",
    column: "CFM", bbox_px: [100, 200, 140, 220], source_tool: "query_table", note: null,
  },
  {
    id: "demo-1b", created_at: Date.now(), run_id: "proof",
    workflow: "VAV schedule + plan join",
    tag: "VAV-1", field: "MANUFACTURER", value: "TRANE / VCEF", unit: null,
    sheet_id: "mech.pdf#6", table_title: "AIR TERMINAL BOX SCHEDULE",
    column: "MANUFACTURER", bbox_px: null, source_tool: "query_table", note: null,
  },
  {
    id: "demo-2", created_at: Date.now(), run_id: "proof",
    workflow: "VAV schedule + plan join",
    tag: "VAV-1", field: "installed_quantity", value: 1, unit: "EA",
    sheet_id: "mech.pdf#2", table_title: "AIR TERMINAL BOX SCHEDULE",
    column: null, bbox_px: [50, 60, 80, 90], source_tool: "sweep_schedule_row", note: null,
  },
  {
    id: "demo-3", created_at: Date.now(), run_id: "proof",
    workflow: "Fan schedule honesty",
    tag: "EF-2", field: "plan_status", value: "refused", unit: null,
    sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE",
    column: "MARK", bbox_px: null, source_tool: "sweep_schedule_row", note: "tag not on plan",
  },
  {
    id: "demo-3b", created_at: Date.now(), run_id: "proof",
    workflow: "Fan schedule honesty",
    tag: "EF-2", field: "CFM", value: 400, unit: "CFM",
    sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE",
    column: "CFM", bbox_px: [10, 20, 30, 40], source_tool: "query_table", note: null,
  },
];

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
  recordVideo: { dir: resolve(outDir, "takeoff-panel-video-tmp"), size: { width: 1400, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const downloads = [];
page.on("download", async (dl) => {
  const name = dl.suggestedFilename();
  const dest = resolve(outDir, `takeoff-export-${name}`);
  await dl.saveAs(dest);
  downloads.push({ name, dest });
  console.log(`[download] ${name} → ${dest}`);
});

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const takeoffBtn = page.getByRole("button", { name: /^Takeoff/i });
if (!(await takeoffBtn.count()) || !(await takeoffBtn.first().isVisible().catch(() => false))) {
  const start = page.getByRole("button", { name: /new|start|open|local/i }).first();
  if (await start.count()) await start.click().catch(() => {});
  await page.waitForTimeout(1000);
}

await page.waitForFunction(() => typeof window.__otSeedAgentTakeoff === "function", null, { timeout: 45_000 });
await page.evaluate((rows) => window.__otSeedAgentTakeoff(rows, { open: true }), sampleRows);

await page.waitForSelector('[aria-label="Takeoff"]', { timeout: 10_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(outDir, "takeoff-panel-compiled.png"), fullPage: true });

const dialog = page.locator('[aria-label="Takeoff"]');
const descCount = await dialog.locator("th", { hasText: "Description" }).count();
if (!descCount) throw new Error("Compiled Takeoff tab missing Description column");
const qtyCell = await dialog.locator("text=TRANE").count();
if (!qtyCell) throw new Error("Expected compiled VAV-1 description TRANE / VCEF");

await dialog.getByRole("button", { name: /^CSV$/i }).click();
await page.waitForTimeout(500);
await dialog.getByRole("button", { name: /^Excel$/i }).click();
await page.waitForTimeout(800);
await dialog.getByRole("button", { name: /^PDF$/i }).click();
await page.waitForTimeout(800);

await dialog.getByRole("button", { name: /^Workflow data$/i }).click();
await page.waitForTimeout(500);
const fieldCol = await dialog.locator("th", { hasText: "Field" }).count();
if (!fieldCol) throw new Error("Workflow data tab missing Field column");
await page.screenshot({ path: resolve(outDir, "takeoff-panel-workflow-tab.png"), fullPage: true });

await dialog.getByRole("button", { name: /^Takeoff$/i }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(outDir, "takeoff-panel-after-exports.png"), fullPage: true });

await context.close();
await browser.close();

import { readdirSync, copyFileSync, statSync } from "node:fs";
const videoDir = resolve(outDir, "takeoff-panel-video-tmp");
const videos = readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
let videoPath = null;
if (videos.length) {
  videoPath = resolve(outDir, "takeoff-compiled-tabs-demo.webm");
  copyFileSync(resolve(videoDir, videos[0]), videoPath);
}

writeFileSync(resolve(outDir, "takeoff-panel-proof.json"), JSON.stringify({
  downloads,
  rowCount: sampleRows.length,
  video: videoPath,
  at: new Date().toISOString(),
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  downloads,
  video: videoPath,
  videoBytes: videoPath ? statSync(videoPath).size : 0,
}, null, 2));

if (downloads.length < 3) {
  console.error(`Expected 3 downloads (csv/xlsx/pdf), got ${downloads.length}`);
  process.exit(1);
}
