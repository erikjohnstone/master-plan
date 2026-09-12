#!/usr/bin/env node
/**
 * SYMBOL SWEEP, THROUGH THE REAL BROWSER UI — THE WHOLE CORPUS.
 *
 * mcp/scripts/symbol-sweep-corpus.mjs proves the engine is right by calling
 * Session directly — no browser, no dev server, no React state. That is a
 * real, valuable gate, but it is NOT proof the actual product a user clicks
 * through gets the same answer: docs/SYMBOL-SWEEP-AFFINE-GOAL.md's own
 * parity test says outright "the parity test proves structural sharing, not
 * a live canvas-vs-MCP run" and names the lack of a browser as the reason
 * that run was never done. This script closes that gap: it drives the SAME
 * frozen ground truth through window.__opentakeoff.probe.sweepRect — the
 * real runSymbolSweep the manual Symbol tool calls when an estimator drags a
 * marquee on the canvas — for every one of the 47 cases, and scores the
 * result with the SAME bipartite one-to-one matcher the MCP corpus script
 * uses (ported verbatim below, not reimplemented from memory).
 *
 *   npm run dev   (in one terminal, from web/)
 *   node scripts/symbol-sweep-corpus-ui.mjs [case-id ...]   (in another)
 *
 * Screenshots of every case's review panel land in $OT_SWEEP_UI_OUT
 * (default /tmp/ot-sweep-ui) as visual proof, one per case; a full
 * PASS/FAIL summary and results.json land there too.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection";
const GT = resolve(BENCH, "ground_truth/symbol_sweep/cases.json");
const OUT = process.env.OT_SWEEP_UI_OUT || "/tmp/ot-sweep-ui";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";

const manifest = JSON.parse(readFileSync(GT, "utf8"));
if (manifest.schema !== "opentakeoff.symbol_sweep_ground_truth.v1") {
  throw new Error(`Unsupported symbol ground-truth schema: ${manifest.schema}`);
}
const selected = new Set(process.argv.slice(2));
const cases = selected.size ? manifest.cases.filter((c) => selected.has(c.id)) : manifest.cases;
for (const id of selected) if (!cases.some((c) => c.id === id)) throw new Error(`Unknown symbol-sweep case: ${id}`);

mkdirSync(OUT, { recursive: true });

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Each PDF upload spawns a SERVER-SIDE production-graph-cli.mjs subprocess
 * (sheet-graph/schedule-table construction) that keeps running to completion
 * independent of this script's own page/context lifecycle — closing the
 * browser context does NOT stop it. Left unthrottled, a full 47-case
 * sequential run piles these up (each 700MB-3.3GB RAM) and starves the box,
 * corrupting timing-sensitive extraction on later cases (measured directly
 * this session: 5 orphaned processes from rapid re-testing caused a false
 * PASS on one case and a false failure-shape on two others). Wait for the
 * count to drop before starting each new case, rather than fixing a count
 * that's merely a snapshot of one moment. */
async function waitForGraphProcsToDrain(maxCount = 1, maxWaitMs = 120_000) {
  const started = Date.now();
  for (;;) {
    let n = 0;
    try {
      n = parseInt(execSync('pgrep -f production-graph-cli.mjs 2>/dev/null | wc -l').toString().trim(), 10) || 0;
    } catch { n = 0; }
    if (n <= maxCount || Date.now() - started > maxWaitMs) return n;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** Ported verbatim from mcp/scripts/symbol-sweep-corpus.mjs — the SAME exact
 * bipartite feasibility check (augmenting-path, nearest-first), so a case
 * that passes here passes under the identical rule the MCP gate uses. */
function assignInstances(expected, predicted) {
  const choices = expected.map((e) => predicted
    .map((p, i) => ({ i, d: dist(e.at, p.at) }))
    .filter((x) => x.d <= e.tolerance_px)
    .sort((a, b) => a.d - b.d || a.i - b.i));
  const owner = new Array(predicted.length).fill(-1);
  const visit = (ei, seen) => {
    for (const { i } of choices[ei]) {
      if (seen.has(i)) continue;
      seen.add(i);
      if (owner[i] < 0 || visit(owner[i], seen)) { owner[i] = ei; return true; }
    }
    return false;
  };
  for (let ei = 0; ei < expected.length; ei++) {
    if (!visit(ei, new Set())) return { ok: false, missing: expected[ei] };
  }
  return { ok: true };
}

const rows = [];
let passed = 0, failed = 0;

const browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });

for (const c of cases) {
  const errors = [];
  const pdf = resolve(BENCH, c.source_pdf);
  if (!existsSync(pdf)) { errors.push(`missing pdf ${pdf}`); rows.push({ id: c.id, ok: false, errors }); failed++; continue; }

  // Let the PREVIOUS case's server-side graph/table construction drain
  // before starting a new upload — see waitForGraphProcsToDrain's own
  // comment for why this matters and what it fixes.
  await waitForGraphProcsToDrain();

  // A fresh, isolated context per case — not just a fresh page on the
  // shared default context — so no case can inherit another's localStorage/
  // IndexedDB origin. Mirrors playwright-table-takeoff-ui.mjs's own per-doc
  // isolation. (A one-off anomaly during development — case 11 passing once
  // in a corpus-wide run, immediately after the corpus's heaviest case —
  // traced to something else entirely: accumulated orphaned server-side
  // `production-graph-cli.mjs` subprocesses from rapid repeated test runs
  // starving the box of CPU/memory, not a browser-state leak; confirmed by
  // re-running case 11 deterministically FAIL, matching the CLI gate
  // exactly, once those processes were cleared. Context isolation is kept
  // anyway as the correct, established pattern — it costs nothing once the
  // machine isn't already starved.)
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 200)}`));
  const started = Date.now();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
    await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
    await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });

    const key = await page.evaluate(async (pageNo) => {
      const k = window.__opentakeoff.probe.sheets()[0]?.key || "";
      const file = k.includes("#") ? k.slice(0, k.lastIndexOf("#")) : k;
      const target = `${file}#${pageNo}`;
      window.__opentakeoff.probe.openSheets([target]);
      return target;
    }, c.page);
    // The corpus's largest sheets (100k+ segments) measured up to ~230s for
    // this same extraction via the CLI path (mcp/scripts/symbol-sweep-
    // corpus.mjs's own case-03 timings); 120s was too tight and produced a
    // real timeout here, not a hang. 300s STILL timed out once, under
    // contention from a prior case's still-draining server-side subprocess
    // (waitForGraphProcsToDrain above exists specifically to prevent that
    // contention going forward) — widened further for real margin.
    await page.waitForFunction((k) => (window.__opentakeoff.probe.segCount(k) || 0) > 0, key, { timeout: 480_000 });

    const swept = await page.evaluate(({ k, rect }) => window.__opentakeoff.probe.sweepRect(k, rect), { k: key, rect: c.seed_rect });
    if (swept?.error) errors.push(`sweep error: ${swept.error}`);
    // Poll, don't sleep a fixed amount — affine (continuous rotation +
    // bounded stretch/shear) is the standard search now, and a dense sheet
    // can take several real seconds to finish; a short fixed wait here was
    // measured to occasionally read the review before React applied it.
    await page.waitForFunction(() => window.__opentakeoff.probe.sweep() != null, null, { timeout: 60_000 }).catch(() => {});

    const sweep = await page.evaluate(() => {
      const s = window.__opentakeoff.probe.sweep();
      if (!s) return null;
      return {
        seed: { at: s.seed.center, label: s.seed.label?.label ?? null },
        matches: s.matches.map((m) => ({ at: m.at, score: m.score })),
        // "questions" are the UI's own de-duplicated withheld clusters
        // (symbol_sweep's raw `withheld`, merged when several rotational
        // readings of one instance sit within a quarter-marquee radius —
        // see runSymbolSweep's own comment on clusterR). Read the RAW
        // per-reading `at` from each cluster's own first reading for the
        // nearest-miss diagnostic below, same spirit as the MCP script's
        // own nearest-withheld line.
        questions: s.questions.map((q) => ({ at: q.at, score: q.score })),
      };
    });
    if (!sweep) errors.push("no review opened");
    else {
      if (!errors.length && sweep.seed.label !== (c.seed.tag ?? null)) {
        errors.push(`seed tag ${sweep.seed.label ?? "<none>"} != ${c.seed.tag ?? "<none>"}`);
      }
      if (!errors.length && dist(sweep.seed.at, c.seed.at) > c.seed.tolerance_px) {
        errors.push(`seed at ${sweep.seed.at.join(",")} misses frozen center ${c.seed.at.join(",")}`);
      }
      if (!errors.length) {
        const isAffine = c.campaign === "affine";
        if (!isAffine && sweep.matches.length !== c.instances.length) {
          errors.push(`count ${sweep.matches.length} != ${c.instances.length}`);
        }
        if (!isAffine) {
          const assignment = assignInstances(c.instances, sweep.matches);
          if (!assignment.ok) {
            errors.push(`no one-to-one localization for ${assignment.missing?.id ?? "one or more instances"}`);
            const missing = assignment.missing;
            if (missing) {
              const nearest = (rows2) => rows2.reduce((best, p) => {
                const d = dist(missing.at, p.at);
                return !best || d < best.d ? { d, p } : best;
              }, null);
              const nm = nearest(sweep.matches);
              const nw = nearest(sweep.questions);
              if (nm) errors.push(`nearest match: d=${nm.d.toFixed(1)}px score=${nm.p.score}`);
              if (nw) errors.push(`nearest question: d=${nw.d.toFixed(1)}px score=${nw.p.score}`);
            }
          }
        }
      }
    }

    // Screenshot every case's review panel — visual proof, not just a count.
    const panel = page.locator("[data-sweep-review]");
    if (await panel.count() === 1) {
      const box = await panel.boundingBox();
      if (box) await page.screenshot({ path: resolve(OUT, `${c.id}.png`), clip: box });
    }
  } catch (e) {
    errors.push(`exception: ${String(e?.message || e).slice(0, 300)}`);
  } finally {
    await context.close();
  }

  const elapsedMs = Date.now() - started;
  const ok = errors.length === 0;
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id} in ${elapsedMs} ms`);
  for (const e of errors) console.log(`  - ${e}`);
  rows.push({ id: c.id, ok, elapsedMs, errors });
}

await browser.close();

writeFileSync(resolve(OUT, "results.json"), JSON.stringify({ schema: manifest.schema, cases: cases.length, passed, failed, results: rows }, null, 2));
console.log(`\n${passed} PASS / ${failed} FAIL (of ${cases.length}) — screenshots + results.json in ${OUT}`);
process.exit(failed ? 1 : 0);
