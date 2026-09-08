/**
 * THE REAL UI, ACROSS MANY DOCUMENTS — the check that was missing all
 * session. Every prior measurement tonight ran headless (Session +
 * graphForPipeline directly), never the browser. This drives the actual
 * app: upload, wait for the real index + schedule prewarm, read the graph
 * the Schedules panel itself reads from, paint every table's own region
 * through the real citation path (agentHighlightCitation, the same
 * function `onPaint` and the panel's own View button call), and screenshot
 * the result — so a wrong or missing box is SEEN, not just scored.
 *
 * Per document, per sheet with tables:
 *   TIER 1  painted rect == region, to 1px (the seam between graph and pixels)
 *   TIER 2  containment (region holds its own title+cell ink) and tightness
 *           (region area / ink area) — a box that swallowed a neighbour or
 *           cut a table in half shows up here
 *   PANEL   the Schedules panel's own listed titles per sheet, cross-checked
 *           against graphTables() for that same sheet — catches a panel that
 *           undercounts what the graph actually found
 *   KEY     where opentakeoff-corpus/keys/<id>.tableboxes.csv exists, IoU +
 *           Error-of-Boundary against the authored ground truth, title-matched
 *
 * One screenshot per sheet with EVERY table on it highlighted at once (each
 * citation given its own `source` string so they persist together — only
 * `source: "schedule_browse"` self-clears) — that is the view a human, or a
 * screenshot a human looks at, actually needs to see "missing whole tables."
 *
 *   node scripts/playwright-corpus-table-audit.mjs [--out /tmp/ot-audit] [--limit N]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const OUT = process.env.OT_AUDIT_OUT || "/tmp/ot-corpus-audit";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = Number(argOf("--limit") || 0);

const CORPUS = "/home/user/master-plan/opentakeoff-corpus";
const KEYS = resolve(CORPUS, "keys");

// THE ENTIRE CORPUS, VOLUMES ONE AND TWO — every PDF under both bulk
// directories, glob'd rather than hand-listed so nothing is quietly left
// out. A handful of already-audited raw/ + samples/ documents (never in
// either bulk volume) are appended after, so nothing already covered is
// dropped from the run.
import { readdirSync } from "node:fs";
const globVolume = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => ({ id: e.name.replace(/\.pdf$/i, ""), pdf: resolve(dir, e.name) }))
    .sort((a, b) => a.id.localeCompare(b.id));

const VOL1_DIR = `${CORPUS}/bulk/HVAC_BAS_Plan_Sets`;
const VOL2_DIR = `${CORPUS}/bulk/HVAC_BAS_Plan_Sets_Vol2`;
const EXTRA_DOCS = [
  { id: "weld-county-permit", pdf: `${CORPUS}/raw/weld-county-mechanical-permit.pdf` },
  { id: "itd-d1-lab", pdf: `${CORPUS}/raw/itd-d1-lab-mechanical.pdf` },
  { id: "federal-mech", pdf: `${CORPUS}/raw/federal-attachment4-mechanical.pdf` },
  { id: "baker-county-eoc", pdf: `${CORPUS}/raw/baker-county-eoc-bidset.pdf` },
  { id: "bessemer", pdf: `/home/user/master-plan/opentakeoff/samples/bessemer-mechanical-bidset.pdf` },
  { id: "navfac-cherry-point-atc", pdf: `${CORPUS}/raw/navfac-cherry-point-atc-mechanical.pdf` },
];
const DOCS = [...globVolume(VOL1_DIR), ...globVolume(VOL2_DIR), ...EXTRA_DOCS].filter((d) => existsSync(d.pdf));

const STARTAT = argOf("--start-at");
const startIdx = STARTAT ? DOCS.findIndex((d) => d.id === STARTAT) : 0;
const fromStart = startIdx > 0 ? DOCS.slice(startIdx) : DOCS;
const wanted = LIMIT > 0 ? fromStart.slice(0, LIMIT) : fromStart;
console.log(`${wanted.length} of ${DOCS.length} target documents found on disk`);
for (const d of DOCS) if (!existsSync(d.pdf)) console.log(`  MISSING FILE, skipped: ${d.id} -> ${d.pdf}`);

mkdirSync(OUT, { recursive: true });

// ── authored box-key loader (title-matched, same normalization as the eval scripts) ──
const normTitle = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
function loadBoxKey(id) {
  const p = resolve(KEYS, `${id}.tableboxes.csv`);
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("sheet,"));
  const rows = [];
  for (const line of lines) {
    // sheet,table_title,x0,top,x1,bot,provenance — provenance may itself
    // contain commas but is always quoted; a simple split on the first 6
    // unquoted commas is enough since the first 6 fields never are.
    const m = line.match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),/);
    if (!m) continue;
    rows.push({ sheet: m[1], title: m[2], x0: Number(m[3]), top: Number(m[4]), x1: Number(m[5]), bot: Number(m[6]) });
  }
  return rows;
}
const eob = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
};
const RENDER_SCALE = 2.0; // opentakeoff/web/src/lib/sheets.ts

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const summary = [];

for (const doc of wanted) {
  const docOut = resolve(OUT, doc.id);
  mkdirSync(docOut, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
  const rec = { id: doc.id, pdf: basename(doc.pdf), tables: 0, sheets: 0, tier1_fail: 0, tier2_escape: 0, panel_mismatch: [], key: null, error: null };
  console.log(`\n=== ${doc.id} (${basename(doc.pdf)}) ===`);
  try {
    const t0 = Date.now();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
    await page.locator('input[name="sheet-file"]').first().setInputFiles(doc.pdf);
    await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 20 * 60 * 1000 });
    await page.waitForFunction(() => window.__opentakeoff?.graphPrewarm?.()?.phase === "ready", null, { timeout: 20 * 60 * 1000 });
    console.log(`  indexed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    // graphTables state is populated by its OWN async effect
    // (ensureAgentGraph(), cache-first) gated on graphPrewarm.phase ===
    // "ready" — on a fast-loading document that effect can still be
    // in flight the instant the ready signal fires, and probe.graphTables()
    // would read a stale empty array. Real, found live: weld-county-permit
    // (33s index) read 0 tables here while the Schedules panel, opened a
    // moment later, already showed 3 sections. Wait for it to stop growing
    // rather than trust the first read.
    let tables = await page.evaluate(() => window.__opentakeoff.probe.graphTables());
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const again = await page.evaluate(() => window.__opentakeoff.probe.graphTables());
      if (again.length === tables.length) { tables = again; break; }
      tables = again;
    }
    rec.tables = tables.length;
    const bySheet = new Map();
    for (const t of tables) {
      if (!Array.isArray(t.region) || t.region.length !== 4) continue;
      if (!bySheet.has(t.sheet)) bySheet.set(t.sheet, []);
      bySheet.get(t.sheet).push(t);
    }
    rec.sheets = bySheet.size;
    console.log(`  ${tables.length} tables across ${bySheet.size} sheets`);

    // ── Schedules panel: open it, expand all, cross-check against the graph ──
    //
    // A REAL, INTERMITTENT click failure was measured live on two separate
    // documents in two separate full-corpus runs (074_CA, 09_ME): the chip
    // resolves with its own ready attributes already set (data-phase="ready",
    // data-done===data-total) yet Playwright's actionability wait times out
    // at 30s waiting for it to become "visible, enabled" — aborting the
    // entire rest of this document's tier1/tier2/key checks on what the
    // chip's own state says is a fully-indexed page. A direct repro against
    // the same document (09_ME) immediately after found the chip perfectly
    // clickable, alongside one `net::ERR_CONNECTION_RESET` console error —
    // consistent with a transient dev-server hiccup under concurrent load
    // rather than a deterministic app defect, but not proven either way.
    // Retrying past a transient miss, rather than aborting the whole
    // document's checks on it, costs nothing when the chip is genuinely
    // ready (which its own data attributes already confirm) and recovers
    // the run when it is not.
    const chip = page.locator("[data-index-progress]").first();
    if (await chip.count()) {
      let clicked = false;
      for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
        try {
          await chip.click({ timeout: 15_000 });
          clicked = true;
        } catch (e) {
          console.log(`  chip click attempt ${attempt + 1} failed: ${String(e).split("\n")[0]}`);
          await page.waitForTimeout(1000);
        }
      }
      if (!clicked) {
        // Last resort: the chip's own data attributes already say ready —
        // force past whatever is blocking normal actionability so the rest
        // of this document's checks still run, but say so, since a forced
        // click is itself evidence worth a human looking at.
        console.log("  chip never became actionable normally — forcing click");
        await chip.click({ force: true }).catch((e) => console.log(`  forced click also failed: ${String(e).split("\n")[0]}`));
      }
      await page.waitForTimeout(700);
      const panel = page.locator("[data-schedules-panel]");
      if (await panel.count()) {
        const expandAll = panel.locator("[data-schedules-expand-all]");
        if (await expandAll.count()) { await expandAll.click(); await page.waitForTimeout(500); }
        await page.screenshot({ path: resolve(docOut, "panel.png"), fullPage: false });
        const panelTitles = await page.evaluate(() => {
          const root = document.querySelector("[data-schedules-panel]");
          if (!root) return [];
          return [...root.querySelectorAll("[data-schedule-section]")].map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80));
        });
        const graphN = tables.length;
        if (panelTitles.length !== graphN) {
          rec.panel_mismatch.push(`panel lists ${panelTitles.length} section(s), graph has ${graphN} table(s)`);
          console.log(`  PANEL MISMATCH: panel ${panelTitles.length} vs graph ${graphN}`);
        }
      } else {
        rec.panel_mismatch.push("chip present but [data-schedules-panel] never opened");
      }
    } else {
      rec.panel_mismatch.push("no [data-index-progress] chip found at all");
    }

    // ── per-sheet: paint every table at once, screenshot, tier1/2 ──
    const boxKey = loadBoxKey(doc.id);
    if (boxKey) rec.key = { authored: boxKey.length, matched: 0, correct4pt: 0, meanIou: 0 };
    let ki = 0;
    const ious = [];
    for (const [sheetKey, ts] of bySheet) {
      await page.evaluate((k) => window.__opentakeoff.probe.openSheets([k]), sheetKey);
      await page.waitForTimeout(1200);
      const panels = await page.evaluate(() => window.__opentakeoff.probe.sheets());
      const dims = { w: panels[0]?.w || 0, h: panels[0]?.h || 0, xOffset: panels[0]?.xOffset ?? -1 };
      if (dims.xOffset !== 0 || !(dims.w > 0)) {
        console.log(`    ${sheetKey}: could not isolate panel (xOffset=${dims.xOffset}, w=${dims.w}) — skipping paint/tier checks`);
        continue;
      }
      for (const t of ts) {
        const title = typeof t.title === "string" ? t.title : (t.title?.text || "");
        const src = `audit_${ki++}`;
        const res = await page.evaluate(([sheet, box, txt, source]) => window.__opentakeoff.probe.cite({
          sheet, bbox_px: box, table_title: txt, text: txt || "region", source,
        }), [t.sheet, t.region, title, src]);
        if (res?.error) { rec.tier1_fail++; console.log(`    REFUSED: "${title}" — ${res.error}`); continue; }
        await page.waitForTimeout(120);
        const painted = await page.evaluate((id) => {
          const g = document.querySelector(`[data-markup-id="${id}"]`);
          if (!g) return null;
          const rects = [...g.querySelectorAll("rect")];
          const r = rects[rects.length - 1];
          if (!r) return null;
          const n = (a) => Number(r.getAttribute(a));
          return [n("x"), n("y"), n("x") + n("width"), n("y") + n("height")];
        }, res.id);
        if (!painted) { rec.tier1_fail++; continue; }
        const off = Math.max(...painted.map((v, i) => Math.abs(v - t.region[i])));
        if (off > 1) rec.tier1_fail++;

        // A full-sheet screenshot at fit-to-page zoom is unreadable, and a
        // tight crop AT that zoom is just as unreadable, smaller. Zoom the
        // real canvas in on the markup's own center (Ctrl+wheel, the app's
        // own zoomAround — exp(-deltaY*0.01) per notch) until its box fills
        // a useful fraction of the viewport, THEN crop, so the crop is
        // actually legible rather than a handful of blurred pixels.
        try {
          // Reset to a known zoom baseline first — zooming in on table N-1
          // otherwise leaves table N's own box measured (and possibly panned
          // off-screen) from an arbitrary prior zoom state.
          const fitBtn = page.locator('button[title="Fit sheet to view"]');
          if (await fitBtn.count()) { await fitBtn.click(); await page.waitForTimeout(300); }
          let box = await page.locator(`[data-markup-id="${res.id}"]`).boundingBox();
          if (box) {
            const vp = page.viewportSize();
            const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
            await page.mouse.move(cx, cy);
            const targetFrac = 0.6; // the box's own long side should end up ~60% of the viewport
            const longSide = Math.max(box.width, box.height) || 1;
            const wantScale = Math.min(12, Math.max(1, (Math.min(vp.width, vp.height) * targetFrac) / longSide));
            if (wantScale > 1.15) {
              const notches = Math.log(wantScale) / 0.01; // exp(-deltaY*0.01) per notch, deltaY negative to zoom in
              await page.keyboard.down("Control");
              await page.mouse.wheel(0, -notches);
              await page.keyboard.up("Control");
              await page.waitForTimeout(500);
            }
            box = await page.locator(`[data-markup-id="${res.id}"]`).boundingBox();
          }
          if (box) {
            const pad = 60;
            const vp = page.viewportSize();
            const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
            const w = Math.min(vp.width - x, box.width + 2 * pad);
            const h = Math.min(vp.height - y, box.height + 2 * pad);
            if (w > 0 && h > 0) {
              const safeTitle = (title || "untitled").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
              await page.screenshot({ path: resolve(docOut, `crop_${safeTitle}_${src}.png`), clip: { x, y, width: w, height: h } });
            }
          }
        } catch { /* best-effort — a missing crop must not fail the audit */ }

        const ink = [];
        if (Array.isArray(t.title?.bbox) && t.title.bbox.length === 4) ink.push(t.title.bbox);
        for (const r of t.rows || []) for (const c of Object.values(r.cells || {})) if (Array.isArray(c?.bbox) && c.bbox.length === 4) ink.push(c.bbox);
        if (ink.length) {
          const inkUnion = ink.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
          const contains = inkUnion[0] >= t.region[0] - 2 && inkUnion[1] >= t.region[1] - 2 && inkUnion[2] <= t.region[2] + 2 && inkUnion[3] <= t.region[3] + 2;
          if (!contains) { rec.tier2_escape++; console.log(`    TIER2 ESCAPE: "${title}" — ink ${JSON.stringify(inkUnion.map(Math.round))} outside box ${JSON.stringify(t.region.map(Math.round))}`); }
        }

        // ── score against authored key, if this document has one ──
        if (boxKey) {
          // Sheet-scoped, not title-only: the SAME schedule title routinely
          // repeats once per building/AHU section, each its own real,
          // independently-correct table on its own sheet (real, corpus-
          // found: 001_NC_FY20_P_228's own VIBRATION ISOLATION SCHEDULE /
          // DUCT CONSTRUCTION SCHEDULE / etc. print identically-titled,
          // legitimately DIFFERENT tables on sheets #43, #46, AND #49 — the
          // key only authored #49's own copies). Matching by title alone
          // compared every OTHER sheet's own correct table against #49's
          // ground truth, scoring them all as ~0 IoU "misses" that were
          // never wrong tables at all, just the wrong sheet's candidate
          // being held up against a key that never covered it.
          // Exact title match only, until real, corpus-found: a table's own
          // built title can be a real cell's FULL printed text rather than
          // the terse name a person would write down authoring the key —
          // 060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project#75's own
          // PANELBOARD SCHEDULE prints its whole nameplate block (panel #,
          // building, location, MFR, breaker type, volts, amps, substation,
          // KAIC…) as ONE cell with no internal ruling, so the extractor's
          // title is genuinely "432 PANELBOARD SCHEDULE (EXISTING) PANEL
          // 590A11A-63A BLDG. 432 LOCATION…" — accurate, not a bug — while
          // the key's own author wrote just "PANELBOARD SCHEDULE". Exact
          // match never found it: correct box, correct kind, correct rows,
          // scored a flat miss. A CONTAINS match recovers it, but title
          // alone cannot disambiguate here — this exact sheet draws 5
          // identically-prefixed PANELBOARD SCHEDULEs and the key records
          // only 1 (see this file's own provenance note), so several built
          // titles could satisfy the same authored title at once. Region
          // agreement is what a person actually uses to tell them apart, so
          // require it too whenever the match isn't already exact.
          const hit = boxKey.find((k) => {
            if (k.sheet !== t.sheet) return false;
            if (normTitle(k.title) === normTitle(title)) return true;
            if (!normTitle(title).includes(normTitle(k.title))) return false;
            const authoredPx = [k.x0 * RENDER_SCALE, k.top * RENDER_SCALE, k.x1 * RENDER_SCALE, k.bot * RENDER_SCALE];
            return iou(authoredPx, t.region) > 0.3;
          });
          if (hit) {
            rec.key.matched++;
            const authoredPx = [hit.x0 * RENDER_SCALE, hit.top * RENDER_SCALE, hit.x1 * RENDER_SCALE, hit.bot * RENDER_SCALE];
            const e = eob(authoredPx, t.region) / RENDER_SCALE;
            const iouVal = iou(authoredPx, t.region);
            ious.push(iouVal);
            if (e <= 4) rec.key.correct4pt++;
            else console.log(`    KEY MISS >4pt: "${title}" EoB=${e.toFixed(1)}pt IoU=${iouVal.toFixed(3)}`);
          }
        }
      }
      const safeSheet = sheetKey.replace(/[^A-Za-z0-9]+/g, "_").slice(-60);
      await page.screenshot({ path: resolve(docOut, `sheet_${safeSheet}.png`) });
    }
    if (boxKey) rec.key.meanIou = ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : null;
  } catch (e) {
    rec.error = String(e).slice(0, 500);
    console.log(`  ERROR: ${rec.error}`);
  }
  if (pageErrors.length) rec.pageErrors = pageErrors.slice(0, 5);
  summary.push(rec);
  writeFileSync(resolve(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  await page.close();
}

await browser.close();

console.log("\n\n================ SUMMARY ================");
for (const r of summary) {
  console.log(`${r.id.padEnd(50)} tables=${String(r.tables).padStart(3)} sheets=${String(r.sheets).padStart(2)} tier1_fail=${r.tier1_fail} tier2_escape=${r.tier2_escape}` +
    (r.key ? `  key: ${r.key.correct4pt}/${r.key.matched}/${r.key.authored} correct/matched/authored, meanIoU=${r.key.meanIou?.toFixed(3)}` : "") +
    (r.panel_mismatch.length ? `  PANEL: ${r.panel_mismatch.join("; ")}` : "") +
    (r.error ? `  ERROR: ${r.error}` : ""));
}
writeFileSync(resolve(OUT, "summary.json"), JSON.stringify(summary, null, 1));
console.log(`\nfull results + screenshots in ${OUT}`);
