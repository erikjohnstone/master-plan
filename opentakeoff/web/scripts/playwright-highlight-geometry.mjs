/**
 * DOES THE PAINTED RECTANGLE LAND ON THE REGION IT WAS GIVEN?
 *
 * `mcp/scripts/table-box-eval.mjs` measures whether `ScheduleTable.region` is
 * the right box. That leaves one seam it cannot see: everything between the
 * graph and the pixels — `agentHighlightCitation`'s normalise by the sheet
 * dims, `agentAnnotate`'s storage, and the renderer's denormalise by `p.img.w`.
 * A padding or an offset introduced anywhere in there would make a correct
 * region paint wrong, and no number in the corpus gate would move.
 *
 * TIER 1 — IDENTITY. The painted rect must equal the region, to 1px.
 * TIER 2 — GROUNDING. Using only numbers already on the table:
 *   containment — every cell bbox and the title bbox must be INSIDE the box.
 *                 Fails today wherever the geometric extractor builds a region
 *                 from header spans and data tokens and never unions the title.
 *   tightness   — area(box) / area(union of title ∪ cells). A box that has
 *                 swallowed the notes block next door is enormous against the
 *                 ink it actually contains. The cap is NOT guessed: this driver
 *                 prints the distribution, and the cap is pinned from it.
 *   on-sheet    — a region running past the page edge is REFUSED outright by
 *                 agentHighlightCitation:8301, so it reaches the estimator as
 *                 "Could not show that" rather than as a visible error. Worth
 *                 recording as its own outcome rather than rediscovering.
 *
 * THE TRICK THAT MAKES THIS DETERMINISTIC: open exactly ONE sheet. Then
 * `p.xOffset` is 0, and since zoom is a CSS transform on the container that
 * never enters the SVG's own CTM (TakeoffCanvas.jsx ~:11385), the rect's
 * attributes ARE image px, 1:1. No getBoundingClientRect, no zoom, no scroll.
 *
 *   node scripts/playwright-highlight-geometry.mjs [--doc 05] [--max 12]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection/pdf";
const OUT = process.env.OT_HL_OUT || "/tmp/ot-highlight-geometry";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const doc = argOf("--doc") || "05";
const MAX = Number(argOf("--max") || 12);
// Pinned from this driver's own printed distribution — see the run recorded in
// the commit that set it. A schedule box is a drawn rectangle around ink, so it
// is legitimately bigger than the ink; it is not legitimately many times bigger.
const TIGHTNESS_CAP = Number(argOf("--tightness") || 0);   // 0 = report only

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
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 200)}`); fails.push("pageerror"); });

try {
  const pdf = findPdf();
  console.log(`doc ${doc}: ${pdf.split("/").pop()}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", { timeout: 15 * 60 * 1000 });
  await page.waitForFunction(() => window.__opentakeoff?.graphPrewarm?.()?.phase === "ready", { timeout: 15 * 60 * 1000 });
  console.log("indexed, schedules ready");

  const tables = await page.evaluate(() => window.__opentakeoff.probe.graphTables());
  check("the graph carries tables to measure", tables.length > 0, `${tables.length}`);

  // One sheet, so the SVG user space is this sheet's image px with no offset.
  const sheetKey = tables[0].sheet;
  await page.evaluate((k) => window.__opentakeoff.probe.openSheets([k]), sheetKey);
  await page.waitForTimeout(2500);
  const panels = await page.evaluate(() => window.__opentakeoff.probe.sheets());
  check("exactly one panel is open", panels.length === 1, JSON.stringify(panels.map((p) => p.key)));
  check("so the panel offset is zero", panels[0]?.xOffset === 0, String(panels[0]?.xOffset));
  const dims = { w: panels[0]?.w || 0, h: panels[0]?.h || 0 };
  check("and the panel has real dimensions", dims.w > 0 && dims.h > 0, JSON.stringify(dims));

  const onSheet = tables.filter((t) => t.sheet === sheetKey && Array.isArray(t.region) && t.region.length === 4).slice(0, MAX);
  check("that sheet has tables on it", onSheet.length > 0, `${onSheet.length} of ${tables.length}`);

  const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(v));
  const rows = [];

  for (const t of onSheet) {
    const title = typeof t.title === "string" ? t.title : (t.title?.text || "");
    const label = `${title || "(untitled)"} @ ${t.region.map((v) => Math.round(v)).join(",")}`;

    // ── the INK the table claims: its own cell boxes plus its title ──────────
    const ink = [];
    if (isBox(t.title?.bbox)) ink.push(t.title.bbox);
    for (const r of t.rows || []) for (const c of Object.values(r.cells || {})) if (isBox(c?.bbox)) ink.push(c.bbox);
    const inkUnion = ink.length
      ? ink.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
      : null;

    // ── on-sheet: the guard that turns a bad region into a refusal ───────────
    const fits = t.region[0] >= 0 && t.region[1] >= 0 && t.region[2] <= dims.w && t.region[3] <= dims.h;

    const res = await page.evaluate(([sheet, box, txt]) => window.__opentakeoff.probe.cite({
      sheet, bbox_px: box, table_title: txt, text: txt || "region", source: "schedule_browse",
    }), [t.sheet, t.region, title]);

    if (res?.error) {
      rows.push({ label, painted: null, refused: res.error, fits, ink: ink.length, region: t.region, contains: null, tightness: null, inkUnion: null });
      continue;
    }
    await page.waitForTimeout(250);
    const painted = await page.evaluate((id) => {
      const g = document.querySelector(`[data-markup-id="${id}"]`);
      if (!g) return null;
      // The FIRST rect is the halo, padded by (5*w)/z. The last is the box.
      const rects = [...g.querySelectorAll("rect")];
      const r = rects[rects.length - 1];
      if (!r) return null;
      const n = (a) => Number(r.getAttribute(a));
      return [n("x"), n("y"), n("x") + n("width"), n("y") + n("height")];
    }, res.id);

    rows.push({
      label, painted, refused: null, fits, ink: ink.length,
      region: t.region,
      tightness: inkUnion && painted
        ? ((t.region[2] - t.region[0]) * (t.region[3] - t.region[1]))
          / Math.max(1, (inkUnion[2] - inkUnion[0]) * (inkUnion[3] - inkUnion[1]))
        : null,
      contains: inkUnion
        ? inkUnion[0] >= t.region[0] - 2 && inkUnion[1] >= t.region[1] - 2
          && inkUnion[2] <= t.region[2] + 2 && inkUnion[3] <= t.region[3] + 2
        : null,
      inkUnion,
    });
  }

  // ── TIER 1 ────────────────────────────────────────────────────────────────
  const paintable = rows.filter((r) => r.painted);
  check("every on-sheet region painted something", paintable.length === rows.filter((r) => r.fits).length,
    `${paintable.length} painted, ${rows.filter((r) => r.fits).length} fit the sheet`);
  const offBy = paintable.map((r) => Math.max(...r.painted.map((v, i) => Math.abs(v - r.region[i]))));
  const worstOff = offBy.length ? Math.max(...offBy) : 0;
  check("TIER 1: the painted rect IS the region, to 1px", worstOff <= 1, `worst edge error ${worstOff.toFixed(3)}px`);
  if (worstOff > 1) {
    for (const r of paintable) {
      const d = Math.max(...r.painted.map((v, i) => Math.abs(v - r.region[i])));
      if (d > 1) console.log(`      ${r.label}\n        painted ${JSON.stringify(r.painted.map((v) => Math.round(v * 10) / 10))}\n        region  ${JSON.stringify(r.region)}`);
    }
  }

  // ── TIER 2 ────────────────────────────────────────────────────────────────
  const refused = rows.filter((r) => r.refused);
  if (refused.length) {
    console.log(`\n  ${refused.length} region(s) were REFUSED as off-sheet — the estimator sees "Could not show that", not a wrong box:`);
    for (const r of refused) console.log(`      ${r.label} — ${r.refused}`);
  }

  const withInk = rows.filter((r) => r.contains !== null && r.inkUnion);
  const escaping = withInk.filter((r) => !r.contains);
  check("TIER 2 containment: the box holds its own title and cells", escaping.length === 0,
    `${escaping.length} of ${withInk.length} escape`);
  for (const r of escaping.slice(0, 8)) {
    console.log(`      ${r.label}\n        ink   ${JSON.stringify(r.inkUnion.map((v) => Math.round(v)))}\n        box   ${JSON.stringify(r.region)}`);
  }

  const tight = rows.filter((r) => r.tightness != null).sort((a, b) => b.tightness - a.tightness);
  if (tight.length) {
    console.log("\n  TIER 2 tightness — box area / ink area (the distribution the cap is pinned from):");
    for (const r of tight) console.log(`      ${r.tightness.toFixed(2)}x  ${r.label}`);
    const med = tight[Math.floor(tight.length / 2)].tightness;
    console.log(`      median ${med.toFixed(2)}x   worst ${tight[0].tightness.toFixed(2)}x`);
    if (TIGHTNESS_CAP > 0) {
      const fat = tight.filter((r) => r.tightness > TIGHTNESS_CAP);
      check(`TIER 2 tightness: no box exceeds ${TIGHTNESS_CAP}x its own ink`, fat.length === 0,
        fat.map((r) => `${r.tightness.toFixed(2)}x ${r.label}`).join(" | "));
    }
  }

  writeFileSync(resolve(OUT, "geometry.json"), JSON.stringify(rows, null, 1));
  await page.screenshot({ path: resolve(OUT, "painted.png"), fullPage: false });
  console.log(`\nartifacts in ${OUT}`);
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} check(s) failed: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
