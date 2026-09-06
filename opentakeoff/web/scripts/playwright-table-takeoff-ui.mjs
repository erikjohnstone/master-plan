/**
 * TABLE TAKEOFF THROUGH THE REAL UI — exactly what an estimator does.
 *
 *   1. Fresh browser, empty localStorage, no prior project, no seeds
 *   2. Drop the blueprint PDF in
 *   3. Open Agent, ask for a schedule by its printed name
 *   4. Read what comes back
 *   5. Score it against ground truth the extractor has never seen
 *
 * No window.__opentakeoff.compile cheat, no pre-warmed graph, no pre-seeded
 * tables — the graph is built by the product, in the browser session, from the
 * uploaded file. That is the point: this exercises the WHOLE production flow
 * (upload, index, agent loop, MCP tools, takeoff panel), not the extractor.
 *
 *   node scripts/playwright-table-takeoff-ui.mjs --doc 12 [--table "PUMP SCHEDULE"]
 *   node scripts/playwright-table-takeoff-ui.mjs --all
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection";
const OUT = process.env.OT_TABLE_UI_OUT || "/tmp/ot-table-ui";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const AGENT_TIMEOUT_MS = Number(process.env.OT_AGENT_TIMEOUT_MS || 20 * 60 * 1000);
const INDEX_TIMEOUT_MS = Number(process.env.OT_INDEX_TIMEOUT_MS || 15 * 60 * 1000);

function envKey() {
  if (process.env.CEREBRAS_API_KEY) return process.env.CEREBRAS_API_KEY.trim();
  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^CEREBRAS_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  return "";
}
const apiKey = envKey();
if (!apiKey) throw new Error("no CEREBRAS_API_KEY (env or web/.env)");

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
/** --shots writes a full-page PNG at each moment worth looking at. Off by
 * default: the sweep wants a score, not 120 images. */
const SHOTS = args.includes("--shots");
/** --compile <kind> calls compile_corpus_takeoff directly instead of waiting
 * for the Agent to choose it. Same production tool the Agent invokes; the
 * model's only job is deciding to call it, and in this container the model is
 * unreachable (api.cerebras.ai is refused by the network policy). Everything
 * the panel then shows is the real pipeline's own output. */
const COMPILE = argOf("--compile");

const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim().replace(/Ø/g, "O");
const toks = (s) => norm(s).split(/[\s,;|]+/).filter(Boolean);
function bagHits(want, got) {
  const have = new Map();
  for (const t of got) have.set(t, (have.get(t) || 0) + 1);
  let n = 0;
  for (const t of want) if ((have.get(t) || 0) > 0) { have.set(t, have.get(t) - 1); n++; }
  return n;
}

function records() {
  const dir = resolve(BENCH, "ground_truth/records");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")));
}
const gtTitle = (t) => {
  for (const k of ["title_as_printed", "title"]) {
    const v = (t[k] || "").trim();
    if (v && !["?", "-", "N/A"].includes(v)) return v;
  }
  return "";
};

/** The biggest real schedule on the document — the one worth asking for. */
function pickTable(rec) {
  const tables = ((rec.modules || {}).schedules || {}).tables || [];
  const scored = tables
    .filter((t) => Number.isInteger(t.page) && (t.rows || []).length >= 3 && gtTitle(t))
    .map((t) => ({ t, n: (t.rows || []).length }));
  scored.sort((a, b) => b.n - a.n);
  return scored[0]?.t || null;
}

async function runOne(rec, wantTitle) {
  const pdf = resolve(BENCH, rec.source_pdf);
  if (!existsSync(pdf)) return { id: rec.id, error: `missing pdf ${rec.source_pdf}` };
  const table = wantTitle
    ? (((rec.modules || {}).schedules || {}).tables || []).find((t) => norm(gtTitle(t)) === norm(wantTitle))
    : pickTable(rec);
  if (!table) return { id: rec.id, error: "no scoreable table in ground truth" };

  const title = gtTitle(table);
  const wantRows = table.rows || [];
  const log = [];
  const say = (m) => { console.log(`[${rec.id}] ${m}`); log.push(m); };

  say(`pdf ${rec.source_pdf}`);
  say(`asking for: ${title} (page ${table.page}, ${wantRows.length} rows in truth)`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); say(`PAGEERROR ${String(e).slice(0, 200)}`); });
  page.on("console", (m) => {
    if (m.type() === "error") { const t = m.text(); if (!/favicon/.test(t)) say(`console.error ${t.slice(0, 200)}`); }
  });

  await page.addInitScript(({ endpoint, apiKey, model }) => {
    localStorage.clear();
    localStorage.setItem("opentakeoff_ai_endpoint", endpoint);
    localStorage.setItem("opentakeoff_ai_key", apiKey);
    localStorage.setItem("opentakeoff_ai_model", model);
    localStorage.setItem("opentakeoff_ai_provider", "openai");
  }, { endpoint: "https://api.cerebras.ai", apiKey, model: process.env.CEREBRAS_MODEL || "gpt-oss-120b" });

  const shot = async (name) => {
    if (!SHOTS) return;
    const file = resolve(OUT, `${rec.id}.${name}.png`);
    try { await page.screenshot({ path: file, fullPage: false }); say(`shot ${name}`); }
    catch (e) { say(`shot ${name} FAILED ${String(e).slice(0, 80)}`); }
  };

  const t0 = Date.now();
  let result = { id: rec.id, title, page: table.page, wantRows: wantRows.length };
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // The upload input is deliberately hidden behind a styled button, so wait
    // for it to be ATTACHED, not visible. setInputFiles drives a hidden input
    // fine; waiting for visibility here just times out forever.
    await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
    await page.waitForTimeout(1200);
    await shot("1-empty");

    say("upload blueprint");
    await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
    // THE REAL READINESS SIGNAL IS indexProgress(). Waiting for
    // window.__opentakeoff.openAgent to exist waits for nothing at all — that
    // hook is installed at page load, before any file is uploaded — so the
    // driver used to march straight on and drive an empty project.
    await page.waitForFunction(
      () => window.__opentakeoff?.indexProgress?.()?.phase === "ready",
      { timeout: INDEX_TIMEOUT_MS },
    );
    const idx = await page.evaluate(() => window.__opentakeoff.indexProgress());
    say(`indexed ${idx.done}/${idx.total} sheets in ${Math.round((Date.now() - t0) / 1000)}s`);
    result.sheets = idx.total;
    result.indexSeconds = Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(2500);
    await shot("2-indexed");

    say("open Agent");
    // NOT button[title*="Agent"] — the Takeoff button's own tooltip says
    // "…from every Agent run", so a substring match grabs Takeoff, clicks it,
    // and then waits forever for an Agent textarea that was never opened.
    const rail = page.locator('button[title^="Agent —"]').first();
    if (await rail.count()) await rail.click();
    else await page.evaluate(() => window.__opentakeoff.openAgent());
    await page.waitForSelector('textarea[name="agent-goal"]', { timeout: 60_000 });

    // THE UI BUILDS ITS OWN GRAPH, IN THE BROWSER, FROM THE UPLOADED FILE.
    // That is the path this run exists to verify — every number measured so far
    // came from the MCP/CLI path, and the two share an engine but not a
    // caller. debugGraph({full:true}) returns what the product itself believes
    // it found: every table, its printed title, its headers and its row count.
    const uiGraph = await page.evaluate(async () => {
      try { return await window.__opentakeoff.debugGraph({ full: true }); }
      catch (e) { return { error: String(e) }; }
    });
    if (uiGraph?.error) {
      say(`debugGraph FAILED ${uiGraph.error.slice(0, 200)}`);
    } else {
      result.uiTables = uiGraph.table_count;
      result.uiSheets = uiGraph.sheet_count;
      say(`UI graph: ${uiGraph.sheet_count} sheets, ${uiGraph.table_count} tables`);
      writeFileSync(resolve(OUT, `${rec.id}.uigraph.json`), JSON.stringify(uiGraph, null, 1));
    }

    const prompt = `Find the "${title}" on this drawing set and list every row of it. `
      + `Give one line per row with all of its column values, exactly as printed on the sheet. `
      + `Do not summarise and do not skip rows.`;
    say(`goal: ${prompt.slice(0, 110)}…`);
    await page.locator('textarea[name="agent-goal"]').fill(prompt);
    await page.waitForTimeout(600);
    await shot("3-agent");
    await page.locator("button.btn-primary", { hasText: /^Run$/ }).click();

    const deadline = Date.now() + AGENT_TIMEOUT_MS;
    let sawRunning = false, lastStatus = "";
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => ({
        running: [...document.querySelectorAll("button")].some((b) => /■\s*Stop/.test(b.textContent || "")),
        status: document.querySelector("[data-agent-status]")?.textContent || "",
      }));
      if (st.running) sawRunning = true;
      if (st.status && st.status !== lastStatus) { say(`status: ${st.status.slice(0, 120)}`); lastStatus = st.status; }
      if (sawRunning && !st.running) break;
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1500);
    await shot("3b-agent-after-run");
    result.agentSeconds = Math.round((Date.now() - t0) / 1000);
    if (!sawRunning) say("WARNING: agent never entered running state");

    if (COMPILE) {
      say(`compile_corpus_takeoff(${COMPILE}) — the tool the Agent would call`);
      const meta = await page.evaluate(async (kind) => {
        try {
          const r = await window.__opentakeoff.compileCorpusTakeoff(kind, { download: false });
          return { ok: true, full: r && typeof r === "object" ? JSON.stringify(r).slice(0, 1200) : String(r).slice(0, 400) };
        } catch (e) { return { ok: false, error: String(e).slice(0, 300) }; }
      }, COMPILE);
      // takeoffRowCount()/lastCorpusTakeoff() ARE CLOSURES OVER THE LAST
      // RENDER. Reading them in the same evaluate that awaited the compile
      // read the state as it was BEFORE showCompiledTakeoff's setState
      // flushed — so every run reported `rows: 0, meta: null` and this driver
      // spent a week accusing the Takeoff panel of dropping the takeoff.
      // Measured after the flush, the same compile is 305 rows / 21 lines.
      await page.waitForTimeout(2500);
      Object.assign(meta, await page.evaluate(() => ({
        rows: window.__opentakeoff.takeoffRowCount?.() ?? 0,
        meta: window.__opentakeoff.lastCorpusTakeoff?.() || null,
      })));
      // rows/meta first: `full` is 1200 chars and say() slices at 300, so
      // printing the payload ahead of the numbers hid the numbers.
      say(`compile -> rows ${meta.rows} · ${JSON.stringify(meta.meta?.totals || null)} · ${JSON.stringify(meta.full || meta.error || "").slice(0, 180)}`);
      result.compile = meta;
    }

    // The Takeoff panel is where a takeoff is actually READ. The driver only
    // ever opened the Agent, because it scored the graph rather than the view.
    try {
      // button[name="open-takeoff"], not a /^Takeoff/ text match: that regex
      // ALSO matched the rail's Takeoff button, .first() picked the one the
      // open Agent panel covers, and the click sat on actionability for the
      // full 120s default before failing. Bounded, with the programmatic open
      // as the fallback — this step must never cost two minutes to learn
      // nothing.
      const btn = page.locator('button[name="open-takeoff"]').first();
      if (await btn.count()) await btn.click({ timeout: 5_000 }).catch(() => page.evaluate(() => window.__opentakeoff.openTakeoff()));
      else await page.evaluate(() => window.__opentakeoff.openTakeoff());
      await page.waitForTimeout(2500);
      // What the ESTIMATOR reads, from the panel's own header — the number
      // this driver is actually here to check.
      const panelLines = await page.evaluate(() => {
        const m = /Project takeoff\s*(\d+)\s*lines?/.exec(document.body.innerText || "");
        return m ? Number(m[1]) : null;
      });
      if (panelLines != null) { result.panelLines = panelLines; say(`takeoff panel: ${panelLines} lines`); }
      await shot("4-takeoff");
    } catch (e) { say(`takeoff panel FAILED ${String(e).slice(0, 90)}`); }

    const answer = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="Agent"]')
        || document.querySelector("[data-agent-panel]");
      return (panel?.innerText || document.body.innerText || "");
    });
    writeFileSync(resolve(OUT, `${rec.id}.answer.txt`), answer);

    // Score the UI's OWN graph against ground truth: for every table the truth
    // records, did the UI find a table with that printed title, and does it
    // carry the rows the truth says are there?
    if (uiGraph && !uiGraph.error) {
      const all = ((rec.modules || {}).schedules || {}).tables || [];
      // MATCHING BY PRINTED TITLE ALONE REPORTS THE SCORER'S OWN LIMITS AS
      // PRODUCT FAILURES. Three real cases from the first four sets:
      //   - 01__vol2__001's truth carries "PIPING CONSTRUCTION SCHEDULE -
      //     merged buried chilled water row", which is the transcriber's note,
      //     not a printed title. The UI has ONE table with 3+1 = 4 rows.
      //   - 03__vol1__27's "MODULAR HEAT RECOVERY CHILLER SCHEDULE —
      //     ACCESSORIES" is printed simply "ACCESSORIES".
      //   - 03__vol1__27 p13's SEISMIC AND VIBRATION CONTROL is extracted with
      //     all 26 rows and title null, because its caption sits outside the
      //     ruled box. That one IS a product bug, but it is a TITLE bug, and
      //     scoring it as a missing table hides what actually happened.
      // So: title first, then the same page with a matching row count.
      const byTitle = new Map();
      const bySheet = new Map();
      for (const ut of uiGraph.titles || []) {
        const pageNo = Number(String(ut.sheet || "").split("#").pop());
        if (Number.isFinite(pageNo)) {
          if (!bySheet.has(pageNo)) bySheet.set(pageNo, []);
          bySheet.get(pageNo).push(ut);
        }
        const k = norm(ut.title);
        if (!k) continue;
        if (!byTitle.has(k)) byTitle.set(k, []);
        byTitle.get(k).push(ut);
      }
      const claimed = new Set();
      let found = 0, rowsOk = 0, scored = 0, rowsWant = 0, rowsGot = 0;
      const misses = [];
      for (const gt of all) {
        const gtt = norm(gtTitle(gt));
        if (!gtt) continue;
        scored++;
        const want = (gt.rows || []).length;
        rowsWant += want;
        let cands = (byTitle.get(gtt) || []).filter((c) => !claimed.has(c));
        let how = "title";
        if (!cands.length) {
          // Same page, unclaimed, row count within one — AND THE UI TABLE MUST
          // BE UNTITLED. That last condition is the whole point: this fallback
          // exists for a table the product extracted correctly but could not
          // name (03__vol1__27 p13's SEISMIC AND VIBRATION CONTROL). Without
          // it the fallback matches on row count alone, and it did: on
          // 01__vol2__001 p43 it matched the truth's "PIPING CONSTRUCTION
          // SCHEDULE - merged buried chilled water row" (1 row) to the UI's
          // HUMIDIFIER SCHEDULE (1 row), claimed it, and left the real
          // HUMIDIFIER SCHEDULE with nothing to match — one bad match
          // cascading into three wrong lines. A titled UI table must only ever
          // match its own name.
          const near = (bySheet.get(gt.page) || []).filter(
            (c) => !claimed.has(c) && !norm(c.title) && Math.abs(c.rows - want) <= 1,
          );
          if (near.length) { cands = near; how = "page+rows(untitled)"; }
        }
        if (!cands.length) { misses.push(`NOT FOUND: ${gtTitle(gt)} (p${gt.page}, ${want} rows)`); continue; }
        found++;
        const best = cands.reduce((a, b) => (Math.abs(b.rows - want) < Math.abs(a.rows - want) ? b : a));
        claimed.add(best);
        if (how !== "title") misses.push(`TITLE MISSING (matched by ${how}): ${gtTitle(gt)} (p${gt.page}) -> ui title ${JSON.stringify(best.title)}`);
        rowsGot += Math.min(best.rows, want);
        if (best.rows === want) rowsOk++;
        else misses.push(`ROWS ${best.rows} vs ${want}: ${gtTitle(gt)} (p${gt.page})`);
      }
      result.uiTablesFound = `${found}/${scored}`;
      result.uiTablesRowExact = `${rowsOk}/${scored}`;
      result.uiRows = `${rowsGot}/${rowsWant}`;
      say(`UI vs truth: found ${found}/${scored} tables, row-count exact ${rowsOk}/${scored}, rows ${rowsGot}/${rowsWant}`);
      writeFileSync(resolve(OUT, `${rec.id}.uimisses.txt`), misses.join("\n"));
      for (const m of misses.slice(0, 8)) say(`  ${m}`);
    }

    const got = toks(answer);
    let rowsHit = 0, tk = 0, tkAll = 0;
    for (const wr of wantRows) {
      const wt = toks(wr);
      tkAll += wt.length;
      const n = bagHits(wt, got);
      tk += n;
      if (n === wt.length) rowsHit++;
    }
    result.rowsFound = rowsHit;
    result.tokens = `${tk}/${tkAll}`;
    result.tokenPct = tkAll ? Math.round((1000 * tk) / tkAll) / 10 : 0;
    result.answerChars = answer.length;
    result.pageErrors = pageErrors.length;
    say(`rows ${rowsHit}/${wantRows.length} · values ${tk}/${tkAll} (${result.tokenPct}%) · ${result.agentSeconds}s`);
  } catch (e) {
    result.error = String(e).slice(0, 300);
    say(`FAILED ${result.error}`);
  } finally {
    writeFileSync(resolve(OUT, `${rec.id}.log`), log.join("\n"));
    await browser.close();
  }
  return result;
}

mkdirSync(OUT, { recursive: true });
const recs = records();
const only = argOf("--doc");
const wanted = only ? recs.filter((r) => r.id.startsWith(only)) : recs;
if (!wanted.length) throw new Error(`no ground-truth record matches --doc ${only}`);

const results = [];
for (const rec of wanted) {
  results.push(await runOne(rec, argOf("--table")));
  writeFileSync(resolve(OUT, "results.json"), JSON.stringify(results, null, 1));
}
console.log("\n==== TABLE TAKEOFF THROUGH THE UI ====");
for (const r of results) {
  console.log(r.error
    ? `  ${r.id.padEnd(18)} ERROR ${r.error.slice(0, 90)}`
    : `  ${r.id.padEnd(18)} ${String(r.rowsFound).padStart(3)}/${String(r.wantRows).padEnd(3)} rows  ${String(r.tokenPct).padStart(5)}% values  ${r.agentSeconds}s  ${r.title.slice(0, 34)}`);
}
console.log("UIDONE");
