/**
 * EVIDENCE, INLINE IN THE ANSWER.
 *
 * The agent already cites properly — sheet, bbox, row key, column, value — and
 * all of it rendered into a "Sources · N" drawer that is collapsed by default
 * and sits below the whole thread. The answer itself said "VAV-1 is 350 CFM"
 * as unadorned prose.
 *
 * This drives the real panel: seed an answer plus real citations, then check
 * that the mark in the prose became a clickable control, that a bare value did
 * NOT, that an uncited mark did NOT, and that clicking one actually flies to
 * the ink on the drawing.
 *
 *   node scripts/playwright-inline-cites.mjs [--doc 05]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection/pdf";
const OUT = process.env.OT_CITE_OUT || "/tmp/ot-cites";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const doc = (args.indexOf("--doc") >= 0 ? args[args.indexOf("--doc") + 1] : null) || "05";

function findPdf() {
  if (process.env.OT_UI_PDF) return resolve(process.env.OT_UI_PDF);
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
const browser = await chromium.launch({ headless: true, executablePath: process.env.OT_BROWSER_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 200)}`); fails.push("pageerror"); });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(findPdf());
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });
  await page.waitForFunction(() => window.__opentakeoff?.graphPrewarm?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });

  // Build citations from a REAL table, so the bbox is real ink on a real sheet.
  const seeded = await page.evaluate(() => {
    // A table whose row keys are real equipment MARKS. Half the schedules on a
    // set are keyed by prose ("PRIMARY STRUCTURAL FRAME"), and the matcher
    // rightly refuses to link those — so the fixture has to be one where a
    // link is the correct outcome.
    const MARK = /^[A-Z][A-Z0-9]{0,7}-[A-Z0-9]*\d[A-Z0-9]*$/;
    const tables = window.__opentakeoff.probe.graphTables();
    const marky = (x) => (x.rows || []).filter((r) => MARK.test(String(r.key || "").trim())).length;
    const t = tables.filter((x) => marky(x) >= 2).sort((a, b) => marky(b) - marky(a))[0];
    if (!t) return null;
    const cells = (row) => Object.values(row.cells || {}).filter((c) => Array.isArray(c.bbox));
    const marks = t.rows.filter((r) => MARK.test(String(r.key || "").trim()));
    const r0 = marks[0], r1 = marks[1];
    const c0 = cells(r0)[0], c1 = cells(r1)[0];
    if (!c0 || !c1) return null;
    const title = typeof t.title === "string" ? t.title : (t.title?.text || "");
    return { sheet: t.sheet, title, k0: r0.key, k1: r1.key, b0: c0.bbox, b1: c1.bbox, v0: c0.text };
  });
  if (!seeded) throw new Error("no suitable table on this set");
  console.log(`seed: ${seeded.title} — ${seeded.k0}, ${seeded.k1}`);

  // Paint two real citations through the production path, then seed an answer
  // that mentions one cited mark, one UNCITED mark, and a bare number.
  const cites = await page.evaluate(async (s) => {
    const out = [];
    for (const [key, bbox] of [[s.k0, s.b0], [s.k1, s.b1]]) {
      const r = await window.__opentakeoff.probe.cite({ sheet: s.sheet, bbox_px: bbox, row_key: key, column: "CFM", value: "350", table_title: s.title });
      if (r && !r.error) out.push(r);
    }
    return out;
  }, seeded);
  check("two real citations painted", cites.length === 2, JSON.stringify(cites.map((c) => c.row_key)));

  await page.evaluate((s) => {
    window.__opentakeoff.probe.seedAnswer(
      `${s.k0} is scheduled for 350 CFM. ZZZ-99 is not in evidence. The total is 350 across the floor.`,
    );
  }, seeded);
  await page.waitForTimeout(900);

  const answer = page.locator('[data-agent-answer="structured"]').last();
  const linked = await answer.locator("button").allTextContents();
  console.log(`   linked: ${JSON.stringify(linked)}`);
  check("the cited mark became a control", linked.includes(seeded.k0), `looking for ${seeded.k0}`);
  check("an UNCITED mark stayed prose", !linked.includes("ZZZ-99"));
  check("a bare value stayed prose", !linked.includes("350"));
  const text = (await answer.textContent()) || "";
  check("the sentence still reads correctly", text.includes(`${seeded.k0} is scheduled for 350 CFM.`), JSON.stringify(text.slice(0, 90)));

  await page.screenshot({ path: resolve(OUT, "answer.png") });

  // ── clicking a chip flies to the ink ──────────────────────────────────────
  const beforeSheet = await page.evaluate(() => window.__opentakeoff.probe.sheets().map((s) => s.key));
  await answer.locator("button", { hasText: seeded.k0 }).first().click();
  await page.waitForTimeout(1500);
  const openNow = await page.evaluate(() => window.__opentakeoff.probe.sheets().map((s) => s.key));
  check("clicking it opens/keeps the cited sheet", openNow.includes(seeded.sheet), `${JSON.stringify(openNow)} vs ${seeded.sheet}`);
  await page.screenshot({ path: resolve(OUT, "flown.png") });

  // ── the drawer no longer repeats one cell ─────────────────────────────────
  const label = await page.locator("span", { hasText: /^Sources · \d+ · click to open$/ }).first().textContent();
  check("Sources counts deduped evidence", /Sources · 2 /.test(label || ""), JSON.stringify(label));
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
