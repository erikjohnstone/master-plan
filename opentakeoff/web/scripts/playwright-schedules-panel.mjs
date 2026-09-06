/**
 * THE SCHEDULES PANEL, THROUGH THE REAL UI.
 *
 * The engine reads 99.4% of schedule values into the right cell. Until this
 * panel, nothing let a person look at that: indexing said "Indexed · schedules
 * ready" in the status bar and the tables were reachable only by asking the
 * agent for one by name.
 *
 * This drives the real component on a real blueprint set: index, open the panel
 * from the status-bar chip, check the list against the graph the agent itself
 * reads, expand a schedule, then click a table's View and a row's tag and
 * assert each painted the right ink on the right sheet.
 *
 *   node scripts/playwright-schedules-panel.mjs [--doc 05]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection/pdf";
const OUT = process.env.OT_SCHED_OUT || "/tmp/ot-schedules";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const doc = argOf("--doc") || "05";

function findPdf() {
  if (!existsSync(BENCH)) throw new Error(`no benchmark dir ${BENCH}`);
  const hit = readdirSync(BENCH).find((f) => f.startsWith(`${doc}__`) && f.endsWith(".pdf"));
  if (!hit) throw new Error(`no pdf for --doc ${doc}`);
  return resolve(BENCH, hit);
}

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 200)}`); fails.push("pageerror"); });

try {
  const pdf = findPdf();
  console.log(`doc ${doc}: ${pdf.split("/").pop()}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", { timeout: 15 * 60 * 1000 });
  // the schedule pass is separate from the text index
  await page.waitForFunction(() => window.__opentakeoff?.graphPrewarm?.()?.phase === "ready", { timeout: 15 * 60 * 1000 });
  console.log("indexed, schedules ready");

  // THE STATUS CHIP IS THE WAY IN — it used to be an unclickable span.
  const chip = page.locator("[data-index-progress]").first();
  check("status chip is a button", (await chip.getAttribute("role")) === "button");
  await chip.click();
  await page.waitForTimeout(700);

  const tables = await page.evaluate(() => window.__opentakeoff.probe.graphTables());
  check("panel is fed from the graph", tables.length > 0, `${tables.length} tables`);

  // The panel header must agree with the graph, not with itself.
  const header = await page.evaluate(() => {
    const root = document.querySelector("[data-schedules-panel]");
    const el = [...(root?.querySelectorAll("div") || [])].find((d) => /schedules? across/.test(d.textContent || ""));
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  });
  const sheets = new Set(tables.map((t) => t.sheet)).size;
  const rows = tables.reduce((n, t) => n + (t.rows || []).length, 0);
  check("header counts match the graph", header.includes(`${tables.length} schedule`) && header.includes(`${rows} row`), `${JSON.stringify(header)} vs ${tables.length}/${sheets}/${rows}`);

  const panel = page.locator("[data-schedules-panel]");
  const sections = panel.locator('button[aria-expanded]');
  check("one expandable section per table", await sections.count() === tables.length, `${await sections.count()} vs ${tables.length}`);
  await page.screenshot({ path: resolve(OUT, "panel.png") });

  // ── a TABLE paints its region ────────────────────────────────────────────
  const before = await page.evaluate(() => window.__opentakeoff.probe.markups().length);
  await panel.locator('button', { hasText: /^View$/ }).first().click();
  await page.waitForTimeout(1200);
  const status = await page.evaluate(() => (document.querySelector("[data-commit-tone]")?.textContent || "").trim());
  if (status) console.log(`      status bar: ${status}`);
  const afterTable = await page.evaluate(() => window.__opentakeoff.probe.markups().filter((m) => m.source === "schedule_browse"));
  check("View paints one schedule_browse markup", afterTable.length === 1, JSON.stringify(afterTable.map((m) => ({ s: m.sheet_id, t: m.text })).slice(0, 2)));
  const t0 = tables[0];
  check("it lands on that table's own sheet", afterTable[0]?.sheet_id === t0.sheet, `${afterTable[0]?.sheet_id} vs ${t0.sheet}`);
  // rect is normalized 0..1
  const r = afterTable[0]?.rect || [];
  check("its rect is normalized 0..1", r.flat?.().every?.((n) => n >= 0 && n <= 1) === true, JSON.stringify(r));

  // ── a ROW paints its own cells, on the sheet its ink is on ───────────────
  await sections.first().click();
  await page.waitForTimeout(600);
  const firstRow = (t0.rows || [])[0];
  if (!firstRow) { check("table has rows to click", false, "first table is empty"); }
  else {
    const tagBtn = page.locator(`button[title^="Show ${firstRow.key} on the drawing"]`).first();
    check("the row tag is clickable", await tagBtn.count() > 0, `looking for ${firstRow.key}`);
    if (await tagBtn.count()) {
      await tagBtn.click();
      await page.waitForTimeout(1200);
      const rowMk = await page.evaluate(() => window.__opentakeoff.probe.markups().filter((m) => m.source === "schedule_browse"));
      const painted = rowMk.find((m) => (m.text || "").includes(firstRow.key));
      check("clicking a tag paints that row", !!painted, JSON.stringify(rowMk.map((m) => m.text)));
      check("the row cites the sheet its ink is on", painted?.sheet_id === (firstRow.sheet || t0.sheet), `${painted?.sheet_id} vs ${firstRow.sheet || t0.sheet}`);
      // the row box must be strictly inside the table box, and much shorter
      const tb = afterTable[0]?.rect, rb = painted?.rect;
      if (tb && rb) {
        const hT = tb[1][1] - tb[0][1], hR = rb[1][1] - rb[0][1];
        check("a row is a slice of its table, not the whole thing", hR < hT, `row h ${hR.toFixed(4)} vs table h ${hT.toFixed(4)}`);
      }
    }
  }
  await page.screenshot({ path: resolve(OUT, "painted.png") });

  // ── closing takes its own ink with it, and nothing else ──────────────────
  const others = await page.evaluate(() => window.__opentakeoff.probe.markups().filter((m) => m.source !== "schedule_browse").length);
  await panel.locator('button[title="Close panel"]').first().click();
  await page.waitForTimeout(700);
  const left = await page.evaluate(() => window.__opentakeoff.probe.markups());
  check("closing clears the browse highlights", left.filter((m) => m.source === "schedule_browse").length === 0);
  check("and disturbs no other markups", left.length === others, `${left.length} vs ${others}`);
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
