/**
 * REAL first-run UI demos — not staged, not seeded, not programmatic compile.
 *
 * Flow (as a contractor would):
 *   1. Fresh browser (empty localStorage)
 *   2. Upload the NAVFAC mechanical PDF
 *   3. Open Agent from the rail
 *   4. Paste the frozen takeoff prompt
 *   5. Click Run — wait until Agent finishes
 *   6. If the finished takeoff is incomplete, Ask a real follow-up to
 *      compile_corpus_takeoff (still Agent UI — no window.compile cheat)
 *   7. Capture Takeoff tab + Workflow data tab + video
 *
 * Usage:
 *   node scripts/playwright-takeoff-ui-demo.mjs hvac|bas|both
 */
import { chromium } from "playwright";
import {
  mkdirSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync,
} from "node:fs";
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

if (!apiKey || apiKey === "demo-key") {
  throw new Error("Real demos need a live CEREBRAS_API_KEY (or /tmp/cerebras_ui_key.txt). Refusing staged keys.");
}
if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);

mkdirSync(artifacts, { recursive: true });
mkdirSync("/tmp/ot-pw-videos", { recursive: true });

const JOBS = {
  hvac: {
    label: "hvac",
    title: "HVAC equipment takeoff",
    promptPath: resolve(corpus, "takeoffs/T-HVAC-01-navfac-equipment/prompt.txt"),
    expectTakeoffId: "T-HVAC-01",
    expectItems: 396,
    expectMinLines: 100,
    followUp: "Please call compile_corpus_takeoff with kind=hvac_equipment to produce the complete set takeoff into the Takeoff panel, cite MARK cells, and account for every page.",
  },
  bas: {
    label: "bas",
    title: "BAS points takeoff",
    promptPath: resolve(corpus, "takeoffs/T-BAS-01-navfac-points/prompt.txt"),
    expectTakeoffId: "T-BAS-01",
    expectRows: 122,
    expectMinLines: 50,
    followUp: "Please call compile_corpus_takeoff with kind=bas_points to produce the complete points takeoff into the Takeoff panel, cite MARK cells, and account for every page.",
  },
};

const kindArg = (process.argv[2] || "both").toLowerCase();
const jobs = kindArg === "both" ? [JOBS.hvac, JOBS.bas]
  : kindArg === "bas" ? [JOBS.bas]
    : [JOBS.hvac];

const AGENT_TIMEOUT_MS = Number(process.env.OT_DEMO_AGENT_TIMEOUT_MS || 25 * 60 * 1000);

async function waitAgentDone(page, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  let sawRunning = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const stop = [...document.querySelectorAll("button")].some((b) => /■\s*Stop/.test(b.textContent || ""));
      const statusEl = document.querySelector("[data-agent-status]");
      const takeoffBtn = [...document.querySelectorAll("button")].find((b) => /^Takeoff/.test((b.textContent || "").trim()));
      const btnText = takeoffBtn?.textContent?.trim() || "";
      const rowMatch = btnText.match(/Takeoff\s*·\s*(\d+)/);
      return {
        running: stop,
        status: statusEl?.textContent || "",
        evidence: rowMatch ? Number(rowMatch[1]) : 0,
        meta: window.__opentakeoff?.lastCorpusTakeoff?.() || null,
        rowCount: window.__opentakeoff?.takeoffRowCount?.() ?? 0,
      };
    });
    if (state.running) sawRunning = true;
    if (state.status && state.status !== lastStatus) {
      console.log(`[${label}] status: ${state.status}`);
      lastStatus = state.status;
    }
    // Must have started, then stopped — avoids treating pre-click idle as done.
    if (sawRunning && !state.running) {
      console.log(`[${label}] Agent finished (evidence=${state.evidence}, rows=${state.rowCount}, compile=${state.meta?.takeoff_id || "none"})`);
      return state;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error(`[${label}] Agent did not finish within ${Math.round(timeoutMs / 1000)}s`);
}

async function openTakeoffPanel(page) {
  const open = await page.locator('[aria-label="Takeoff"]').count();
  if (open) return;
  const topTakeoff = page.locator("button", { hasText: /^Takeoff/ }).first();
  if (await topTakeoff.count()) await topTakeoff.click();
  await page.waitForSelector('[aria-label="Takeoff"]', { timeout: 30_000 });
}

async function panelStats(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[aria-label="Takeoff"]');
    const text = panel?.innerText || "";
    const lineMatch = text.match(/(\d+)\s+lines?/i);
    const evidenceMatch = text.match(/(\d+)\s+evidence/i);
    const eaMatch = text.match(/·\s*(\d+)\s+EA/i);
    return {
      textHead: text.slice(0, 500),
      lines: lineMatch ? Number(lineMatch[1]) : 0,
      evidence: evidenceMatch ? Number(evidenceMatch[1]) : 0,
      ea: eaMatch ? Number(eaMatch[1]) : null,
      meta: window.__opentakeoff?.lastCorpusTakeoff?.() || null,
      rowCount: window.__opentakeoff?.takeoffRowCount?.() ?? 0,
      hasObjectObject: /\[object Object\]/i.test(text),
    };
  });
}

async function runOne(job) {
  const prompt = readFileSync(job.promptPath, "utf8").trim();
  if (!prompt) throw new Error(`Empty prompt: ${job.promptPath}`);

  const videoDir = `/tmp/ot-pw-videos/${job.label}-real-${Date.now()}`;
  mkdirSync(videoDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outBase = `takeoff_ui_${job.label}_real_agent_${stamp}`;
  const pageErrors = [];

  const browser = await chromium.launch({
    headless: false,
    args: ["--use-gl=angle", "--window-size=1440,900"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[${job.label}] console.${t}: ${msg.text().slice(0, 300)}`);
    }
  });
  page.on("pageerror", (err) => {
    const s = String(err);
    pageErrors.push(s);
    console.log(`[${job.label}] pageerror: ${s.slice(0, 300)}`);
  });
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (/cerebras|openai|\/v1\/chat/i.test(u)) {
      console.log(`[${job.label}] requestfailed: ${req.failure()?.errorText || "?"} ${u.slice(0, 120)}`);
    }
  });

  await page.addInitScript(({ endpoint, apiKey, model }) => {
    localStorage.clear();
    localStorage.setItem("opentakeoff_ai_endpoint", endpoint);
    localStorage.setItem("opentakeoff_ai_key", apiKey);
    localStorage.setItem("opentakeoff_ai_model", model);
    localStorage.setItem("opentakeoff_ai_provider", "openai");
  }, {
    endpoint: "https://api.cerebras.ai",
    apiKey,
    model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
  });

  console.log(`[${job.label}] goto ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  console.log(`[${job.label}] upload PDF`);
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.openAgent === "function"
      && typeof window.__opentakeoff?.compileCorpusTakeoff === "function",
    { timeout: 180_000 },
  );
  await page.waitForTimeout(4000);

  console.log(`[${job.label}] open Agent`);
  const agentRail = page.locator('button[title*="Agent — describe a takeoff"]').first();
  if (await agentRail.count()) await agentRail.click();
  else await page.evaluate(() => window.__opentakeoff.openAgent());
  await page.waitForSelector('textarea[name="agent-goal"]', { timeout: 30_000 });
  await page.waitForTimeout(500);

  console.log(`[${job.label}] paste frozen prompt (${prompt.length} chars) + Run`);
  await page.locator('textarea[name="agent-goal"]').fill(prompt);
  await page.waitForTimeout(400);
  await page.locator('button.btn-primary', { hasText: /^Run$/ }).click();
  console.log(`[${job.label}] Agent running — waiting up to ${Math.round(AGENT_TIMEOUT_MS / 1000)}s for finish`);

  let state = await waitAgentDone(page, job.label, AGENT_TIMEOUT_MS);

  // Real follow-up if Agent did not compile the full takeoff into the panel.
  const needFollowUp = !state.meta?.takeoff_id
    || (job.expectItems != null && (state.meta?.totals?.items ?? 0) < job.expectItems)
    || (job.expectRows != null && (state.meta?.totals?.rows ?? 0) < job.expectRows)
    || state.rowCount < job.expectMinLines;

  if (needFollowUp) {
    console.log(`[${job.label}] incomplete after first pass — Ask follow-up for compile_corpus_takeoff`);
    // Close takeoff overlay if open so Agent composer is usable.
    const panel = page.locator('[aria-label="Takeoff"]');
    if (await panel.count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
    await page.locator('textarea[name="agent-goal"]').fill(job.followUp);
    await page.waitForTimeout(300);
    const askBtn = page.locator('button.btn-primary', { hasText: /^(Ask|Run)$/ });
    await askBtn.click();
    state = await waitAgentDone(page, job.label, AGENT_TIMEOUT_MS);
  }

  await openTakeoffPanel(page);
  await page.waitForTimeout(1200);
  let stats = await panelStats(page);
  console.log(`[${job.label}] panel stats`, JSON.stringify(stats));

  if (stats.hasObjectObject) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL_object.png`), fullPage: true });
    throw new Error(`[${job.label}] Takeoff panel still shows [object Object] — title coercion failed`);
  }
  if (pageErrors.some((e) => /Objects are not valid as a React child/i.test(e))) {
    throw new Error(`[${job.label}] React child crash still present in TakeoffDataPanel`);
  }

  if (stats.lines < job.expectMinLines && stats.rowCount < job.expectMinLines) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL_low_count.png`), fullPage: true });
    writeFileSync(resolve(artifacts, `${outBase}_FAIL_diag.json`), JSON.stringify({ stats, state }, null, 2));
    throw new Error(`[${job.label}] Too few takeoff lines (${stats.lines} / ${stats.rowCount}); expected ≥ ${job.expectMinLines}`);
  }

  if (job.expectItems != null && stats.meta?.totals?.items != null
    && stats.meta.totals.items !== job.expectItems) {
    console.warn(`[${job.label}] WARN compile items ${stats.meta.totals.items} != ${job.expectItems}`);
  }
  if (job.expectRows != null && stats.meta?.totals?.rows != null
    && stats.meta.totals.rows !== job.expectRows) {
    console.warn(`[${job.label}] WARN compile rows ${stats.meta.totals.rows} != ${job.expectRows}`);
  }

  await page.screenshot({ path: resolve(artifacts, `${outBase}_takeoff_tab.png`) });

  const wfTab = page.locator("button", { hasText: /^Workflow data$/ });
  if (await wfTab.count()) {
    await wfTab.click();
    await page.waitForTimeout(800);
    stats = await panelStats(page);
    if (stats.hasObjectObject) {
      throw new Error(`[${job.label}] Workflow data tab shows [object Object]`);
    }
    await page.screenshot({ path: resolve(artifacts, `${outBase}_workflow_tab.png`) });
  }

  await page.waitForTimeout(2500);
  await context.close();
  await browser.close();

  const vids = readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
  if (!vids.length) throw new Error(`No video for ${job.label}`);
  const dest = resolve(artifacts, `${outBase}.webm`);
  copyFileSync(resolve(videoDir, vids[0]), dest);

  const summary = {
    label: job.label,
    title: job.title,
    video: dest,
    screenshots: {
      takeoff_tab: resolve(artifacts, `${outBase}_takeoff_tab.png`),
      workflow_tab: resolve(artifacts, `${outBase}_workflow_tab.png`),
    },
    stats,
    pageErrorCount: pageErrors.length,
    path: "REAL Agent Run — frozen prompt + optional compile follow-up; no seed; no programmatic compile",
    prompt_file: job.promptPath,
  };
  writeFileSync(resolve(artifacts, `${outBase}_summary.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  return dest;
}

const paths = [];
for (const job of jobs) {
  console.log(`\n=== REAL first-run demo: ${job.title} ===`);
  paths.push(await runOne(job));
}
console.log("\nDONE", paths);
