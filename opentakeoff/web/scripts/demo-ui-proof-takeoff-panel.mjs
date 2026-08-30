// UI proof: Takeoff panel aggregates seeded workflow rows and exports CSV/Excel/PDF.
// Does not require an LLM key — seeds structured rows via window.__otSeedAgentTakeoff.
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
];

const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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
// Local / blank project lands on gallery or canvas — open Takeoff from topbar once canvas chrome is up.
await page.waitForTimeout(1500);

// Prefer an existing local project / canvas. If still on home, click through to a blank takeoff.
const takeoffBtn = page.getByRole("button", { name: /^Takeoff/i });
if (!(await takeoffBtn.count()) || !(await takeoffBtn.first().isVisible().catch(() => false))) {
  // Try common entry points.
  const start = page.getByRole("button", { name: /new|start|open|local/i }).first();
  if (await start.count()) await start.click().catch(() => {});
  await page.waitForTimeout(1000);
}

await page.waitForFunction(() => typeof window.__otSeedAgentTakeoff === "function", null, { timeout: 45_000 });
await page.evaluate((rows) => window.__otSeedAgentTakeoff(rows, { open: true }), sampleRows);

await page.waitForSelector('[aria-label="Takeoff data"]', { timeout: 10_000 });
await page.screenshot({ path: resolve(outDir, "takeoff-panel-seeded.png"), fullPage: true });

const dialog = page.locator('[aria-label="Takeoff data"]');
await dialog.getByRole("button", { name: /^CSV$/i }).click();
await page.waitForTimeout(500);
await dialog.getByRole("button", { name: /^Excel$/i }).click();
await page.waitForTimeout(800);
await dialog.getByRole("button", { name: /^PDF$/i }).click();
await page.waitForTimeout(800);

await page.screenshot({ path: resolve(outDir, "takeoff-panel-after-exports.png"), fullPage: true });

writeFileSync(resolve(outDir, "takeoff-panel-proof.json"), JSON.stringify({
  downloads,
  rowCount: sampleRows.length,
  at: new Date().toISOString(),
}, null, 2));

console.log(JSON.stringify({ ok: true, downloads }, null, 2));
await browser.close();

if (downloads.length < 3) {
  console.error(`Expected 3 downloads (csv/xlsx/pdf), got ${downloads.length}`);
  process.exit(1);
}
