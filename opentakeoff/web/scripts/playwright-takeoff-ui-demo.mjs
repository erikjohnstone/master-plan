/**
 * REAL first-run UI demos — not staged, not seeded, not programmatic compile.
 *
 * Flow (as a contractor would):
 *   1. Fresh browser (empty localStorage)
 *   2. Upload the NAVFAC mechanical PDF
 *   3. Open Agent from the rail
 *   4. Paste the frozen takeoff prompt
 *   5. Click Run
 *   6. Wait for Agent to finish + TakeoffDataPanel to open with live rows
 *   7. Capture video + screenshots of Takeoff tab and Workflow data tab
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
    expectMinLines: 50,
    expectTakeoffId: "T-HVAC-01",
  },
  bas: {
    label: "bas",
    title: "BAS points takeoff",
    promptPath: resolve(corpus, "takeoffs/T-BAS-01-navfac-points/prompt.txt"),
    expectMinLines: 20,
    expectTakeoffId: "T-BAS-01",
  },
};

const kindArg = (process.argv[2] || "both").toLowerCase();
const jobs = kindArg === "both" ? [JOBS.hvac, JOBS.bas]
  : kindArg === "bas" ? [JOBS.bas]
    : [JOBS.hvac];

const AGENT_TIMEOUT_MS = Number(process.env.OT_DEMO_AGENT_TIMEOUT_MS || 25 * 60 * 1000);

async function runOne(job) {
  const prompt = readFileSync(job.promptPath, "utf8").trim();
  if (!prompt) throw new Error(`Empty prompt: ${job.promptPath}`);

  const videoDir = `/tmp/ot-pw-videos/${job.label}-real-${Date.now()}`;
  mkdirSync(videoDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outBase = `takeoff_ui_${job.label}_real_agent_${stamp}`;

  const browser = await chromium.launch({
    headless: false,
    args: ["--use-gl=angle", "--window-size=1440,900"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Fresh profile every run — no leftover takeoff rows / project state.
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[${job.label}] console.${t}: ${msg.text().slice(0, 400)}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[${job.label}] pageerror: ${String(err).slice(0, 400)}`);
  });
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (/cerebras|openai|api\.|/v1\/chat/i.test(u)) {
      console.log(`[${job.label}] requestfailed: ${req.failure()?.errorText || "?"} ${u.slice(0, 120)}`);
    }
  });

  // Only AI settings — no seeded takeoff rows, no pre-loaded project.
  await page.addInitScript(({ endpoint, apiKey, model }) => {
    localStorage.clear();
    localStorage.setItem("opentakeoff_ai_endpoint", endpoint);
    localStorage.setItem("opentakeoff_ai_key", apiKey);
    localStorage.setItem("opentakeoff_ai_model", model);
    localStorage.setItem("opentakeoff_ai_provider", "openai");
  }, {
    endpoint: "https://api.cerebras.ai/v1",
    apiKey,
    model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
  });

  console.log(`[${job.label}] goto ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ── Upload blueprint (first-time ingest) ─────────────────────────────────
  console.log(`[${job.label}] upload PDF`);
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(
    () => typeof window.__opentakeoff?.openAgent === "function"
      && typeof window.__opentakeoff?.compileCorpusTakeoff === "function",
    { timeout: 180_000 },
  );
  // Let first sheet paint — canvas must look like a real takeoff session.
  await page.waitForTimeout(4000);

  // ── Open Agent from the rail (UI click, not only the hook) ───────────────
  console.log(`[${job.label}] open Agent`);
  const agentRail = page.locator('button[title*="Agent — describe a takeoff"]').first();
  if (await agentRail.count()) {
    await agentRail.click();
  } else {
    await page.evaluate(() => window.__opentakeoff.openAgent());
  }
  await page.waitForSelector('textarea[name="agent-goal"]', { timeout: 30_000 });
  await page.waitForTimeout(500);

  // ── Paste frozen prompt + click Run ──────────────────────────────────────
  console.log(`[${job.label}] paste frozen prompt (${prompt.length} chars) + Run`);
  const goalBox = page.locator('textarea[name="agent-goal"]');
  await goalBox.fill(prompt);
  await page.waitForTimeout(400);

  const runBtn = page.locator('button.btn-primary', { hasText: /^Run$/ });
  await runBtn.click();
  console.log(`[${job.label}] Agent running — waiting up to ${Math.round(AGENT_TIMEOUT_MS / 1000)}s`);

  // Wait until Takeoff panel opens with real lines OR agent stops and we open it.
  const deadline = Date.now() + AGENT_TIMEOUT_MS;
  let panelReady = false;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="Takeoff"]');
      const stop = [...document.querySelectorAll("button")].some((b) => /■\s*Stop/.test(b.textContent || ""));
      const takeoffBtn = [...document.querySelectorAll("button")].find((b) => /^Takeoff/.test((b.textContent || "").trim()));
      const btnText = takeoffBtn?.textContent?.trim() || "";
      const rowMatch = btnText.match(/Takeoff\s*·\s*(\d+)/);
      const statusEl = document.querySelector("[data-agent-status]") || null;
      return {
        panelOpen: !!panel,
        running: stop,
        takeoffBtn: btnText,
        evidence: rowMatch ? Number(rowMatch[1]) : 0,
        status: statusEl?.textContent || "",
        lineHeader: panel?.innerText?.slice(0, 240) || "",
      };
    });
    if (state.status && state.status !== lastStatus) {
      console.log(`[${job.label}] status: ${state.status}`);
      lastStatus = state.status;
    }
    if (state.panelOpen && /line/i.test(state.lineHeader)) {
      panelReady = true;
      console.log(`[${job.label}] Takeoff panel open: ${state.lineHeader.replace(/\s+/g, " ").slice(0, 160)}`);
      break;
    }
    if (!state.running && state.evidence > 0) {
      // Agent finished; open Takeoff from top bar if panel not auto-opened.
      const topTakeoff = page.locator("button", { hasText: /^Takeoff/ }).first();
      if (await topTakeoff.count()) await topTakeoff.click();
      await page.waitForTimeout(800);
      const open = await page.locator('[aria-label="Takeoff"]').count();
      if (open) {
        panelReady = true;
        console.log(`[${job.label}] opened Takeoff after agent finished (${state.evidence} evidence rows)`);
        break;
      }
    }
    if (!state.running && Date.now() > deadline - AGENT_TIMEOUT_MS + 90_000 && state.evidence === 0) {
      // Still early? keep waiting. If agent died with zero rows, keep looping until timeout.
    }
    await page.waitForTimeout(2000);
  }

  if (!panelReady) {
    // Last chance: dump diagnostics then fail.
    const diag = await page.evaluate(() => ({
      takeoffCount: window.__opentakeoff?.takeoffRowCount?.() ?? null,
      last: window.__opentakeoff?.lastCorpusTakeoff?.() ?? null,
      thread: [...document.querySelectorAll("[data-agent-thread], .agent-thread, [class*='Agent']")].slice(0, 1).map((n) => n.innerText?.slice(0, 500)),
      bodySnippet: document.body?.innerText?.slice(0, 1500),
    }));
    writeFileSync(resolve(artifacts, `${outBase}_FAIL_diag.json`), JSON.stringify(diag, null, 2));
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL.png`), fullPage: true });
    await context.close();
    await browser.close();
    throw new Error(`[${job.label}] TakeoffDataPanel never showed live rows within timeout. See ${outBase}_FAIL*`);
  }

  // Assert compiled lines exist (Takeoff tab is default).
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => {
    const panel = document.querySelector('[aria-label="Takeoff"]');
    const text = panel?.innerText || "";
    const lineMatch = text.match(/(\d+)\s+lines?/i);
    const evidenceMatch = text.match(/(\d+)\s+evidence/i);
    const eaMatch = text.match(/·\s*(\d+)\s+EA/i);
    const meta = window.__opentakeoff?.lastCorpusTakeoff?.() || null;
    return {
      textHead: text.slice(0, 400),
      lines: lineMatch ? Number(lineMatch[1]) : 0,
      evidence: evidenceMatch ? Number(evidenceMatch[1]) : 0,
      ea: eaMatch ? Number(eaMatch[1]) : null,
      meta,
      rowCount: window.__opentakeoff?.takeoffRowCount?.() ?? 0,
    };
  });
  console.log(`[${job.label}] panel stats`, JSON.stringify(stats));

  if (stats.lines < job.expectMinLines && stats.rowCount < job.expectMinLines) {
    await page.screenshot({ path: resolve(artifacts, `${outBase}_FAIL_low_count.png`), fullPage: true });
    await context.close();
    await browser.close();
    throw new Error(`[${job.label}] Too few takeoff lines (${stats.lines} lines / ${stats.rowCount} evidence); expected ≥ ${job.expectMinLines}`);
  }

  // Screenshot Takeoff tab (finished takeoff).
  await page.screenshot({ path: resolve(artifacts, `${outBase}_takeoff_tab.png`) });

  // Switch to Workflow data tab (aggregate).
  const wfTab = page.locator('button', { hasText: /^Workflow data$/ });
  if (await wfTab.count()) {
    await wfTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(artifacts, `${outBase}_workflow_tab.png`) });
  }

  // Brief hold so the video shows the finished panel.
  await page.waitForTimeout(3000);

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
    path: "REAL Agent Run — frozen prompt, no seed, no programmatic compile",
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
