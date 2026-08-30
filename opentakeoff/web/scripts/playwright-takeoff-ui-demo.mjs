/**
 * First-time user demo — exactly how a new estimator would use it:
 *   1. Fresh browser (empty localStorage / no prior project)
 *   2. Upload the blueprint PDF
 *   3. Open Agent
 *   4. Paste the takeoff goal and click Run
 *   5. Wait for Agent to finish
 *   6. Open Takeoff panel (Takeoff tab + Workflow data)
 *
 * No seeds. No window.__opentakeoff.compile cheat. No engineer follow-ups.
 *
 * Usage: node scripts/playwright-takeoff-ui-demo.mjs hvac|bas|both
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
  throw new Error("Need a live CEREBRAS_API_KEY (or /tmp/cerebras_ui_key.txt).");
}
if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);

mkdirSync(artifacts, { recursive: true });
mkdirSync("/tmp/ot-pw-videos", { recursive: true });

const JOBS = {
  hvac: {
    label: "hvac",
    title: "HVAC equipment takeoff",
    promptPath: resolve(corpus, "takeoffs/T-HVAC-01-navfac-equipment/prompt.txt"),
    expectMinEvidence: 350,
    expectMinLines: 396,
    expectMaxLines: 396,
    expectTakeoffId: "T-HVAC-01",
    expectEa: 396,
  },
  bas: {
    label: "bas",
    title: "BAS points takeoff",
    promptPath: resolve(corpus, "takeoffs/T-BAS-01-navfac-points/prompt.txt"),
    expectMinEvidence: 100,
    expectMinLines: 122,
    expectMaxLines: 122,
    expectTakeoffId: "T-BAS-01",
    expectEa: 122,
  },
};

const kindArg = (process.argv[2] || "both").toLowerCase();
const jobs = kindArg === "both" ? [JOBS.hvac, JOBS.bas]
  : kindArg === "bas" ? [JOBS.bas]
    : [JOBS.hvac];

const AGENT_TIMEOUT_MS = Number(process.env.OT_DEMO_AGENT_TIMEOUT_MS || 8 * 60 * 1000);
/** If status text is unchanged this long, dump diagnosis (do not sit idle for 25m). */
const STALL_DIAG_MS = Number(process.env.OT_DEMO_STALL_MS || 90_000);
/** Fail after this much unchanged status unless a graph/compile worker is live. */
const STALL_FAIL_MS = Number(process.env.OT_DEMO_STALL_FAIL_MS || 3 * 60 * 1000);

async function diagnoseHang(label, status) {
  const { execSync } = await import("node:child_process");
  let procs = "";
  try {
    procs = execSync(
      "ps -eo pid,etime,cmd --sort=-etime | grep -E 'production-graph-cli|playwright|chrome|node.*vite' | grep -v grep | head -20",
      { encoding: "utf8" },
    );
  } catch {
    procs = "(no matching processes)";
  }
  let tmpDirs = "";
  try {
    tmpDirs = execSync("ls -ltd /tmp/ot-prod-graph-* 2>/dev/null | head -5", { encoding: "utf8" });
  } catch {
    tmpDirs = "";
  }
  const graphLive = /production-graph-cli/.test(procs);
  const msg = [
    `[${label}] STALL status=${JSON.stringify(status)} graphLive=${graphLive}`,
    "--- processes ---",
    procs.trim() || "(none)",
    "--- prod-graph dirs ---",
    tmpDirs.trim() || "(none)",
  ].join("\n");
  console.error(msg);
  writeFileSync(resolve(artifacts, `demo_${label}_stall_diag.log`), `${msg}\n`);
  return { msg, graphLive };
}

async function waitAgentDone(page, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  let statusChangedAt = Date.now();
  let sawRunning = false;
  let loggedStall = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const stop = [...document.querySelectorAll("button")].some((b) => /■\s*Stop/.test(b.textContent || ""));
      const statusEl = document.querySelector("[data-agent-status]");
      const takeoffBtn = [...document.querySelectorAll("button")]
        .find((b) => /^Takeoff/.test((b.textContent || "").trim()));
      const btnText = takeoffBtn?.textContent?.trim() || "";
      const rowMatch = btnText.match(/Takeoff\s*·\s*(\d+)/);
      return {
        running: stop,
        status: statusEl?.textContent || "",
        evidence: rowMatch ? Number(rowMatch[1]) : 0,
        rowCount: window.__opentakeoff?.takeoffRowCount?.() ?? 0,
        meta: window.__opentakeoff?.lastCorpusTakeoff?.() || null,
      };
    });
    if (state.running) sawRunning = true;
    if (state.status && state.status !== lastStatus) {
      console.log(`[${label}] ${state.status}`);
      lastStatus = state.status;
      statusChangedAt = Date.now();
      loggedStall = false;
    } else if (state.running && Date.now() - statusChangedAt > STALL_DIAG_MS) {
      const stuckFor = Date.now() - statusChangedAt;
      const { graphLive, msg } = await diagnoseHang(label, lastStatus || state.status || "(empty)");
      if (!loggedStall) {
        loggedStall = true;
        console.error(`[${label}] diagnosing after ${Math.round(stuckFor / 1000)}s unchanged…`);
      }
      // Graph/compile worker still chewing — keep waiting, but not forever.
      if (!graphLive && stuckFor > STALL_FAIL_MS) {
        throw new Error(msg.split("\n")[0]);
      }
      if (graphLive && stuckFor > Math.max(STALL_FAIL_MS, 5 * 60 * 1000)) {
        throw new Error(`[${label}] production-graph-cli still running after ${Math.round(stuckFor / 1000)}s — ${lastStatus}`);
      }
      // Reset the diag clock so we re-check every STALL_DIAG_MS, not spin-print.
      statusChangedAt = Date.now() - (STALL_DIAG_MS - 15_000);
    }
    if (sawRunning && !state.running) {
      console.log(`[${label}] Agent done — Takeoff evidence=${state.evidence} rows=${state.rowCount} compile=${state.meta?.takeoff_id || "none"}`);
      return state;
    }
    await page.waitForTimeout(1500);
  }
  await diagnoseHang(label, lastStatus || "(timeout)");
  throw new Error(`[${label}] Agent still running after ${Math.round(timeoutMs / 1000)}s`);
}

async function runOne(job) {
  const prompt = readFileSync(job.promptPath, "utf8").trim();
  const videoDir = `/tmp/ot-pw-videos/${job.label}-user-${Date.now()}`;
  mkdirSync(videoDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outBase = `takeoff_ui_${job.label}_new_user_${stamp}`;
  const pageErrors = [];

  console.log(`\n========== ${job.title} ==========`);
  console.log(`[${job.label}] new user · fresh browser · upload blueprint · Agent Run`);

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
    if (msg.type() === "error") console.log(`[${job.label}] console: ${msg.text().slice(0, 220)}`);
  });
  page.on("pageerror", (err) => {
    const s = String(err);
    pageErrors.push(s);
    console.log(`[${job.label}] pageerror: ${s.slice(0, 220)}`);
  });

  // Brand-new user: empty storage, only AI key so Agent can run.
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

  console.log(`[${job.label}] open app`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(700);

  console.log(`[${job.label}] upload blueprint PDF`);
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.openAgent === "function",
    { timeout: 180_000 },
  );
  await page.waitForTimeout(3500);

  console.log(`[${job.label}] open Agent`);
  const agentRail = page.locator('button[title*="Agent — describe a takeoff"]').first();
  if (await agentRail.count()) await agentRail.click();
  else await page.evaluate(() => window.__opentakeoff.openAgent());
  await page.waitForSelector('textarea[name="agent-goal"]', { timeout: 30_000 });

  console.log(`[${job.label}] type goal (${prompt.length} chars)`);
  console.log(`[${job.label}] >>> ${prompt.slice(0, 120)}…`);
  await page.locator('textarea[name="agent-goal"]').fill(prompt);
  await page.waitForTimeout(400);

  console.log(`[${job.label}] click Run`);
  await page.locator('button.btn-primary', { hasText: /^Run$/ }).click();

  const state = await waitAgentDone(page, job.label, AGENT_TIMEOUT_MS);

  // Open Takeoff the way a user would — top-bar Takeoff button.
  console.log(`[${job.label}] open Takeoff panel`);
  if (!(await page.locator('[aria-label="Takeoff"]').count())) {
    await page.locator("button", { hasText: /^Takeoff/ }).first().click();
  }
  await page.waitForSelector('[aria-label="Takeoff"]', { timeout: 20_000 });
  await page.waitForTimeout(1000);

  const stats = await page.evaluate(() => {
    const panel = document.querySelector('[aria-label="Takeoff"]');
    const text = panel?.innerText || "";
    const el = panel?.querySelector("[data-takeoff-stats]");
    const lines = el ? Number(el.getAttribute("data-lines") || 0) : Number((text.match(/(\d+)\s+lines?/i) || [])[1] || 0);
    const eaAttr = el?.getAttribute("data-ea");
    const ea = eaAttr !== "" && eaAttr != null
      ? Number(eaAttr)
      : Number((text.match(/\b(\d+)\s+EA\b/i) || [])[1] || 0) || null;
    return {
      textHead: text.slice(0, 450),
      lines,
      evidence: el ? Number(el.getAttribute("data-evidence") || 0) : Number((text.match(/(\d+)\s+evidence/i) || [])[1] || 0),
      ea,
      rowCount: window.__opentakeoff?.takeoffRowCount?.() ?? 0,
      meta: window.__opentakeoff?.lastCorpusTakeoff?.() || null,
      hasObjectObject: /\[object Object\]/i.test(text),
      citeButtons: panel ? panel.querySelectorAll("[data-takeoff-cite]").length : 0,
      citeRows: panel ? panel.querySelectorAll('[data-takeoff-cite="row"]').length : 0,
      citeTables: panel ? panel.querySelectorAll('[data-takeoff-cite="table"]').length : 0,
    };
  });
  console.log(`[${job.label}] Takeoff panel:`, JSON.stringify(stats));

  if (stats.hasObjectObject) {
    throw new Error(`[${job.label}] panel shows [object Object]`);
  }
  if (pageErrors.some((e) => /Objects are not valid as a React child/i.test(e))) {
    throw new Error(`[${job.label}] React crash in TakeoffDataPanel`);
  }
  if (job.expectTakeoffId && stats.meta?.takeoff_id !== job.expectTakeoffId) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(
      `[${job.label}] expected compiled takeoff ${job.expectTakeoffId}, got ${stats.meta?.takeoff_id || "none"} `
      + `(lines=${stats.lines} evidence=${stats.evidence}) — scrap evidence is not a takeoff`,
    );
  }
  if (stats.lines < (job.expectMinLines || job.expectMinEvidence)) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] Takeoff lines ${stats.lines} < ${job.expectMinLines} (need finished takeoff)`);
  }
  if (job.expectMaxLines != null && stats.lines > job.expectMaxLines) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] Takeoff lines ${stats.lines} > ${job.expectMaxLines} (scrap inflated the takeoff)`);
  }
  if (job.expectEa && (stats.ea == null || stats.ea !== job.expectEa)) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] EA total ${stats.ea} != ${job.expectEa}`);
  }
  const locked = stats.meta?.totals?.items ?? stats.meta?.totals?.rows;
  if (locked != null && locked !== job.expectEa) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] compile totals ${locked} != ${job.expectEa}`);
  }
  // Row tags + schedule section headers must be jumpable (not every CFM cell).
  if (stats.citeRows < 5) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] too few row cites (${stats.citeRows}) — tags must jump to schedule rows`);
  }
  if (stats.citeTables < 1) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] no table cites — schedule headers must jump to whole tables`);
  }
  if (stats.rowCount < job.expectMinEvidence && stats.evidence < job.expectMinEvidence) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    throw new Error(`[${job.label}] almost empty Takeoff (${stats.rowCount} rows)`);
  }

  await page.screenshot({ path: resolve(artifacts, `${outBase}_takeoff_tab.png`) });
  console.log(`[${job.label}] screenshot Takeoff tab`);

  const wf = page.locator("button", { hasText: /^Workflow data$/ });
  if (await wf.count()) {
    await wf.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(artifacts, `${outBase}_workflow_tab.png`) });
    console.log(`[${job.label}] screenshot Workflow data tab`);
  }

  await page.waitForTimeout(2000);
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
    path: "new-user: upload PDF → Agent goal → Run → Takeoff panel",
  };
  writeFileSync(resolve(artifacts, `${outBase}_summary.json`), JSON.stringify(summary, null, 2));
  console.log(`[${job.label}] DONE video=${dest}`);
  return dest;
}

const paths = [];
for (const job of jobs) {
  paths.push(await runOne(job));
}
console.log("\nALL DONE", paths);
