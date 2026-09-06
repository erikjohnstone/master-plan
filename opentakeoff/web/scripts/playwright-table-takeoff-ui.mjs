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

  const t0 = Date.now();
  let result = { id: rec.id, title, page: table.page, wantRows: wantRows.length };
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // The upload input is deliberately hidden behind a styled button, so wait
    // for it to be ATTACHED, not visible. setInputFiles drives a hidden input
    // fine; waiting for visibility here just times out forever.
    await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });

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
    await page.waitForTimeout(1500);

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
    result.agentSeconds = Math.round((Date.now() - t0) / 1000);
    if (!sawRunning) say("WARNING: agent never entered running state");

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
      const byTitle = new Map();
      for (const ut of uiGraph.titles || []) {
        const k = norm(ut.title);
        if (!k) continue;
        if (!byTitle.has(k)) byTitle.set(k, []);
        byTitle.get(k).push(ut);
      }
      let found = 0, rowsOk = 0, scored = 0, rowsWant = 0, rowsGot = 0;
      const misses = [];
      for (const gt of all) {
        const gtt = norm(gtTitle(gt));
        if (!gtt) continue;
        scored++;
        const want = (gt.rows || []).length;
        rowsWant += want;
        const cands = byTitle.get(gtt) || [];
        if (!cands.length) { misses.push(`NOT FOUND: ${gtTitle(gt)} (p${gt.page}, ${want} rows)`); continue; }
        found++;
        const best = cands.reduce((a, b) => (Math.abs(b.rows - want) < Math.abs(a.rows - want) ? b : a));
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
