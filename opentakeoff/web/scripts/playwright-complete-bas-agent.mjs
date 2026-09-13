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
  soo_point_candidates: Number(process.env.OT_COMPLETE_BAS_MIN_SOO_POINT_CANDIDATES ?? 1),
  control_schematics: Number(process.env.OT_COMPLETE_BAS_MIN_SCHEMATICS ?? 1),
  riser_diagrams: Number(process.env.OT_COMPLETE_BAS_MIN_RISERS ?? 1),
};
const requiredSooTag = process.env.OT_COMPLETE_BAS_REQUIRED_SOO_TAG === undefined
  ? "PH-DA-T-LL" : process.env.OT_COMPLETE_BAS_REQUIRED_SOO_TAG;
const requiredSequenceTitle = process.env.OT_COMPLETE_BAS_REQUIRED_SEQUENCE_TITLE || "";
const requiredSchematicTitle = process.env.OT_COMPLETE_BAS_REQUIRED_SCHEMATIC_TITLE || "";
const requiredSchematicSequenceTitle = process.env.OT_COMPLETE_BAS_REQUIRED_SCHEMATIC_SEQUENCE_TITLE || "";
const forbiddenSequenceText = (process.env.OT_COMPLETE_BAS_FORBIDDEN_SEQUENCE_TEXT || "")
  .split("||").map((value) => value.trim()).filter(Boolean);
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
  // The estimator's three-minute clock starts after both the browser text
  // pages AND the shared Session+ODL schedule index are ready. Waiting for
  // only the former silently charged cold schedule extraction to the Agent
  // and could launch a duplicate graph build while the prewarm was active.
  await page.waitForFunction(
    () => window.__opentakeoff?.graphPrewarm?.()?.phase === "ready",
    null,
    { timeout: 10 * 60 * 1000 },
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
  writeFileSync(resolve(outDir, "run-debug.json"), JSON.stringify(run, null, 2));

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
  let requiredSchematicBinding = null;
  if (requiredSchematicTitle) {
    const schematic = (controls.schematics || []).find((item) => item.title === requiredSchematicTitle);
    if (!schematic) throw new Error(`Required control schematic is absent: ${requiredSchematicTitle}`);
    if (requiredSchematicSequenceTitle && !(schematic.sequence_refs || []).some((item) => item.title === requiredSchematicSequenceTitle)) {
      throw new Error(`Required schematic ${requiredSchematicTitle} is not bound to ${requiredSchematicSequenceTitle}.`);
    }
    requiredSchematicBinding = {
      title: schematic.title,
      sheet: schematic.sheet,
      status: schematic.sequence_binding_status,
      sequence_titles: (schematic.sequence_refs || []).map((item) => item.title),
      instrument_labels: (schematic.instruments || []).map((item) => item.label),
    };
  }
  const sequenceCount = Number(receipt.compiles?.sequences?.totals?.sequences || 0);
  const sequenceListCount = receipt.compiles?.sequences?.list_counts?.length || 0;
  const pointListCount = Number(receipt.compiles?.bas_points?.totals?.lists || 0);
  const pointListSummaryCount = receipt.compiles?.bas_points?.list_counts?.length || 0;
  // The consolidated workspace contains several explicitly labeled record
  // domains. SOO sections remain grounded requirements in the sequence reader,
  // not equipment rows with an invented quantity of one. Prove both surfaces
  // independently without calling their mixed cardinality an installed count.
  const compiledRecordCount = [
    receipt.compiles?.hvac_equipment?.totals?.items,
    receipt.compiles?.bas_points?.totals?.rows,
    receipt.compiles?.control_valves?.totals?.items,
    receipt.compiles?.embedded_coil_gaps?.totals?.gaps,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
  const sequenceSectionCount = Number(receipt.compiles?.sequences?.totals?.sections || 0);
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
  const pointSooMetrics = Object.fromEntries((receipt.inspections?.point_soo?.metrics || [])
    .map((metric) => [metric.key, metric.value]));
  const sooPointCandidateCount = Number(pointSooMetrics.soo_labeled_point_candidates || 0);
  if (sooPointCandidateCount < minimums.soo_point_candidates) {
    throw new Error(`Expected at least ${minimums.soo_point_candidates} exact labeled SOO point candidates; got ${sooPointCandidateCount}.`);
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

  const agentText = await page.locator(".agent-workspace").innerText().catch(() => "");
  writeFileSync(resolve(outDir, "agent-result.txt"), agentText);
  const topTakeoffBadge = await page.locator('[data-workspace-nav="Takeoff"] small').innerText().catch(() => "");
  const agentTakeoffBadge = await page.locator('.agent-workspace button[title^="Open Takeoff panel"]').innerText().catch(() => "");
  if (topTakeoffBadge.trim().toLowerCase() !== "ready" || !/Takeoff\s*·\s*ready/i.test(agentTakeoffBadge)) {
    throw new Error(`Complete BAS navigation exposed a mixed row count: top=${JSON.stringify(topTakeoffBadge)}, agent=${JSON.stringify(agentTakeoffBadge)}`);
  }
  if (/all five (?:deterministic )?(?:workflows?|stages?).{0,40}complete/i.test(agentText)) {
    throw new Error("Agent falsely described all five human-review workflows as complete.");
  }
  if (Number(receipt.reconcile?.summary?.refused_no_scale || 0) === 0
      && /(?:because|due to|caused by|blocked by) (?:a )?(?:missing|absent|unset) scale/i.test(agentText)) {
    throw new Error("Agent invented a missing-scale explanation absent from reconciliation evidence.");
  }

  // The complete run opens Takeoff automatically. Close it for one truthful
  // answer screenshot, then reopen it below for the result/workspace proofs.
  const autoOpenedTakeoff = page.locator('[aria-label="Takeoff"]');
  if (await autoOpenedTakeoff.isVisible().catch(() => false)) {
    await autoOpenedTakeoff.getByRole("button", { name: "Close takeoff", exact: true }).click();
    await autoOpenedTakeoff.waitFor({ state: "hidden" });
  }
  await page.screenshot({ path: resolve(outDir, "01-agent-result.png"), fullPage: true });

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
    const groupRail = element.querySelector("[data-takeoff-group-rail]");
    const resultRows = [...element.querySelectorAll("section table tbody > tr")];
    return {
      text: text.slice(0, 2500),
      citeRows: element.querySelectorAll('[data-takeoff-cite="row"]').length,
      citeTables: element.querySelectorAll('[data-takeoff-cite="table"]').length,
      hasObjectObject: /\[object Object\]/i.test(text),
      hasScheduledQty: /Scheduled qty/i.test(text),
      hasInstalledQty: /Installed qty/i.test(text),
      hasStatus: /\bStatus\b/i.test(text),
      hasEmptyState: /(?:\b0\s+lines?\b|no\s+(?:quantity-bearing\s+schedule\s+|takeoff\s+)?(?:lines?|rows?|results?))/i.test(text),
      hasCompleteBasHeading: /BAS PROJECT TAKEOFF/i.test(text),
      hasLastSubcompileHeading: /T-VALVE-EMBEDDED-01/i.test(text),
      hasMixedAggregateEa: Boolean(element.querySelector("[data-takeoff-ea]")),
      resultGroupRail: groupRail ? {
        groups: Number(groupRail.getAttribute("data-takeoff-group-rail") || 0),
        height_px: Math.round(groupRail.getBoundingClientRect().height),
      } : null,
      maxCollapsedResultRowHeight: resultRows.length
        ? Math.round(Math.max(...resultRows.slice(0, 20).map((row) => row.getBoundingClientRect().height)))
        : null,
      coverage: {
        equipment_records: Number(element.querySelector("[data-bas-equipment-records]")?.getAttribute("data-bas-equipment-records") || 0),
        point_lists: Number(element.querySelector("[data-bas-point-lists]")?.getAttribute("data-bas-point-lists") || 0),
        point_rows: Number(element.querySelector("[data-bas-point-rows]")?.getAttribute("data-bas-point-rows") || 0),
        point_type_review_rows: Number(element.querySelector("[data-bas-point-lists]")?.getAttribute("data-bas-point-type-review-rows") || 0),
        sequences: Number(element.querySelector("[data-takeoff-sequences]")?.getAttribute("data-takeoff-sequences") || 0),
        soo_point_candidates: Number(element.querySelector("[data-bas-soo-point-candidates]")?.getAttribute("data-bas-soo-point-candidates") || 0),
        valve_records: Number(element.querySelector("[data-bas-valve-records]")?.getAttribute("data-bas-valve-records") || 0),
        schematics: Number(element.querySelector("[data-bas-schematics]")?.getAttribute("data-bas-schematics") || 0),
        risers: Number(element.querySelector("[data-bas-risers]")?.getAttribute("data-bas-risers") || 0),
        reconcile_rows: Number(element.querySelector("[data-bas-reconcile-rows]")?.getAttribute("data-bas-reconcile-rows") || 0),
        reconcile_matches: Number(element.querySelector("[data-bas-reconcile-matches]")?.getAttribute("data-bas-reconcile-matches") || 0),
      },
    };
  });
  if (panelFacts.hasObjectObject) throw new Error("Takeoff UI rendered [object Object].");
  if (!panelFacts.hasCompleteBasHeading || panelFacts.hasLastSubcompileHeading) {
    throw new Error("The consolidated Takeoff workspace is mislabeled as a subcompiler result.");
  }
  if (panelFacts.hasMixedAggregateEa) {
    throw new Error("The complete BAS header mixed equipment, point, SOO or reconciliation cardinalities into one EA quantity.");
  }
  if (panelFacts.resultGroupRail?.groups > 1 && panelFacts.resultGroupRail.height_px > 64) {
    throw new Error(`The takeoff result-group rail wrapped over the table (${panelFacts.resultGroupRail.height_px}px tall).`);
  }
  if (panelFacts.maxCollapsedResultRowHeight != null && panelFacts.maxCollapsedResultRowHeight > 96) {
    throw new Error(`Collapsed takeoff rows are not scan-dense (${panelFacts.maxCollapsedResultRowHeight}px tall).`);
  }
  const presentedCoverage = receipt.presentation?.coverage || {};
  const expectedPanelCoverage = {
    equipment_records: Number(presentedCoverage.equipment_items || 0),
    point_lists: Number(presentedCoverage.point_lists || 0),
    point_rows: Number(presentedCoverage.point_rows || 0),
    point_type_review_rows: Number(presentedCoverage.point_type_review_rows || 0),
    sequences: Number(presentedCoverage.sequences || 0),
    soo_point_candidates: Number(presentedCoverage.soo_point_candidates || 0),
    valve_records: Number(presentedCoverage.control_valve_items || 0),
    schematics: Number(presentedCoverage.control_schematics || 0),
    risers: Number(presentedCoverage.riser_diagrams || 0),
    reconcile_rows: Number(presentedCoverage.reconcile_rows || 0),
    reconcile_matches: Number(presentedCoverage.reconcile_match || 0),
  };
  if (JSON.stringify(panelFacts.coverage) !== JSON.stringify(expectedPanelCoverage)) {
    throw new Error(`Takeoff header coverage disagrees with the deterministic receipt: ${JSON.stringify(panelFacts.coverage)} != ${JSON.stringify(expectedPanelCoverage)}`);
  }
  if (Number(receipt.reconcile?.summary?.total || 0) > 0
      && (!panelFacts.hasScheduledQty || !panelFacts.hasInstalledQty || !panelFacts.hasStatus)) {
    throw new Error("Takeoff UI is missing scheduled/installed/status reconciliation columns.");
  }
  if (compiledRecordCount > 0 && (panelFacts.citeRows < 1 || panelFacts.citeTables < 1)) {
    throw new Error(`Takeoff citations are incomplete: rows=${panelFacts.citeRows}, tables=${panelFacts.citeTables}`);
  }
  if (compiledRecordCount === 0 && !panelFacts.hasEmptyState) {
    throw new Error("Evidence-poor takeoff did not render a truthful empty-result state.");
  }
  await page.screenshot({ path: resolve(outDir, "02-takeoff-table.png"), fullPage: true });

  let matchedSourceComparison = null;
  if (Number(receipt.reconcile?.summary?.match || 0) > 0) {
    const planAction = 'button[title^="Open the grounded plan match on "]';
    const scheduleAction = 'button[title^="Open the source schedule row on "]';
    const matchedRow = panel.locator("tbody > tr").filter({
      has: page.locator(planAction),
    }).first();
    const planButton = matchedRow.locator(planAction);
    const scheduleButton = matchedRow.locator(scheduleAction);
    const compareButton = matchedRow.locator('[data-source-comparison-action="compare"]');
    if (!await planButton.count() || !await scheduleButton.count()) {
      throw new Error("A reconciled MATCH row does not expose both schedule-row and plan-match evidence actions.");
    }
    if (!await compareButton.count()) {
      throw new Error("A reconciled MATCH row does not expose the side-by-side source comparison action.");
    }
    const rowTag = (await matchedRow.locator("td").first().innerText()).trim();
    const planTitle = await planButton.getAttribute("title") || "";
    const scheduleTitle = await scheduleButton.getAttribute("title") || "";
    const expectedPlanSheet = planTitle.replace(/^Open the grounded plan match on\s+/, "").trim();
    const expectedScheduleSheet = scheduleTitle.replace(/^Open the source schedule row on\s+/, "").trim();
    if (!expectedPlanSheet || !expectedScheduleSheet || expectedPlanSheet === planTitle || expectedScheduleSheet === scheduleTitle) {
      throw new Error(`Matched source actions do not identify their exact sheets: plan=${JSON.stringify(planTitle)}, schedule=${JSON.stringify(scheduleTitle)}`);
    }

    await compareButton.click();
    const comparison = panel.getByRole("region", { name: "Matched plan and schedule evidence", exact: true });
    await comparison.waitFor();
    const comparisonState = await comparison.evaluate((element) => ({
      tag: element.getAttribute('data-comparison-tag'),
      sheets: [element.getAttribute('data-plan-sheet'), element.getAttribute('data-schedule-sheet')],
      images: [...element.querySelectorAll('img')].map((image) => ({
        natural_width: image.naturalWidth, natural_height: image.naturalHeight, alt: image.alt,
      })),
    }));
    if (comparisonState.sheets[0] !== expectedPlanSheet || comparisonState.sheets[1] !== expectedScheduleSheet
        || comparisonState.images.length !== 2
        || comparisonState.images.some((image) => image.natural_width < 500 || image.natural_height < 250)) {
      throw new Error(`Matched source comparison is not a legible two-source view: ${JSON.stringify(comparisonState)}`);
    }
    await page.screenshot({ path: resolve(outDir, "02-source-comparison.png"), fullPage: true });

    await comparison.getByRole("button", { name: /Back to takeoff$/ }).click();
    const comparisonResultTab = panel.locator("button", { hasText: /^Takeoff$/ }).first();
    if (await comparisonResultTab.count()) await comparisonResultTab.click();
    const comparisonRow = panel.locator("tbody > tr").filter({ hasText: rowTag }).filter({
      has: page.locator(planAction),
    }).first();

    await comparisonRow.locator(planAction).click();
    await panel.waitFor({ state: "hidden" });
    await page.waitForFunction((sheet) => {
      const marks = window.__opentakeoff?.probe?.markups?.() || [];
      const latest = [...marks].reverse().find((mark) => mark.source === "takeoff_cite");
      return latest?.sheet_id === sheet;
    }, expectedPlanSheet);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, "02a-plan-match-source.png"), fullPage: true });
    const planMarkup = await page.evaluate(() => {
      const marks = window.__opentakeoff?.probe?.markups?.() || [];
      return [...marks].reverse().find((mark) => mark.source === "takeoff_cite") || null;
    });

    await page.evaluate(() => window.__opentakeoff.openTakeoff());
    await panel.waitFor({ state: "visible" });
    const reopenedResultTab = panel.locator("button", { hasText: /^Takeoff$/ }).first();
    if (await reopenedResultTab.count()) await reopenedResultTab.click();
    const reopenedRow = panel.locator("tbody > tr").filter({ hasText: rowTag }).filter({
      has: page.locator(planAction),
    }).first();
    const reopenedScheduleButton = reopenedRow.locator(scheduleAction);
    if (!await reopenedScheduleButton.count()) throw new Error(`Could not reopen matched row ${JSON.stringify(rowTag)} for its schedule evidence.`);
    await reopenedScheduleButton.click();
    await panel.waitFor({ state: "hidden" });
    await page.waitForFunction((sheet) => {
      const marks = window.__opentakeoff?.probe?.markups?.() || [];
      const latest = [...marks].reverse().find((mark) => mark.source === "takeoff_cite");
      return latest?.sheet_id === sheet;
    }, expectedScheduleSheet);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, "02b-schedule-row-source.png"), fullPage: true });
    const scheduleMarkup = await page.evaluate(() => {
      const marks = window.__opentakeoff?.probe?.markups?.() || [];
      return [...marks].reverse().find((mark) => mark.source === "takeoff_cite") || null;
    });
    matchedSourceComparison = {
      row_tag: rowTag,
      plan_sheet: expectedPlanSheet,
      plan_highlight_sheet: planMarkup?.sheet_id || null,
      schedule_sheet: expectedScheduleSheet,
      schedule_highlight_sheet: scheduleMarkup?.sheet_id || null,
      distinct_sources: expectedPlanSheet !== expectedScheduleSheet,
      side_by_side_sheets: comparisonState.sheets,
      side_by_side_previews: comparisonState.images,
    };

    await page.evaluate(() => window.__opentakeoff.openTakeoff());
    await panel.waitFor({ state: "visible" });
  }

  let sequenceReaderFacts = null;
  if (sequenceCount > 0) {
    const reviewSequences = panel.getByRole("button", { name: "Review sequences", exact: true });
    if (await reviewSequences.count()) {
      await reviewSequences.click();
    } else {
      const pointsTab = panel.getByRole("button", { name: "Point lists", exact: true });
      if (!await pointsTab.count()) throw new Error("Grounded sequences exist but the BAS evidence workspace is unavailable.");
      await pointsTab.click();
      const sequencesButton = panel.getByRole("button", { name: "Sequences & links", exact: true });
      await sequencesButton.waitFor();
      await sequencesButton.click();
    }
    const sequenceWorkspace = panel.getByRole("region", { name: "Sequences and comparison links", exact: true });
    await sequenceWorkspace.waitFor();
    const sequenceSelect = sequenceWorkspace.getByLabel("Sequence", { exact: true });
    await sequenceSelect.waitFor();
    const optionCount = await sequenceSelect.locator("option").count();
    const readerCounts = await sequenceWorkspace.locator("[data-sequence-reader-summary]").evaluate((element) => ({
      body: Number(element.getAttribute("data-sequence-body-count")),
      review: Number(element.getAttribute("data-sequence-review-count")),
    }));
    if (minimums.soo_point_candidates > 0 || requiredSooTag) {
      const optionValues = await sequenceSelect.locator("option").evaluateAll((options) =>
        options.map((option) => option.value));
      let foundCandidateSequence = false;
      for (const value of optionValues) {
        await sequenceSelect.selectOption(value);
        await page.waitForTimeout(50);
        const candidateButtons = await sequenceWorkspace.getByRole("button", { name: "View point source", exact: true }).count();
        const candidateText = requiredSooTag ? await sequenceWorkspace.innerText() : "";
        if (candidateButtons > 0 && (!requiredSooTag || candidateText.includes(requiredSooTag))) {
          foundCandidateSequence = true;
          break;
        }
      }
      if (!foundCandidateSequence) {
        throw new Error(requiredSooTag
          ? `No grounded sequence exposes the required exact SOO point source ${requiredSooTag}.`
          : "No grounded sequence exposes an exact labeled-point source action.");
      }
    }
    if (requiredSequenceTitle) {
      const options = await sequenceSelect.locator("option").evaluateAll((items) =>
        items.map((option) => ({ value: option.value, label: option.textContent?.trim() || "" })));
      const target = options.find(({ label }) => label.includes(requiredSequenceTitle));
      if (!target) throw new Error(`Required sequence is absent from the reader: ${requiredSequenceTitle}`);
      await sequenceSelect.selectOption(target.value);
      await page.waitForTimeout(50);
    }
    const clauseTable = sequenceWorkspace.getByRole("table", { name: "Source sequence clauses", exact: true });
    const clauseRows = await clauseTable.locator("tbody > tr").count();
    const sourceButtons = await sequenceWorkspace.getByRole("button", { name: "View source", exact: true }).count();
    const pointSourceButtons = sequenceWorkspace.getByRole("button", { name: "View point source", exact: true });
    const pointSourceButtonCount = await pointSourceButtons.count();
    const viewSequenceEnabled = await sequenceWorkspace.getByRole("button", { name: "View sequence on drawing", exact: true }).isEnabled();
    if (readerCounts.body !== sequenceCount || optionCount !== readerCounts.body + readerCounts.review) {
      const labels = await sequenceSelect.locator("option").allTextContents();
      throw new Error(`Sequence reader disagrees with compile: ${readerCounts.body} bodies + ${readerCounts.review} review candidates = ${optionCount} options, but compile has ${sequenceCount} sequences. Options: ${JSON.stringify(labels)}`);
    }
    if (sequenceSectionCount > 0 && (clauseRows < 1 || sourceButtons < 1 || !viewSequenceEnabled)) {
      throw new Error(`Grounded sequence evidence is not inspectable: clauses=${clauseRows}, source_buttons=${sourceButtons}, view_enabled=${viewSequenceEnabled}.`);
    }
    if (minimums.soo_point_candidates > 0 && pointSourceButtonCount < 1) {
      throw new Error("The selected grounded sequence exposes no exact labeled-point source action.");
    }
    const sequenceText = await sequenceWorkspace.innerText();
    const clauseText = await clauseTable.innerText();
    if (requiredSooTag && !sequenceText.includes(requiredSooTag)) {
      throw new Error(`Required SOO tag is absent or truncated in the reader: ${requiredSooTag}`);
    }
    for (const forbidden of forbiddenSequenceText) {
      if (clauseText.includes(forbidden)) {
        throw new Error(`Selected sequence contains forbidden adjacent-source text: ${forbidden}`);
      }
    }
    const exportButton = sequenceWorkspace.getByRole("button", { name: "Export BAS evidence & history", exact: true });
    const [sequenceDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
    const sequenceExportPath = resolve(outDir, "bas-evidence-and-history.takeoff.json");
    await sequenceDownload.saveAs(sequenceExportPath);
    const sequenceExport = JSON.parse(readFileSync(sequenceExportPath, "utf8"));
    const exportedWorkflow = sequenceExport?.bas_workflow;
    const activeCapture = exportedWorkflow?.captures?.find(
      (capture) => capture.capture_id === exportedWorkflow.current_capture_id,
    );
    if (!activeCapture || !Array.isArray(activeCapture.narrative_sources?.pages)
        || !activeCapture.narrative_sources.pages.length) {
      throw new Error("Sequence evidence export omitted the active source-bound narrative capture.");
    }
    sequenceReaderFacts = {
      options: optionCount,
      extracted_body_count: readerCounts.body,
      review_candidate_count: readerCounts.review,
      selected_sequence: await sequenceSelect.locator("option:checked").innerText(),
      selected_sequence_clause_rows: clauseRows,
      selected_sequence_source_buttons: sourceButtons,
      selected_sequence_point_source_buttons: pointSourceButtonCount,
      required_soo_tag: requiredSooTag || null,
      required_sequence_title: requiredSequenceTitle || null,
      forbidden_sequence_text: forbiddenSequenceText,
      view_sequence_enabled: viewSequenceEnabled,
      exported_source_pages: activeCapture.narrative_sources.pages.length,
    };
    await page.screenshot({ path: resolve(outDir, "04-sequence-reader.png"), fullPage: true });
    if (pointSourceButtonCount) {
      if (!await pointSourceButtons.first().isEnabled()) throw new Error("The exact SOO point-source action is disabled.");
      const requiredCandidate = requiredSooTag
        ? sequenceWorkspace.locator('tbody > tr').filter({ hasText: requiredSooTag }).first()
          .getByRole("button", { name: "View point source", exact: true })
        : pointSourceButtons.first();
      if (!await requiredCandidate.count()) throw new Error(`No source action owns required SOO tag ${requiredSooTag}.`);
      await requiredCandidate.click();
      await panel.waitFor({ state: "hidden" });
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(outDir, "05-soo-point-source.png"), fullPage: true });
      sequenceReaderFacts.point_source_jump_verified = true;
      await page.evaluate(() => window.__opentakeoff.openTakeoff());
      await panel.waitFor({ state: "visible" });
    }
  }

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
  if (compiledRecordCount > 0 && csvEnabled) {
    const [download] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
    const csvPath = resolve(outDir, "complete-bas-takeoff.csv");
    await download.saveAs(csvPath);
    csvHeader = readFileSync(csvPath, "utf8").split(/\r?\n/, 1)[0];
    const requiredCsvColumns = ["Qty basis", "Quantity evidence", "Scheduled qty", "Installed qty", "Status"];
    if (requiredCsvColumns.some((column) => !csvHeader.split(",").includes(column))) {
      throw new Error(`CSV lacks quantity provenance: ${csvHeader}`);
    }
  } else if (compiledRecordCount > 0) {
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
      compiled_records: compiledRecordCount,
      sequence_sections: sequenceSectionCount,
      point_lists: pointListCount,
      sequences: sequenceCount,
      soo_point_candidates: sooPointCandidateCount,
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
    matched_source_comparison: matchedSourceComparison,
    inspection_domains: Object.keys(receipt.inspections || {}),
    release_status: receipt.release_status,
    required_schematic_binding: requiredSchematicBinding,
    panel: panelFacts,
    sequence_reader: sequenceReaderFacts,
    csv_header: csvHeader,
    page_errors: pageErrors,
    console_errors: consoleErrors.slice(0, 20),
    artifacts: ["01-agent-result.png", "02-takeoff-table.png", "02-source-comparison.png", "02a-plan-match-source.png", "02b-schedule-row-source.png", "03-workflow-review.png", "04-sequence-reader.png", "05-soo-point-source.png", "complete-bas-takeoff.csv", "bas-evidence-and-history.takeoff.json"]
      .filter((name) => existsSync(resolve(outDir, name))),
  };
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`[journey] PASS — ${resolve(outDir, "summary.json")}`);
} catch (error) {
  await page.screenshot({ path: resolve(outDir, "FAIL.png"), fullPage: true }).catch(() => {});
  writeFileSync(resolve(outDir, "failure.txt"), [
    error?.stack || error,
    pageErrors.length ? `Page errors:\n${pageErrors.join("\n")}` : "Page errors: none captured",
    consoleErrors.length ? `Console errors:\n${consoleErrors.join("\n")}` : "Console errors: none captured",
  ].join("\n\n") + "\n");
  throw error;
} finally {
  await context.close();
  await browser.close();
  const videos = readdirSync(videoDir).filter((name) => name.endsWith(".webm"));
  if (videos.length) copyFileSync(resolve(videoDir, videos[0]), resolve(outDir, "journey.webm"));
}
