#!/usr/bin/env node
/**
 * Production journey proof for the one-prompt BAS coordinator.
 *
 * Fresh browser -> upload a real multi-page plan set -> type exactly
 * "Run a BAS takeoff." -> wait for the live Agent -> inspect the persisted
 * run receipt -> inspect cited Takeoff and workflow UI -> export CSV.
 *
 * No direct compile hook, seeded graph, mocked model, or test-only tool call.
 */
import { chromium } from "playwright";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openImportedSheet } from "./fixtures/open-imported-sheet.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const corpusRoot = resolve(repoRoot, "../opentakeoff-corpus");
const pdf = process.env.OT_COMPLETE_BAS_PDF
  || resolve(corpusRoot, "raw/navfac-cherry-point-atc-mechanical.pdf");
const outDir = process.env.OT_COMPLETE_BAS_OUT || "/tmp/opentakeoff-complete-bas-agent";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const timeoutMs = Number(process.env.OT_COMPLETE_BAS_TIMEOUT_MS || 35 * 60 * 1000);
const postIndexSlaMs = Number(process.env.OT_COMPLETE_BAS_SLA_MS || 3 * 60 * 1000);
const minimums = {
  point_lists: Number(process.env.OT_COMPLETE_BAS_MIN_POINT_LISTS ?? 1),
  sequences: Number(process.env.OT_COMPLETE_BAS_MIN_SEQUENCES ?? 1),
  control_schematics: Number(process.env.OT_COMPLETE_BAS_MIN_SCHEMATICS ?? 1),
  riser_diagrams: Number(process.env.OT_COMPLETE_BAS_MIN_RISERS ?? 1),
};
const prompt = "Run a BAS takeoff.";

if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);
mkdirSync(outDir, { recursive: true });
const videoDir = resolve(outDir, `video-${Date.now()}`);
mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({
  headless: process.env.OT_HEADLESS !== "0",
  executablePath: process.env.OT_BROWSER_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=8192"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
  recordVideo: { dir: videoDir, size: { width: 1600, height: 1000 } },
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.addInitScript(() => {
  // Exercise the product's default same-origin /cerebras-api path. The key
  // stays in the Vite process environment and never enters browser storage,
  // screenshots, videos, run history, or this proof artifact.
  localStorage.clear();
});

const waitForAgent = async () => {
  const deadline = Date.now() + timeoutMs;
  let sawRunning = false;
  let previousStatus = "";
  while (Date.now() < deadline) {
    const state = await page.evaluate(async () => {
      const status = document.querySelector("[data-agent-status]")?.textContent?.trim() || "";
      const running = [...document.querySelectorAll("button")]
        .some((button) => /■\s*Stop/.test(button.textContent || ""));
      const runs = await import("/src/lib/runHistory.js").then((module) => module.listRuns());
      return { status, running, latest: runs[0] || null };
    });
    if (state.running) sawRunning = true;
    if (state.status && state.status !== previousStatus) {
      previousStatus = state.status;
      console.log(`[agent] ${state.status}`);
    }
    if (sawRunning && !state.running && state.latest?.finished_at) return state.latest;
    await page.waitForTimeout(1500);
  }
  throw new Error(`Agent did not finish in ${Math.round(timeoutMs / 60000)} minutes; last status: ${previousStatus || "none"}`);
};

let run;
let summary;
let promptStartedAt = 0;
try {
  console.log(`[journey] open ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached" });
  console.log(`[journey] upload ${pdf}`);
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(
    () => window.__opentakeoff?.indexProgress?.()?.phase === "ready",
    null,
    { timeout: 5 * 60 * 1000 },
  );
  await openImportedSheet(page);

  const agentButton = page.locator('[data-workspace-nav="Agent"], button[title*="Agent — describe a takeoff"]').first();
  if (await agentButton.count()) await agentButton.click();
  else await page.evaluate(() => window.__opentakeoff.openAgent());
  await page.waitForSelector('textarea[name="agent-goal"]');
  await page.locator('textarea[name="agent-goal"]').fill(prompt);
  console.log(`[journey] prompt: ${prompt}`);
  promptStartedAt = Date.now();
  await page.locator('button.btn-primary', { hasText: /^Run$/ }).click();
  run = await waitForAgent();
  const postIndexElapsedMs = Date.now() - promptStartedAt;
  const persistedElapsedMs = Number(run.finished_at) - Number(run.started_at);
  if (postIndexElapsedMs > postIndexSlaMs) {
    throw new Error(`Post-index Agent run exceeded SLA: ${postIndexElapsedMs} ms > ${postIndexSlaMs} ms`);
  }
  await page.waitForTimeout(1000);

  const completeEnds = (run.tool_calls || []).filter(
    (event) => event.type === "tool_end" && event.name === "run_complete_bas_takeoff",
  );
  if (run.status !== "done") throw new Error(`Persisted Agent run status is ${run.status}`);
  if (completeEnds.length !== 1) {
    throw new Error(`Expected exactly one run_complete_bas_takeoff receipt; got ${completeEnds.length}`);
  }
  const receipt = completeEnds[0].result;
  writeFileSync(resolve(outDir, "receipt-debug.json"), JSON.stringify(receipt, null, 2));
  console.log(`[journey] receipt ${receipt?.execution_status || "missing"}: ${JSON.stringify(receipt?.stages || {})}`);
  if (receipt?.error || receipt?.execution_status !== "completed") {
    throw new Error(`Complete BAS receipt is not completed: ${JSON.stringify(receipt?.error || receipt?.execution_status)}`);
  }
  const expectedOrder = [
    "hvac_equipment", "bas_points", "sequences", "control_valves", "embedded_coil_gaps",
  ];
  if (JSON.stringify(receipt.compile_order) !== JSON.stringify(expectedOrder)) {
    throw new Error(`Compile order drifted: ${JSON.stringify(receipt.compile_order)}`);
  }
  const expectedAnalysisOrder = ["control_schematics_and_risers", "schedule_plan_reconcile"];
  if (JSON.stringify(receipt.analysis_order) !== JSON.stringify(expectedAnalysisOrder)) {
    throw new Error(`Analysis order drifted: ${JSON.stringify(receipt.analysis_order)}`);
  }
  const controls = receipt.control_schematics;
  if (controls?.schema_version !== "opentakeoff.control_schematic.v1") {
    throw new Error("The complete run has no shared control-schematic result.");
  }
  if (Number(controls.totals?.schematics || 0) < minimums.control_schematics) {
    throw new Error(`Expected at least ${minimums.control_schematics} control schematics; got ${controls.totals?.schematics || 0}.`);
  }
  if (Number(controls.totals?.riser_diagrams || 0) < minimums.riser_diagrams) {
    throw new Error(`Expected at least ${minimums.riser_diagrams} riser/flow diagrams; got ${controls.totals?.riser_diagrams || 0}.`);
  }
  const sequenceCount = Number(receipt.compiles?.sequences?.totals?.sequences || 0);
  const sequenceListCount = receipt.compiles?.sequences?.list_counts?.length || 0;
  const pointListCount = Number(receipt.compiles?.bas_points?.totals?.lists || 0);
  const pointListSummaryCount = receipt.compiles?.bas_points?.list_counts?.length || 0;
  const compiledTakeoffRows = [
    receipt.compiles?.hvac_equipment?.totals?.items,
    receipt.compiles?.bas_points?.totals?.rows,
    receipt.compiles?.sequences?.totals?.sections,
    receipt.compiles?.control_valves?.totals?.items,
    receipt.compiles?.embedded_coil_gaps?.totals?.gaps,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
  if (sequenceCount < minimums.sequences) {
    throw new Error(`Expected at least ${minimums.sequences} sequence-of-operations blocks; got ${sequenceCount}.`);
  }
  if (pointListCount < minimums.point_lists) {
    throw new Error(`Expected at least ${minimums.point_lists} point lists; got ${pointListCount}.`);
  }
  if (sequenceListCount !== sequenceCount) {
    throw new Error(`Sequence summary disagrees with totals: ${sequenceListCount} != ${sequenceCount}`);
  }
  if (pointListSummaryCount !== pointListCount) {
    throw new Error(`Point-list summary disagrees with totals: ${pointListSummaryCount} != ${pointListCount}`);
  }
  if (Object.keys(receipt.inspections || {}).length !== 5) {
    throw new Error(`Expected five BAS workflow inspections; got ${Object.keys(receipt.inspections || {}).length}`);
  }
  for (const [domain, inspection] of Object.entries(receipt.inspections || {})) {
    const stage = receipt.stages?.[domain];
    if (!stage) throw new Error(`Workflow inspection ${domain} has no orchestration stage.`);
    if (inspection?.status === "unavailable" && stage.status !== "refused") {
      throw new Error(`${domain} is unavailable but its stage says ${stage.status}.`);
    }
    if (inspection?.status !== "unavailable" && stage.status !== "partial") {
      throw new Error(`${domain} is ${inspection?.status} but its stage says ${stage.status}; inspection is not workflow completion.`);
    }
  }
  const crossingBlocker = (controls.engineering_readiness?.blockers || [])
    .find((blocker) => blocker.code === "UNRESOLVED_DIAGRAM_CROSSINGS")?.count || 0;
  if (Number(controls.totals?.unresolved_crossings || 0) !== Number(crossingBlocker)) {
    throw new Error(`Control crossing totals disagree: ${controls.totals?.unresolved_crossings} != ${crossingBlocker}`);
  }
  if (receipt.release_status !== "human_review_required" || receipt.human_review_required !== true) {
    throw new Error("The Agent bypassed the mandatory human release gate.");
  }
  if (!receipt.reconcile?.summary) throw new Error("The complete run has no schedule-plan reconciliation summary.");

  await page.screenshot({ path: resolve(outDir, "01-agent-result.png"), fullPage: true });
  const agentText = await page.locator(".agent-workspace").innerText().catch(() => "");
  writeFileSync(resolve(outDir, "agent-result.txt"), agentText);
  if (/all five (?:deterministic )?(?:workflows?|stages?).{0,40}complete/i.test(agentText)) {
    throw new Error("Agent falsely described all five human-review workflows as complete.");
  }
  if (Number(receipt.reconcile?.summary?.refused_no_scale || 0) === 0
      && /(?:because|due to|caused by|blocked by) (?:a )?(?:missing|absent|unset) scale/i.test(agentText)) {
    throw new Error("Agent invented a missing-scale explanation absent from reconciliation evidence.");
  }

  await page.evaluate(() => window.__opentakeoff.openTakeoff());
  await page.waitForSelector('[aria-label="Takeoff"]');
  await page.waitForTimeout(750);
  const panel = page.locator('[aria-label="Takeoff"]');
  const resultTab = panel.locator("button", { hasText: /^Takeoff$/ }).first();
  if (await resultTab.count()) {
    await resultTab.click();
    await page.waitForTimeout(500);
  }
  const panelFacts = await panel.evaluate((element) => {
    const text = element.innerText || "";
    return {
      text: text.slice(0, 2500),
      citeRows: element.querySelectorAll('[data-takeoff-cite="row"]').length,
      citeTables: element.querySelectorAll('[data-takeoff-cite="table"]').length,
      hasObjectObject: /\[object Object\]/i.test(text),
      hasScheduledQty: /Scheduled qty/i.test(text),
      hasInstalledQty: /Installed qty/i.test(text),
      hasStatus: /\bStatus\b/i.test(text),
      hasEmptyState: /(?:\b0\s+lines?\b|no\s+(?:takeoff\s+)?(?:lines?|rows?|results?))/i.test(text),
      hasCompleteBasHeading: /BAS PROJECT TAKEOFF/i.test(text),
      hasLastSubcompileHeading: /T-VALVE-EMBEDDED-01/i.test(text),
    };
  });
  if (panelFacts.hasObjectObject) throw new Error("Takeoff UI rendered [object Object].");
  if (!panelFacts.hasCompleteBasHeading || panelFacts.hasLastSubcompileHeading) {
    throw new Error("The consolidated Takeoff workspace is mislabeled as a subcompiler result.");
  }
  if (Number(receipt.reconcile?.summary?.total || 0) > 0
      && (!panelFacts.hasScheduledQty || !panelFacts.hasInstalledQty || !panelFacts.hasStatus)) {
    throw new Error("Takeoff UI is missing scheduled/installed/status reconciliation columns.");
  }
  if (compiledTakeoffRows > 0 && (panelFacts.citeRows < 1 || panelFacts.citeTables < 1)) {
    throw new Error(`Takeoff citations are incomplete: rows=${panelFacts.citeRows}, tables=${panelFacts.citeTables}`);
  }
  if (compiledTakeoffRows === 0 && !panelFacts.hasEmptyState) {
    throw new Error("Evidence-poor takeoff did not render a truthful empty-result state.");
  }
  await page.screenshot({ path: resolve(outDir, "02-takeoff-table.png"), fullPage: true });

  const workflow = panel.locator("button", { hasText: /^Workflow data$/ });
  if (await workflow.count()) {
    await workflow.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: resolve(outDir, "03-workflow-review.png"), fullPage: true });

  const takeoffTab = panel.locator("button", { hasText: /^Takeoff$/ });
  if (await takeoffTab.count()) await takeoffTab.click();
  const csvButton = panel.locator("button", { hasText: /^CSV$/ }).first();
  let csvHeader = null;
  const csvEnabled = await csvButton.isEnabled().catch(() => false);
  if (compiledTakeoffRows > 0 && csvEnabled) {
    const [download] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
    const csvPath = resolve(outDir, "complete-bas-takeoff.csv");
    await download.saveAs(csvPath);
    csvHeader = readFileSync(csvPath, "utf8").split(/\r?\n/, 1)[0];
    const requiredCsvColumns = ["Qty basis", "Quantity evidence", "Scheduled qty", "Installed qty", "Status"];
    if (requiredCsvColumns.some((column) => !csvHeader.split(",").includes(column))) {
      throw new Error(`CSV lacks quantity provenance: ${csvHeader}`);
    }
  } else if (compiledTakeoffRows > 0) {
    throw new Error("Non-empty takeoff did not expose a CSV export.");
  } else if (csvEnabled) {
    throw new Error("Empty takeoff exposed an active CSV export action.");
  }

  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join(" | ")}`);
  summary = {
    ok: true,
    prompt,
    source_pdf: pdf,
    run_status: run.status,
    execution_status: receipt.execution_status,
    timing: {
      post_index_prompt_to_finish_ms: postIndexElapsedMs,
      persisted_run_ms: Number.isFinite(persistedElapsedMs) ? persistedElapsedMs : null,
      sla_ms: postIndexSlaMs,
      within_sla: true,
    },
    compile_order: receipt.compile_order,
    analysis_order: receipt.analysis_order,
    evidence_coverage: {
      minimums,
      compiled_takeoff_rows: compiledTakeoffRows,
      point_lists: pointListCount,
      sequences: sequenceCount,
      control_schematics: controls.totals.schematics,
      riser_diagrams: controls.totals.riser_diagrams,
      explicit_schematic_point_tokens: controls.totals.explicit_points,
      unresolved_crossings: controls.totals.unresolved_crossings,
    },
    compile_summaries: Object.fromEntries(Object.entries(receipt.compiles || {}).map(([kind, value]) => [kind, {
      takeoff_id: value?.takeoff_id || null,
      totals: value?.totals || null,
      category_count: value?.category_count ?? null,
    }])),
    reconciliation: receipt.reconcile,
    inspection_domains: Object.keys(receipt.inspections || {}),
    release_status: receipt.release_status,
    panel: panelFacts,
    csv_header: csvHeader,
    page_errors: pageErrors,
    console_errors: consoleErrors.slice(0, 20),
    artifacts: ["01-agent-result.png", "02-takeoff-table.png", "03-workflow-review.png", "complete-bas-takeoff.csv"]
      .filter((name) => existsSync(resolve(outDir, name))),
  };
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`[journey] PASS — ${resolve(outDir, "summary.json")}`);
} catch (error) {
  await page.screenshot({ path: resolve(outDir, "FAIL.png"), fullPage: true }).catch(() => {});
  writeFileSync(resolve(outDir, "failure.txt"), `${error?.stack || error}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
  const videos = readdirSync(videoDir).filter((name) => name.endsWith(".webm"));
  if (videos.length) copyFileSync(resolve(videoDir, videos[0]), resolve(outDir, "journey.webm"));
}
