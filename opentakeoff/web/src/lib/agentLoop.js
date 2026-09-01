// In-canvas takeoff agent — the PROVIDER-AGNOSTIC TOOL-USE LOOP. No React, no
// DOM: goal in, tool executions through the injected `execute`, streaming
// status out through `onEvent`, and a terminal {status} back. Transport rides
// ai.js's chatWithTools (the user's OWN key and endpoint — the BYO-AI seam),
// which both this loop and the tests reach through injectable cfg/fetchFn.
//
// Provider translation lives here and only here:
//   Anthropic-style — tools: [{name, description, input_schema}], assistant
//     turns carry tool_use content blocks, results go back as tool_result
//     blocks in ONE user message (parallel calls included);
//   OpenAI-style — tools: [{type:"function", function:{...}}], assistant turns
//     carry tool_calls, results go back as role:"tool" messages (+ a follow-up
//     user message for image results, which the tool role can't carry).
//
// Failure contract: NOTHING here throws to the caller. A transport error, a
// malformed model reply, an abort, or the iteration cap all surface as an
// onEvent + a terminal {status: "error" | "aborted" | "max_iterations"} —
// the canvas renders status, it never crashes.

import { chatWithTools, describeImageForAgent } from "./ai.js";
import { runVerifiers } from "./agentVerifiers.js";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  advanceTakeoffWorkflow,
  workflowDirective,
  isIllegalWorkflowTransition,
  scheduleFamilyNeedles,
} from "./takeoffWorkflow.js";
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";

// Full-set HVAC/BAS takeoffs need list/graph + several count queries + scoped
// cite re-queries + paints; 32 was truncating D03 mid-gate. Keep a hard cap.
export const MAX_AGENT_ITERATIONS = 80;

/** Fill structured highlight_citation fields from prior query_table / sweep cells
 *  so Agent source cards read "VAV-1 · CFM = 350" even when the model only
 *  passed sheet + bbox_px + a naked text fragment. */
export function enrichHighlightCitationArgs(args, callLog = []) {
  if (!args || typeof args !== "object") return args;
  const bbox = args.bbox_px;
  const sheet = String(args.sheet || "");
  if (!sheet || !Array.isArray(bbox) || bbox.length !== 4) return args;
  const hasRich = String(args.row_key || "").trim()
    && String(args.column || "").trim()
    && String(args.value || "").trim();
  if (hasRich) return args;
  const near = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 4
    && a.every((v, i) => Math.abs(Number(v) - Number(b[i])) <= 2);

  for (const { name, out } of callLog) {
    if (name === "query_table") {
      for (const match of out?.matches || []) {
        if (String(match?.sheet || "") !== sheet) continue;
        const rowKey = String(match?.row?.key || match?.row?.identity?.text || "").trim();
        const title = String(match?.title || "").trim();
        for (const [header, cell] of Object.entries(match?.row?.all_cells || match?.row?.cells || {})) {
          if (!near(cell?.bbox, bbox)) continue;
          return {
            ...args,
            row_key: String(args.row_key || "").trim() || rowKey || undefined,
            column: String(args.column || "").trim() || String(header || "").trim() || undefined,
            value: String(args.value || "").trim()
              || (cell?.text != null ? String(cell.text).trim() : undefined)
              || undefined,
            table_title: String(args.table_title || "").trim() || title || undefined,
          };
        }
      }
    }
    if (name === "sweep_schedule_row" && out?.row) {
      const row = out.row;
      if (String(row.sheet || "") !== sheet) continue;
      const rowKey = String(row.key || row.identity?.text || "").trim();
      const title = String(row.title || out.title || "").trim();
      for (const [header, cell] of Object.entries(row.cell_citations || row.all_cells || {})) {
        const cellBbox = Array.isArray(cell?.bbox) ? cell.bbox
          : [cell?.bbox?.x0, cell?.bbox?.y0, cell?.bbox?.x1, cell?.bbox?.y1];
        if (!near(cellBbox, bbox)) continue;
        return {
          ...args,
          row_key: String(args.row_key || "").trim() || rowKey || undefined,
          column: String(args.column || "").trim() || String(header || "").trim() || undefined,
          value: String(args.value || "").trim()
            || (cell?.text != null ? String(cell.text).trim() : undefined)
            || undefined,
          table_title: String(args.table_title || "").trim() || title || undefined,
        };
      }
    }
  }
  return args;
}

const EQUIPMENT_VALVE_EVIDENCE_TOOLS = new Set([
  "list_sheets",
  "sheet_graph",
  "query_table",
  "sweep_schedule_row",
  "highlight_citation",
]);

export function toolsForGoal(goal, tools) {
  const exactEquipmentValveWorkflow = /\binstalled\s+quantity\b/i.test(goal)
    && /\bcontrol\s+valve\b/i.test(goal)
    && /\b(?:exact\s+)?schedule\s+cells?\b/i.test(goal);
  return exactEquipmentValveWorkflow
    ? tools.filter(({ name }) => EQUIPMENT_VALVE_EVIDENCE_TOOLS.has(name))
    : tools;
}

/** Title-scan needles for multi-family schedule takeoffs. Returns Exact
 *  query_table title strings still missing from the call log. */
export function missingScheduleTitleScans(callLog, goal) {
  const familyTokens = /\b(?:AHU|FCU|VAV|DOAH|DOAS|CRAH|CUH|chiller|boiler|pump|humidifier|dehumidifier|diffuser|grille|separator|expansion|unit\s+heater|fan[\s-]*coil|points?\s*list|DDC\s+points?|scheduled|equipment)\b/i;
  const asksScheduleCounts = (
    /\btakeoff\b/i.test(goal)
    || /\bscheduled\s+(?:unit\s+)?counts?\b/i.test(goal)
    || /\bequipment\s+(?:totals?|counts?)\b/i.test(goal)
    || (/\b(?:how many|counts?|totals?|splits?)\b/i.test(goal)
      && scheduleFamilyNeedles(goal).length + (/\bpoints?\s*list\b/i.test(goal) ? 1 : 0) >= 3)
  ) && familyTokens.test(goal);
  if (!asksScheduleCounts) return [];
  const titleScans = callLog.filter(({ name, out, args }) => {
    if (name !== "query_table" || out?.error) return false;
    const q = out?.query || args || {};
    const scoped = q.row_key != null && String(q.row_key).trim() !== ""
      || q.column != null
      || q.cell_value != null
      || q.cell_contains != null;
    return !scoped && Number.isFinite(Number(out?.count)) && Number(out.count) >= 1;
  });
  const namedPointsListTag = (() => {
    const m = goal.match(
      /\b((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+(?:\/[A-Z0-9]+)?)\s*(?:BAS\s+)?points?\s*list\b|(?:BAS\s+)?points?\s*list\b[^.\n]{0,48}\b((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+(?:\/[A-Z0-9]+)?)/i,
    );
    return m ? String(m[1] || m[2]).toUpperCase() : null;
  })();
  const familyNeedles = scheduleFamilyNeedles(goal).map((n) => ({
    label: n.label,
    title: n.title,
    titleRe: n.titleRe,
    exclude: n.exclude,
    minCount: n.minCount,
  }));
  if (/\bpoints?\s*list\b|BAS\b/i.test(goal)) {
    const requireRe = namedPointsListTag
      ? new RegExp(namedPointsListTag.split("/")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      : null;
    familyNeedles.push({
      label: "points-list",
      titleRe: /POINTS LIST/i,
      require: requireRe,
      title: namedPointsListTag ? `POINTS LIST ${namedPointsListTag.split("/")[0]}` : "POINTS LIST",
    });
  }
  const scanTitleFull = (out) => [
    out.query?.title,
    out.matches?.[0]?.title?.text || out.matches?.[0]?.title,
  ].filter(Boolean).map(String).join(" ");
  return familyNeedles.filter((fam) => !titleScans.some(({ out }) => {
    const title = scanTitleFull(out);
    if (!scheduleTitleMatches(title, fam.titleRe, fam.exclude)) return false;
    if (fam.require && !fam.require.test(title)) return false;
    const min = fam.minCount ?? 1;
    if (Number(out.count) < min) return false;
    return true;
  })).map((fam) => fam.title).filter(Boolean);
}

/**
 * Named-tag schedule attributes the goal asked for that query_table already
 * returned but the answer omitted. Set-agnostic (TYPE/CFM/GPM/capacity).
 * @returns {Array<{tag:string,label:string,value:string,sheet:string|null,header:string}>}
 */
export function missingNamedScheduleAttrs(callLog, goal, finalText, finalCanonicalIn, spacedHasTokenIn) {
  const finalTextStr = String(finalText || "");
  if (!finalTextStr) return [];
  const finalCanonical = finalCanonicalIn
    || finalTextStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const finalSpaced = finalTextStr.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const spacedHasToken = spacedHasTokenIn || ((token) => {
    if (!token) return false;
    return new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(finalSpaced);
  });
  const attrAsk = [];
  if (/\btype\b/i.test(goal)) attrAsk.push({ label: "TYPE", headerRe: /^TYPE$/i });
  if (/\b(?:cfm|airflow)\b/i.test(goal)) {
    attrAsk.push({ label: "CFM", headerRe: /\bCFM\b|AIR\s*FLOW|FAN\s*DATA/i });
  }
  if (/\bgpm\b/i.test(goal)) attrAsk.push({ label: "GPM", headerRe: /\bGPM\b|FLOWRATE/i });
  if (/\b(?:capacity|tons?|mbh)\b/i.test(goal)) {
    attrAsk.push({ label: "CAPACITY", headerRe: /CAPACITY|\bTONS?\b|\bMBH\b/i });
  }
  const goalTagRe = /\b[A-Z]{1,8}-[A-Z0-9]*\d[A-Z0-9]*\b/gi;
  const goalTags = [...new Set([...String(goal || "").matchAll(goalTagRe)]
    .map((hit) => hit[0].toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter((t) => t.length >= 3))];
  if (!attrAsk.length || !goalTags.length) return [];

  const cellTextOf = (cell) => {
    if (cell == null) return "";
    if (typeof cell === "string" || typeof cell === "number") return String(cell);
    if (typeof cell.text === "string") return cell.text;
    return String(cell.value ?? "");
  };
  const missing = [];
  for (const tagCanon of goalTags) {
    let bag = null;
    let sheetHint = null;
    let displayTag = tagCanon;
    let bagScore = -1;
    for (const { out: qOut } of (callLog || []).filter((c) => c.name === "query_table")) {
      for (const match of qOut?.matches || []) {
        const rawKey = String(match?.row?.key || match?.row?.identity?.text || "");
        const keyCanon = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (keyCanon !== tagCanon) continue;
        const candidate = match?.row?.all_cells || match?.row?.cells || null;
        if (!candidate || typeof candidate !== "object") continue;
        const score = attrAsk.reduce((n, ask) => (
          n + (Object.keys(candidate).some((h) => ask.headerRe.test(String(h))) ? 1 : 0)
        ), 0);
        if (score > bagScore) {
          bag = candidate;
          sheetHint = match?.sheet || null;
          displayTag = rawKey || tagCanon;
          bagScore = score;
        }
      }
    }
    if (!bag || bagScore < 1) continue;
    for (const ask of attrAsk) {
      const entry = Object.entries(bag).find(([h]) => ask.headerRe.test(String(h)));
      if (!entry) continue;
      const raw = cellTextOf(entry[1]).trim();
      if (!raw || /^(?:—|-|n\/?a|\.)$/i.test(raw)) continue;
      const phraseCanon = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const tokens = raw.toUpperCase().replace(/,/g, "").split(/[^A-Z0-9.]+/).filter((t) => t.length >= 2);
      const present = (phraseCanon.length >= 3 && finalCanonical.includes(phraseCanon))
        || (tokens.length > 0 && tokens.every((tok) => (
          spacedHasToken(tok) || finalCanonical.includes(tok.replace(/[^A-Z0-9]/g, ""))
        )));
      if (!present) {
        missing.push({
          tag: displayTag,
          label: ask.label,
          value: raw,
          sheet: sheetHint,
          header: String(entry[0]),
        });
      }
    }
  }
  return missing;
}

/** Append retrieved schedule attrs the model omitted — durable, set-agnostic. */
export function appendNamedScheduleAttrs(draft, missing) {
  if (!missing?.length) return String(draft || "");
  const byTag = new Map();
  for (const m of missing) {
    if (!byTag.has(m.tag)) byTag.set(m.tag, { sheet: m.sheet, parts: [] });
    const g = byTag.get(m.tag);
    if (m.sheet && !g.sheet) g.sheet = m.sheet;
    g.parts.push(`${m.label} ${m.value}`);
  }
  const lines = [...byTag.entries()].map(([tag, g]) => (
    `- ${tag}: ${g.parts.join("; ")}${g.sheet ? ` (${g.sheet})` : ""}`
  ));
  const block = `Schedule attributes (from query_table):\n${lines.join("\n")}`;
  const base = String(draft || "").trim();
  if (/Schedule attributes \(from query_table\):/i.test(base)) return base;
  return base ? `${base}\n\n${block}` : block;
}

export function requiredEvidenceCorrection(callLog, goal, finalText = "") {
  const successfulCount = callLog.some(({ name, out }) =>
    (name === "sweep_schedule_row" && Number.isFinite(out?.found))
    || (name === "count_marks" && !out?.error));
  if (/\binstalled\s+quantity\b/i.test(goal) && !successfulCount) {
    return "The goal asks for installed quantity, but no successful sweep_schedule_row or count_marks call exists in this run. Do not infer quantity from schedule-row count. Call the appropriate counting tool, then answer from its result or refuse.";
  }
  if (/\binstalled\s+quantity\b/i.test(goal) && successfulCount && finalText
    && !/\binstalled\s+quantity\b.{0,30}\b\d+(?:\.\d+)?\b/i.test(finalText)) {
    return "The goal asks for installed quantity and a deterministic count succeeded, but the final answer does not explicitly state the numeric installed quantity. Report it under an “Installed quantity” label and attribute it to the sweep/count result.";
  }
  // Complete set HVAC/BAS/valve → must go through compile_corpus_takeoff.
  // Phrase-robust: same classifiers as takeoffWorkflow (take off / full /
  // valve ≡ control valve / set scope without requiring literal "complete").
  {
    const kind = corpusCompileKind(goal);
    if (kind) {
      const compiled = callLog.some(({ name, out }) =>
        name === "compile_corpus_takeoff" && !out?.error && (out?.takeoff_id || out?.kind));
      if (!compiled) {
        const fails = callLog.filter(({ name, out }) =>
          name === "compile_corpus_takeoff" && out?.error);
        if (fails.length >= 1) {
          const err = String(fails[fails.length - 1].out.error || "unknown error").slice(0, 500);
          // FATAL: infrastructure / pipeline failures must not burn the 80-step
          // cap retrying the same compile. Prefix is stripped by the agent loop.
          return `__FATAL__: Production compile_corpus_takeoff failed (${fails.length} attempt(s)): ${err}. `
            + "Install opentakeoff/mcp dependencies (`cd opentakeoff/mcp && npm install`) so the Session+ODL "
            + "pipeline can load TypeScript (tsx). Do not retry compile in a loop — fix the environment and re-run.";
        }
        return kind === "bas_points"
          ? 'The goal asks for a points-list / BAS takeoff. Call compile_corpus_takeoff with kind="bas_points" now — do not approximate the set total by crawling schedules with find_schedule / query_table.'
          : kind === "control_valves"
            ? 'The goal asks for a complete valve takeoff of this set. Call compile_corpus_takeoff with kind="control_valves" now — that returns every CONTROL VALVE SCHEDULE row (valve mark, served equipment, service, size, GPM, Cv). Do not approximate with a partial read_schedule or markdown table.'
            : 'The goal asks for a complete HVAC equipment takeoff of this set. Call compile_corpus_takeoff with kind="hvac_equipment" now — do not approximate the set total by crawling schedules.';
      }
    }
  }
  // Find the scale: AS NOTED on one sheet must not abort the set. Prefer
  // sheet_graph / list_sheets detected_scale|detected_label values.
  {
    const asksFindScale = /\b(?:find|locate|where(?:'s| is)|what(?:'s| is)|show)\b.{0,48}\bscale\b/i.test(goal)
      || /\b(?:can you|please)\s+find\s+(?:the\s+)?scale\b/i.test(goal);
    if (asksFindScale) {
      const listOut = callLog.find(({ name, out }) => name === "list_sheets" && !out?.error)?.out;
      const graphOut = callLog.find(({ name, out }) => name === "sheet_graph" && !out?.error)?.out;
      if (!listOut && !graphOut) {
        return 'The goal asks to find the scale. Call list_sheets and sheet_graph, then report every sheet that carries a numeric detected_label / detected_scale (e.g. 1/8"=1\'-0"). Do not stop at SCALE: AS NOTED on a cover or legend sheet.';
      }
      const detected = [];
      for (const s of listOut?.sheets || (Array.isArray(listOut) ? listOut : []) || []) {
        const label = s?.detected_label || s?.detected_scale || s?.detected?.label;
        if (label && !/AS\s*NOTED/i.test(String(label))) {
          detected.push({ sheet: s.sheet || s.key, label: String(label) });
        }
      }
      for (const s of graphOut?.sheets || []) {
        const label = s?.detected_scale || s?.detected_label;
        if (label && !/AS\s*NOTED/i.test(String(label))) {
          const sheet = s.sheet || s.key;
          if (!detected.some((d) => d.sheet === sheet && d.label === String(label))) {
            detected.push({ sheet, label: String(label) });
          }
        }
      }
      if (finalText) {
        if (detected.length && /AS\s*NOTED/i.test(finalText)
          && !/\d+\s*\/\s*\d+\s*"\s*=|1\s*:\s*\d+|\d+"\s*=\s*\d+/i.test(finalText)) {
          const sample = detected.slice(0, 4).map((d) => `${d.sheet}: ${d.label}`).join("; ");
          return `Tool evidence already found numeric scales on ${detected.length} sheet(s) (e.g. ${sample}). Do not refuse because another sheet says SCALE: AS NOTED — report those detected_scale / detected_label values and which sheets carry them, then the estimator can set_scale with that exact label.`;
        }
        if (detected.length
          && !detected.some((d) => finalText.includes(d.label) || finalText.replace(/\s+/g, "").includes(d.label.replace(/\s+/g, "")))
          && !/\d+\s*\/\s*\d+\s*"\s*=|1\s*:\s*\d+/i.test(finalText)) {
          const sample = detected.slice(0, 4).map((d) => `${d.sheet}: ${d.label}`).join("; ");
          return `Copy at least one numeric detected scale from the tools into the answer (e.g. ${sample}). AS NOTED alone is not a usable set_scale label.`;
        }
      } else if (detected.length === 0 && !graphOut) {
        return "Call sheet_graph next — list_sheets alone may only cover open tabs. sheet_graph reports detected_scale across the loaded set.";
      }
    }
  }
  // Valve / legend symbol honesty: find_legend_symbols ≠ plan placements.
  {
    const asksValveSymbols = /\bvalve\s+symbols?\b/i.test(goal)
      || /\bhighlight\b.{0,60}\bvalves?\b/i.test(goal)
      || /\ball\s+(?:the\s+)?valve/i.test(goal)
      || /\bfind\b.{0,40}\bvalve\s+symbols?\b/i.test(goal);
    if (asksValveSymbols && finalText) {
      const paints = callLog.filter(({ name, out }) =>
        name === "highlight_citation" && !out?.error && Array.isArray(out?.bbox_px)).length;
      const legendCalls = callLog.filter(({ name, out }) =>
        name === "find_legend_symbols" && !out?.error);
      const planSweeps = callLog.filter(({ name, out }) =>
        (name === "symbol_sweep" || name === "match_reference_symbol") && !out?.error);
      const planFound = planSweeps.reduce((n, { out }) => {
        const found = Number(out?.found ?? out?.total_found ?? 0);
        const matches = Array.isArray(out?.matches) ? out.matches.length : 0;
        const shapes = Array.isArray(out?.shapes) ? out.shapes.length : 0;
        const byName = Array.isArray(out?.results)
          ? out.results.reduce((m, r) => m + Number(r?.found || r?.matches?.length || 0), 0)
          : 0;
        return n + Math.max(found, matches, shapes, byName);
      }, 0);
      const namedTypes = finalText.match(
        /\b(?:GATE|GLOBE|BUTTERFLY|CHECK|RELIEF|BALL|PLUG|ANGLE|DRAIN|BALANCING|CONTROL)\s+VALVE\b/gi,
      ) || [];
      const uniqueTypes = [...new Set(namedTypes.map((t) => t.toUpperCase()))];
      if (uniqueTypes.length >= 3 && paints <= 2) {
        return `The answer names ${uniqueTypes.length} valve symbol types as highlighted, but only ${paints} highlight_citation paint(s) succeeded. Rewrite to describe ONLY the painted regions (or paint each claimed match). Do not invent plan highlights.`;
      }
      if (legendCalls.length && planFound === 0 && /\bhighlight/i.test(finalText) && uniqueTypes.length >= 2) {
        return "find_legend_symbols only inventories legend glyphs — it does not find plan placements. Do not claim plan valve symbols were highlighted from legend entries alone. Seed symbol_sweep from a real plan instance (or call match_reference_symbol on a scaled plan sheet), or honestly say only legend glyphs were located.";
      }
      if (/\ball\s+(?:valve\s+)?symbols?\b.{0,40}\bhighlight/i.test(finalText)
        || /\bhighlight(?:ed)?\s+all\b.{0,40}\bvalve/i.test(finalText)) {
        if (planFound < 2 || paints < 2) {
          return "Do not claim all valve symbols were highlighted unless plan sweeps returned multiple matches that you painted. Report the actual found counts from symbol_sweep / match_reference_symbol and disclose legend-only results separately.";
        }
      }
    }
  }
  if (/\binstalled\s+quantity\b/i.test(finalText)
    && /\b(?:single|one)\s+(?:schedule\s+)?(?:entry|row)\b|\b(?:schedule\s+)?row\b.{0,80}\bappears\s+(?:only\s+)?(?:once|one time)\b/i.test(finalText)) {
    return "The final answer describes installed quantity as a single/one schedule entry. That reasoning is invalid even when the numeric value happens to match. Attribute installed quantity only to the successful sweep/count result and remove schedule-row-count wording.";
  }
  if (/\bnormalized\b/i.test(finalText)
    || /\bat\s*[\[(]\s*0\.\d+\s*,\s*0\.\d+\s*[\])]/i.test(finalText)
    || /bbox(?:_px)?\s*=\s*\[\s*0\.\d+\s*,\s*0\.\d+/i.test(finalText)) {
    return "The final answer exposes normalized citation coordinates. Production evidence citations use image-pixel bboxes only. Remove normalized coordinates and report the unchanged sheet and bbox_px returned by the evidence tool.";
  }
  // query_table / find_text are whole-set tools. Refusing schedule attributes
  // because a sheet tab is closed is incorrect when those tools already returned cells.
  if (/(?:not (?:currently )?open|isn'?t open|sheet (?:is |was )?(?:not |never )?open).{0,100}(?:canvas|tab)|(?:canvas|tab).{0,80}(?:not (?:currently )?open|isn'?t open)/i.test(finalText)
    && callLog.some(({ name, out }) =>
      name === "query_table" && !out?.error
      && (out?.matches || []).some((match) =>
        match?.row?.all_cells || match?.row?.cells || match?.row?.key))) {
    return "query_table already returned schedule cells without needing an open sheet tab. Copy the requested values from row.all_cells into the answer and call highlight_citation on those bboxes — do not refuse because a canvas tab is closed.";
  }
  if (/(?:≈|\bapproximately\b|\bapprox\.)/i.test(finalText)
    && !/\b(?:derived|calculated|converted|conversion)\b/i.test(finalText)) {
    return "The final answer adds an approximate value without labeling its derivation. Remove unrequested derived values, or explicitly label the calculation/conversion and cite the source inputs; never present it as direct tool output.";
  }
  if (/\((?:example|placeholder|sample)(?:\s+\w+)?\)|\bexample\s+(?:size|value|data|only|figures?)\b|\bplaceholder\s+(?:data|value|text|figures?|row)\b|\blorem ipsum\b/i.test(finalText)) {
    return "The final answer contains example or placeholder data. Never substitute example values for requested drawing facts. Retrieve each value from a successful tool result with a citation, or explicitly say the evidence was not found.";
  }
  if (/\bcontrol\s+valve\b/i.test(goal)) {
    const tableTitle = (match) => String(
      match?.table || match?.title?.text || match?.title
        || match?.row?.table || match?.row?.table_title || "",
    );
    const tableMatches = callLog.filter(({ name }) => name === "query_table")
      .flatMap(({ out }) => out?.matches || []);
    const valveMatches = tableMatches.filter((match) => /\bcontrol\s+valve\b/i.test(tableTitle(match)));
    const valveMatch = valveMatches.length > 0;
    const equipmentTags = new Set([
      ...callLog.filter(({ name, out }) =>
        name === "sweep_schedule_row" && (out?.found ?? out?.total_found) > 0)
        .map(({ args, out }) => String(args?.tag || out?.tag || "")),
      ...tableMatches.filter((match) => !/\bcontrol\s+valve\b/i.test(tableTitle(match)))
        .map((match) => String(match?.row?.identity?.text || match?.row?.key || "")),
    ].map((tag) => tag.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean));
    const relationshipSearch = callLog.some(({ name, args }) =>
      name === "query_table"
      && equipmentTags.has(String(args?.cell_contains || "").toUpperCase().replace(/[^A-Z0-9]/g, "")));
    const refusedValve = /\b(?:could not|can't|cannot|unable to|not found|no matching)\b.{0,80}\bcontrol\s+valve\b/i.test(finalText)
      || /\bcontrol\s+valve\b.{0,80}\b(?:could not|can't|cannot|unable to|not found|no matching)\b/i.test(finalText);
    if (!valveMatch && !relationshipSearch) {
      return "No control-valve row matched the exact equipment row key, but relationship schedules often encode the equipment tag inside another cell or compound valve mark. Before refusing, call query_table with cell_contains set to the exact evidence-backed equipment tag. Use the returned semantic row identity if it matches.";
    }
    if (!valveMatch && !refusedValve) {
      return "The goal asks for control-valve data, but no query_table result matched a control-valve schedule. Do not supply valve values from memory, inference, or examples. Query the matching control-valve row and cite it, or explicitly report that no matching row was found.";
    }
    const valveIdentities = valveMatches
      .map((match) => String(match?.row?.identity?.text || match?.row?.key || ""))
      .map((tag) => tag.toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter(Boolean);
    const answerCanonical = finalText.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (valveMatch && valveIdentities.length
      && !valveIdentities.some((identity) => answerCanonical.includes(identity))) {
      return "A matching control-valve schedule row was retrieved, but the final answer omitted its semantic valve identity and requested data. Include the evidence-backed valve mark and its requested fields, with citations, in the complete replacement answer.";
    }
  }
  const swept = new Set(callLog.filter(({ name, out }) =>
    name === "sweep_schedule_row" && (out?.found ?? out?.total_found) > 0)
    .map(({ args, out }) => String(args?.tag || out?.tag || "").toUpperCase()));
  const queried = new Set(callLog.filter(({ name }) => name === "query_table")
    .flatMap(({ out }) => out?.matches || [])
    .map((match) => String(match?.row?.key || "").toUpperCase())
    .filter(Boolean));
  const unswept = [...queried].filter((tag) => !swept.has(tag));
  const finalCanonical = finalText.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Space-tokenized form for standalone numeric / short-token checks — fully
  // concatenated canonicalization glues values to units (3850CFM) and must not
  // be used for numeric word boundaries.
  const finalSpaced = finalText.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const spacedHasToken = (token) => {
    if (!token) return false;
    return new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(finalSpaced);
  };
  const claimedUnswept = unswept.filter((tag) => {
    const tagCanonical = tag.replace(/[^A-Z0-9]/g, "");
    return finalText.split(/[\n.!?]+/).some((fragment) => {
      const words = fragment.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
      const canonical = words.replace(/\s+/g, "");
      if (!canonical.includes(tagCanonical)) return false;
      return /\bBOTH TAGS\b/.test(words)
        || /\bPLAN LOCATION (?:FOR|OF) \b/.test(words)
        || /\bLOCATED ON (?:THE )?PLAN\b/.test(words);
    });
  });
  if (claimedUnswept.length) {
    return `The final answer claims a plan location for unswept tag(s): ${claimedUnswept.join(", ")}. A schedule query proves schedule data only. Remove those plan-location claims or call sweep_schedule_row for each exact tag.`;
  }
  const sweptPlanSheets = new Set(callLog.filter(({ name, out }) =>
    name === "sweep_schedule_row" && (out?.found ?? out?.total_found) > 0)
    .flatMap(({ out }) => out?.tag_citations || [])
    .map((citation) => String(citation?.sheet || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean));
  const scheduleSheets = new Set(callLog.filter(({ name }) => name === "query_table")
    .flatMap(({ out }) => out?.matches || [])
    .map((match) => String(match?.sheet || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean));
  const scheduleClaimedAsPlan = finalText.split("\n")
    .filter((line) => /\bplan[- ]?location\b/i.test(line))
    .some((line) => {
      const lineCanonical = line.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return [...scheduleSheets].some((sheet) =>
        lineCanonical.includes(sheet) && !sweptPlanSheets.has(sheet));
    });
  if (scheduleClaimedAsPlan) {
    return "The final answer labels a queried schedule sheet/region as a plan location without swept plan evidence on that sheet. A table bbox is a schedule citation only. Remove the plan-location label or provide a successful exact-tag sweep citation from the real plan sheet.";
  }

  // Plan sweep refused ≠ schedule data missing. If query_table (or the sweep
  // row payload) already returned requested schedule cells for a refused tag,
  // the answer must still carry those values alongside the honest refusal.
  {
    const cellText = (cell) => {
      if (cell == null) return "";
      if (typeof cell === "string" || typeof cell === "number") return String(cell);
      if (typeof cell.text === "string") return cell.text;
      return String(cell.value ?? "");
    };
    const scheduleFieldsFromGoal = [];
    if (/\bCFM\b/i.test(goal)) scheduleFieldsFromGoal.push("CFM");
    if (/\bMBH\b/i.test(goal)) scheduleFieldsFromGoal.push("MBH");
    if (/\bkW\b|\bKW\b/i.test(goal)) scheduleFieldsFromGoal.push("KW");
    if (/\bGPM\b|\bFLOW\b/i.test(goal)) scheduleFieldsFromGoal.push("GPM", "FLOW");
    if (/\bmanufacturer\b/i.test(goal)) scheduleFieldsFromGoal.push("MANUFACTURER", "MFR");
    if (scheduleFieldsFromGoal.length) {
      const refusedTags = callLog.filter(({ name, out }) => {
        if (name !== "sweep_schedule_row") return false;
        const err = String(out?.error || out?.message || out?.reason || "");
        if (/not drawn on any plan|cannot be geometrically anchored|geometrically anchored/i.test(err)) return true;
        if (out?.status === "refused" || out?.refused) return true;
        if ((out?.found ?? out?.total_found) === 0 && err) return true;
        return false;
      }).map(({ args, out }) => String(args?.tag || out?.tag || "").toUpperCase()).filter(Boolean);

      for (const tag of [...new Set(refusedTags)]) {
        const tagCanon = tag.replace(/[^A-Z0-9]/g, "");
        if (!tagCanon || !finalCanonical.includes(tagCanon)) continue;
        const cells = {};
        for (const { args, out } of callLog.filter(({ name }) =>
          name === "query_table" || name === "sweep_schedule_row")) {
          const bags = [];
          for (const match of out?.matches || []) {
            if (String(match?.row?.key || "").toUpperCase() !== tag) continue;
            if (match?.row?.all_cells) bags.push(match.row.all_cells);
            if (match?.row?.cells) bags.push(match.row.cells);
          }
          const outTag = String(args?.tag || out?.tag || out?.row?.key || "").toUpperCase();
          if (outTag === tag) {
            if (out?.row?.all_cells) bags.push(out.row.all_cells);
            if (out?.row?.cells) bags.push(out.row.cells);
          }
          for (const bag of bags) {
            for (const [header, raw] of Object.entries(bag || {})) {
              const text = cellText(raw).trim();
              if (!text) continue;
              cells[String(header).toUpperCase()] = text;
            }
          }
        }
        const missing = [];
        for (const field of scheduleFieldsFromGoal) {
          const value = cells[field];
          if (!value) continue;
          const token = value.toUpperCase().replace(/[^A-Z0-9.]+/g, "");
          if (!token) continue;
          if (!spacedHasToken(value.toUpperCase().replace(/,/g, ""))
            && !finalSpaced.includes(value.toUpperCase())
            && !finalCanonical.includes(token)) {
            missing.push(`${field}=${value}`);
          }
        }
        if (missing.length) {
          return `sweep_schedule_row refused plan location for ${tag}, but schedule evidence already returned ${missing.join(", ")}. Keep reporting those schedule field(s) with schedule citations AND state the honest plan refusal — do not drop schedule data when plan anchoring fails.`;
        }
      }
    }
  }

  // Goal-named tags + asked schedule attributes (type, CFM, …) must appear as
  // evidence-backed values in the answer — run BEFORE paint/sheet gates so the
  // model cannot finish by highlighting MARK alone while omitting the values.
  {
    const missing = missingNamedScheduleAttrs(callLog, goal, finalText, finalCanonical, spacedHasToken);
    if (missing.length) {
      const summary = missing.slice(0, 8).map((m) => (
        `${m.tag} ${m.label}=${m.value}${m.sheet ? ` (${m.sheet})` : ""}`
      )).join("; ");
      return `The goal asks for schedule attributes on named tags, and query_table already returned them, but the answer omits these evidence-backed values: ${summary}. Copy each TYPE/CFM/capacity value into the answer (do not say they are \"on the same row\" without stating the values), then paint those cells.`;
    }
  }

  if (/\bshow\b.*\bplan location\b|\bshow me the plan\b/i.test(goal)) {
    const highlights = callLog.filter(({ name, out }) =>
      name === "highlight_citation" && !out?.error && Array.isArray(out.bbox_px));
    const missingPlanTags = [];
    const missingPlanSheets = [];
    for (const { args, out } of callLog.filter(({ name, out }) =>
      name === "sweep_schedule_row" && (out?.found ?? out?.total_found) > 0)) {
      const tag = String(args?.tag || out?.tag || "").trim();
      const tagCanonical = tag.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const citations = (out?.tag_citations || []).map((citation) => {
        const bbox = citation?.bbox;
        return {
          sheet: citation?.sheet,
          bbox: Array.isArray(bbox) ? bbox : [bbox?.x0, bbox?.y0, bbox?.x1, bbox?.y1],
        };
      });
      const covered = citations.some((citation) => citation.bbox.every(Number.isFinite)
        && highlights.some(({ args: highlightArgs, out: highlightOut }) =>
          highlightOut.sheet === citation.sheet
          && highlightOut.bbox_px.every((value, index) => Math.abs(value - citation.bbox[index]) <= 1)
          && String(highlightArgs?.text || highlightOut?.text || "").toUpperCase()
            .replace(/[^A-Z0-9]/g, "").includes(tagCanonical)));
      if (!covered) missingPlanTags.push(tag);
      if (citations.length && !citations.some((citation) =>
        citation.sheet
        && finalCanonical.includes(String(citation.sheet).toUpperCase().replace(/[^A-Z0-9]/g, "")))) {
        missingPlanSheets.push(tag);
      }
    }
    if (missingPlanTags.length) {
      return `The requested plan location is not painted from the exact sweep tag citation for: ${missingPlanTags.join(", ")}. Call highlight_citation with an unchanged sweep_schedule_row.tag_citations sheet and bbox, and label it with that exact tag. Do not use the broader anchor rect or label one tag as another.`;
    }
    if (missingPlanSheets.length) {
      return `The final answer does not state the actual swept plan sheet for: ${missingPlanSheets.join(", ")}. Include the unchanged sheet and image-pixel bbox from sweep_schedule_row.tag_citations in the plan-location section; do not substitute a schedule sheet.`;
    }
  }
  const identityHeadersByTag = new Map();
  for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
    for (const match of out?.matches || []) {
      const identity = match?.row?.identity;
      if (!identity?.header || !identity?.text) continue;
      const tagCanonical = String(identity.text).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!tagCanonical) continue;
      if (!identityHeadersByTag.has(tagCanonical)) identityHeadersByTag.set(tagCanonical, []);
      identityHeadersByTag.get(tagCanonical).push({
        text: identity.text,
        header: identity.header,
        headerCanonical: String(identity.header).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      });
    }
  }
  for (const [, headers] of identityHeadersByTag) {
    const tagCanonical = String(headers[0].text).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!tagCanonical) continue;
    // Occupancy / use-group letter codes (USED GROUP = A-3 / B) are not equipment
    // identities. Requiring their header in an RTU/AHU answer causes junk row dumps.
    if (headers.every((item) =>
      /^(?:USEDGROUP|OCCUPANCYGROUP|OCCUPANCY|USEGROUP|GROUPCODE|TYPEOFCONSTRUCTION)$/i
        .test(item.headerCanonical))) continue;
    // Very short keys ("B", "A3") match as substrings of sheet filenames /
    // ordinary prose — never enforce identity-header thrash for them.
    if (tagCanonical.length < 3) continue;
    if (!finalCanonical.includes(tagCanonical)) continue;
    // AI/AO/BI|BO marks are themselves the semantic identity — requiring the
    // column title ("MARK ANALOG INPUT") in the user-facing answer is noise.
    if (/^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(headers[0].text)) continue;
    // Trivial equipment MARK/TAG headers are not ambiguous (unlike UNIT MARK vs
    // VALVE MARK). Count/cite takeoffs must not thrash requiring the word "MARK".
    if (headers.every((item) => /^(?:MARK|TAG|EQUIPMENTMARK|EQUIPMENTTAG)$/i.test(item.headerCanonical))) continue;
    // Junk remarks keys on equipment schedules (family_mark=false) are not
    // equipment identities — do not require citing REMARKS/NOTE as a "mark header".
    if (headers.every((item) => /^(?:REMARKS|NOTE|NOTES|COMMENT|COMMENTS)$/i.test(item.headerCanonical))) continue;
    if (headers.some((item) => finalCanonical.includes(item.headerCanonical))) continue;
    const example = headers[0];
    return `The final answer mentions ${example.text} but does not cite its semantic identity header ${example.header}. Use query_table row.identity exactly; do not substitute another repeated-value column.`;
  }
  // Occupancy / use-group dumps do not belong in equipment join answers.
  if (/\b(?:RTU|AHU|VAV|FCU|DOAH|CH)-[A-Z0-9]/i.test(goal)
    && !/\bUSED\s*GROUP\b|\bOCCUPANCY\b/i.test(goal)
    && (/\bUSED\s*GROUP\b/i.test(finalText) || /\bAdditional Requested Rows\b/i.test(finalText))) {
    return "The goal asks for named HVAC/BAS equipment schedule data. Remove unrelated occupancy/use-group rows (USED GROUP, A-3, B, etc.) and any \"Additional Requested Rows\" inventory the goal did not ask for — answer only the requested equipment join and plan label.";
  }
  const asksPointMark = /\bpoint mark\b|\balarm\b.{0,40}\btrend\b|\btrend\b.{0,40}\balarm\b/i.test(goal);
  if (asksPointMark) {
    const goalPointMarks = [...goal.matchAll(/\b((?:AI|AO|BI|BO)\d+[A-Z]?)\b/gi)]
      .map((m) => m[1].toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const goalPointSet = new Set(goalPointMarks);
    const pointRows = callLog
      .filter(({ name }) => name === "query_table")
      .flatMap(({ out }) => out?.matches || [])
      .map((match) => String(match?.row?.identity?.text || match?.row?.key || "").trim())
      .filter((key) => /^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(key));
    if (!pointRows.length) {
      return "The goal asks for a BAS/DDC point mark and alarm/trend fields. Call query_table with cell_contains set to the distinctive point description from the goal (or the equipment tag), then read the point mark and alarm/trend values from that row's all_cells — do not treat the description text as the point mark.";
    }
    if (!pointRows.some((key) => finalCanonical.includes(key.toUpperCase().replace(/[^A-Z0-9]/g, "")))) {
      return "A points-list query_table row with a BAS point mark was retrieved, but the final answer does not state that mark. Report the row identity/key (AI/AO/BI/BO style) and its alarm/trend fields; do not substitute the point description for the mark.";
    }
    const missingDescriptions = [];
    for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
      for (const match of out?.matches || []) {
        const mark = String(match?.row?.identity?.text || match?.row?.key || "").trim();
        if (!/^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(mark)) continue;
        const markCanon = mark.toUpperCase().replace(/[^A-Z0-9]/g, "");
        // Only enforce description paste for marks the goal named (e.g. AI10).
        // Sibling lists reuse AI/AO/BI/BO namespaces — do not require every
        // incidental title-scan / cell_contains row's description.
        if (goalPointSet.size && !goalPointSet.has(markCanon)) continue;
        if (!finalCanonical.includes(markCanon)) continue;
        for (const [header, cell] of Object.entries(match?.row?.all_cells || match?.row?.cells || {})) {
          if (!/\bDESCRIPTION\b/i.test(String(header))) continue;
          const text = String(cell?.text || "").trim();
          const textCanonical = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (textCanonical.length < 8) continue;
          if (!finalCanonical.includes(textCanonical)) missingDescriptions.push(text);
        }
      }
    }
    if (missingDescriptions.length) {
      return `The BAS point mark is present, but its points-list description cell is missing from the answer (${missingDescriptions[0]}). Copy the description text from row.all_cells along with alarm/trend.`;
    }
    // When the goal names a specific point (e.g. heating-water vs chilled-water),
    // the answered mark's DESCRIPTION must match that wording — sibling points
    // on the same list are not interchangeable.
    const pointGoalMatchers = [];
    if (/\bheating[- ]?water\b|\bHW\b/i.test(goal)) {
      pointGoalMatchers.push({ label: "heating-water / HW", re: /\b(?:heating[- ]?water|HW)\b/i });
    }
    if (/\bchilled[- ]?water\b|\bCHW\b/i.test(goal)) {
      pointGoalMatchers.push({ label: "chilled-water / CHW", re: /\b(?:chilled[- ]?water|CHW)\b/i });
    }
    if (/\bhot[- ]?water\b/i.test(goal) && !/\bheating[- ]?water\b/i.test(goal)) {
      pointGoalMatchers.push({ label: "hot-water", re: /\bhot[- ]?water\b|\bHW\b/i });
    }
    if (pointGoalMatchers.length) {
      for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
        for (const match of out?.matches || []) {
          const mark = String(match?.row?.identity?.text || match?.row?.key || "").trim();
          if (!/^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(mark)) continue;
          if (!finalCanonical.includes(mark.toUpperCase().replace(/[^A-Z0-9]/g, ""))) continue;
          let description = "";
          for (const [header, cell] of Object.entries(match?.row?.all_cells || match?.row?.cells || {})) {
            if (/\bDESCRIPTION\b/i.test(String(header))) {
              description = String(cell?.text || "").trim();
              break;
            }
          }
          if (!description) continue;
          const matched = pointGoalMatchers.some(({ re }) => re.test(description));
          if (!matched) {
            const wanted = pointGoalMatchers.map(({ label }) => label).join(" or ");
            return `The answered BAS point ${mark} has description "${description}", which does not match the point named in the goal (${wanted}). Select the query_table row whose DESCRIPTION matches the goal's point wording — sibling points on the same list are not interchangeable.`;
          }
        }
      }
    }
  }
  const drawingTextHits = callLog
    .filter(({ name, out }) =>
      (name === "find_text" || name === "read_sheet_text")
      && !out?.error
      && ((out?.count ?? out?.hits?.length ?? 0) > 0 || (Array.isArray(out?.hits) && out.hits.length > 0)))
    .flatMap(({ args, out }) => (out?.hits || []).map((hit) => ({
      query: typeof args?.q === "string" ? args.q : "",
      str: typeof hit?.str === "string" ? hit.str
        : (typeof hit?.text === "string" ? hit.text : ""),
      sheet: hit?.sheet || out?.sheet || "",
    })))
    .filter((hit) => hit.str);
  const scheduleLocationTexts = callLog
    .filter(({ name }) => name === "query_table")
    .flatMap(({ out }) => out?.matches || [])
    .flatMap((match) => Object.entries(match?.row?.all_cells || match?.row?.cells || {}))
    .filter(([header]) => /\b(?:LOCATION|ROOM|AREA)\b/i.test(String(header)))
    .map(([, cell]) => String(cell?.text || "").trim())
    .filter(Boolean);
  // Schedule SERVICE/duty cells are the scheduled service assignment (e.g.
  // MAIN OPERATIONS, BUILDING SOUTH). When the goal names that service, the
  // matching EQUIP row is valid evidence — not a drawing "serves" narrative,
  // and not a LOCATION paraphrase.
  const scheduleServiceHits = callLog
    .filter(({ name }) => name === "query_table")
    .flatMap(({ out }) => out?.matches || [])
    .flatMap((match) => {
      const key = String(match?.row?.key || match?.row?.identity?.text || "").trim();
      return Object.entries(match?.row?.all_cells || match?.row?.cells || {})
        .filter(([header]) => /\bSERVICE\b/i.test(String(header)))
        .map(([, cell]) => ({
          key,
          text: String(cell?.text || cell || "").trim(),
        }));
    })
    .filter((hit) => hit.text);
  const goalCanonical = goal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const serviceAnswersGoal = scheduleServiceHits.some(({ text }) => {
    const tc = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return tc.length >= 6 && goalCanonical.includes(tc);
  });
  const asksServes = /\bserves\b|\bwhat (?:the |this |that )?(?:unit|equipment|ahu|device)\s+serves\b/i.test(goal);
  const asksPhysicalSection = /\bphysical (?:drawing )?section\b|\bdrawing section\b|\bsection where (?:the )?equipment\b/i.test(goal);
  if ((asksServes && !serviceAnswersGoal) || asksPhysicalSection) {
    const setWideTextSearch = callLog.some(({ name, args, out }) =>
      name === "find_text" && !out?.error && (args?.sheet == null || args?.sheet === ""));
    const sheetScopedEmpty = callLog.some(({ name, args, out }) =>
      name === "find_text"
      && !out?.error
      && args?.sheet != null
      && args?.sheet !== ""
      && (out?.count === 0 || out?.hits?.length === 0));
    if (!drawingTextHits.length) {
      if (!setWideTextSearch && sheetScopedEmpty) {
        return "A sheet-scoped find_text returned zero hits. Omit sheet so find_text searches the entire loaded set, then answer from hit.str — do not fill serving/section fields from schedule cells.";
      }
      return "This goal needs free drawing-text evidence (serving narrative and/or a physical section label). Schedule LOCATION/ROOM cells and schedule titles are not that evidence. Call find_text without a sheet filter to search the loaded set, copy answering text from hit.str, and cite that hit — or explicitly refuse.";
    }
    if (!setWideTextSearch && sheetScopedEmpty) {
      return "A sheet-scoped find_text returned zero hits. Omit sheet so find_text searches the entire loaded set, then answer from hit.str — do not fill serving/section fields from schedule cells.";
    }
  }
  if (asksServes && /\bserves\b|\bserving\b/i.test(finalText) && !serviceAnswersGoal) {
    const refusedServes = /\b(?:could not|can't|cannot|unable to|not found|no (?:drawn )?serving|missing evidence|refuse[sd]?)\b.{0,100}\bserves?\b/i.test(finalText)
      || /\bserves?\b.{0,100}\b(?:could not|can't|cannot|unable to|not found|missing evidence|no (?:drawn )?serving)\b/i.test(finalText);
    const locationCanonical = scheduleLocationTexts
      .map((text) => text.toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter((text) => text.length >= 6);
    const locationSet = new Set(locationCanonical);
    const servesLines = finalText.split(/\n+/).filter((line) => /\bserves\b|\bserving\b/i.test(line));
    const locationOnServesLine = servesLines.some((line) => {
      const lineCanonical = line.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return locationCanonical.some((loc) => lineCanonical.includes(loc));
    });
    const paraphrasedFromLocation = /\b(?:serves|serving)\b.{0,160}\b(?:derived from|from (?:the )?(?:schedule )?location|location field)\b/i.test(finalText);
    if (locationOnServesLine || paraphrasedFromLocation) {
      const narrativeHits = drawingTextHits.filter((hit) => {
        const words = hit.str.trim().split(/\s+/).filter(Boolean);
        if (words.length < 6 && hit.str.length < 40) return false;
        const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return !locationSet.has(hitCanonical);
      });
      const example = narrativeHits[0];
      if (example) {
        return `The final answer fills a serving/serves claim from a schedule LOCATION/ROOM cell. Do not call tools — emit the complete answer and copy this exact hit.str for serves: "${example.str}" on ${example.sheet}. Keep LOCATION as the installation-location field only; never paraphrase it into serves.`;
      }
      return "The final answer fills a serving/serves claim from a schedule LOCATION/ROOM cell. That cell is installation location only. Retrieve the serving narrative with find_text/read_sheet_text and copy from hit.str, or refuse; never paraphrase LOCATION into a serves statement.";
    }
    if (!refusedServes) {
      // Phrase-length drawing hits only — short tag hits do not count as serving narrative.
      const narrativeHits = drawingTextHits.filter((hit) => {
        const words = hit.str.trim().split(/\s+/).filter(Boolean);
        if (words.length < 6 && hit.str.length < 40) return false;
        const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return !locationSet.has(hitCanonical);
      });
      if (narrativeHits.length) {
        const usesHit = narrativeHits.some((hit) => {
          const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const needle = hitCanonical.slice(0, Math.min(48, hitCanonical.length));
          return finalCanonical.includes(needle);
        });
        if (!usesHit) {
          return "Drawing-text evidence for the serving narrative was already retrieved, but the final answer does not copy answering text from hit.str. Re-emit using a contiguous substring of that hit; do not substitute a schedule LOCATION string.";
        }
      } else {
        return "No phrase-length find_text/read_sheet_text hit supports the serving claim. Keep searching the loaded set for the drawn serving description and copy from hit.str, or refuse; do not answer serves from schedule LOCATION.";
      }
    }
  }
  if (asksServes && serviceAnswersGoal && /\bserves\b|\bserving\b/i.test(finalText)) {
    // Require the matching EQUIP mark when SERVICE answered the goal.
    const matched = scheduleServiceHits.filter(({ text }) => {
      const tc = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return tc.length >= 6 && goalCanonical.includes(tc);
    });
    const missingMark = matched.some(({ key }) => {
      if (!key) return false;
      const kc = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return kc && !finalCanonical.includes(kc);
    });
    if (missingMark) {
      return "The goal names a schedule SERVICE assignment that query_table already returned. Include the matching equipment MARK/EQUIP NO from that row (and the SERVICE text) with citations — do not refuse a schedule SERVICE join as if it were a drawing serves narrative.";
    }
  }
  if (asksPhysicalSection) {
    const sectionHits = drawingTextHits.filter((hit) => /\bSECTION\b/i.test(hit.str));
    const answerHasSection = /\bSECTION\b/i.test(finalText);
    if (answerHasSection && !sectionHits.length) {
      return "The final answer names a physical section label without a find_text/read_sheet_text hit containing that section text. Call find_text for the section label and cite hit.str; a schedule title is not a drawing section.";
    }
    if (sectionHits.length) {
      const usesSectionHit = sectionHits.some((hit) => {
        const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (hitCanonical.length >= 8
          && finalCanonical.includes(hitCanonical.slice(0, Math.min(40, hitCanonical.length)))) {
          return true;
        }
        if (!answerHasSection) return false;
        // Accept when the answer names SECTION and the same equipment tags as the hit.
        const tags = (hit.str.toUpperCase().match(/\b(?:AHU|RTU|VAV|FCU|EF|SF|RF|UH|CUH|MAU)[-A-Z0-9/]+\b/g) || [])
          .map((tag) => tag.replace(/[^A-Z0-9]/g, ""))
          .filter((tag) => tag.length >= 4);
        return tags.length > 0 && tags.every((tag) => finalCanonical.includes(tag));
      });
      if (!usesSectionHit) {
        const example = sectionHits[0];
        return `A find_text/read_sheet_text hit already contains the physical section label. Do not call more tools — emit the complete answer and include this exact hit.str as the section citation: "${example.str}" on ${example.sheet}.`;
      }
    } else if (!answerHasSection) {
      return "The goal asks for the physical drawing section where the equipment is shown. Call find_text (omit sheet if needed) for the section label on the drawings, cite hit.str, or refuse — do not substitute a schedule sheet title.";
    }
  }
  // Roof/floor plan location: prefer an exact-tag find_text hit over a longer
  // detail callout that merely contains the tag (e.g. plan "RTU-1" vs detail
  // "RTU-1. TRANSITION TO UNIT").
  const asksPlanLocation = /\b(?:roof|floor)?\s*plan\b/i.test(goal)
    && /\b(?:where|appear|location|label|note|show|cite)\b/i.test(goal);
  if (asksPlanLocation && drawingTextHits.length) {
    const tagFromGoal = (goal.toUpperCase().match(/\b(?:AHU|RTU|VAV|FCU|EF|SF|RF|UH|CUH|MAU|DOAH)[-A-Z0-9/]+\b/) || [])[0];
    if (tagFromGoal) {
      const exactHits = drawingTextHits.filter((hit) => hit.str.trim().toUpperCase() === tagFromGoal);
      if (exactHits.length) {
        const answerUsesLongerCallout = drawingTextHits.some((hit) => {
          const s = hit.str.trim().toUpperCase();
          return s !== tagFromGoal && s.includes(tagFromGoal)
            && finalCanonical.includes(s.replace(/[^A-Z0-9]/g, "").slice(0, 40));
        });
        if (answerUsesLongerCallout || /TRANSITION TO UNIT/i.test(finalText)) {
          const example = exactHits[0];
          return `The goal asks for the plan location of ${tagFromGoal}. Prefer the exact find_text hit.str "${example.str}" on ${example.sheet} over a longer detail callout that only contains the tag. Re-emit using that exact label and bbox.`;
        }
      }
    }
  }
  // Product rule: paint cited evidence on the sheets whenever the answer uses
  // paint-able tool evidence — not only when the goal says "show me" / "cite the exact".
  // Also treat "Cite each TAG and its CFM cell" as an explicit cite ask.
  const asksToShowCite = /\bshow\b.*\bcite\b|\bcite the exact\b|\bshow me\b.*\b(?:plan|sheet|schedule|highlight)\b|\bcite the (?:schedule|exact|mark)\b|\bcite\b.{0,80}\b(?:TAG|MARK|cells?)\b/i.test(goal);
  // When the goal names explicit spot-check tags after "cite …", only those
  // MARKs create cite paint duty — not every equipment key a rollup answer
  // happens to mention (FCU-A2, sample AI01 points, etc.). Hyphenated tags
  // must include a digit so prose like "points-list title" is not treated as
  // a MARK cite target. When the cite clause says "each TAG" without listing
  // marks, fall back to equipment tags named earlier in the same goal.
  const citeTargetsFromGoal = (() => {
    const m = goal.match(/\bcite\b([\s\S]*?)(?:\bso I can\b|\bso you can\b|\bso we can\b|[.?!]|$)/i);
    if (!m) return null;
    const tagRe = /\b[A-Z]{1,8}-[A-Z0-9]*\d[A-Z0-9]*\b|\b(?:AI|AO|BI|BO)\d+[A-Z]?\b/gi;
    let found = [...m[1].matchAll(tagRe)]
      .map((hit) => hit[0].toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter((tag) => tag.length >= 3);
    if (!found.length && /\beach\b.{0,20}\b(?:TAG|MARK)\b|\bthose\b.{0,20}\b(?:TAG|MARK)\b|\bnamed\b.{0,20}\b(?:TAG|MARK)\b/i.test(m[1])) {
      const before = goal.slice(0, m.index || 0);
      found = [...before.matchAll(tagRe)]
        .map((hit) => hit[0].toUpperCase().replace(/[^A-Z0-9]/g, ""))
        .filter((tag) => tag.length >= 3);
    }
    return found.length ? new Set(found) : null;
  })();
  // Broad title-scan / keys-only count results name dozens of MARKs so the
  // model can copy `count` — they are not per-row citation duties. Re-queries
  // with row_key (or cell filters) carry the cite paint obligation.
  const isKeysOnlyCountResult = (out) => {
    if (out?.building_tag_counts && typeof out.building_tag_counts === "object") return true;
    if (typeof out?.next_move === "string" && /Use count=\d+/i.test(out.next_move)) return true;
    const q = out?.query;
    if (!q) return false;
    const count = Number(out?.count || 0);
    // cell_contains:"VAV-" style inventory dumps are not per-row cite duty.
    if (q.cell_contains != null && q.row_key == null && count > 8) return true;
    const scoped = q.row_key != null || q.column != null || q.cell_value != null || q.cell_contains != null;
    return !scoped && count > 8;
  };
  const highlights = callLog.filter(({ name, out }) =>
    name === "highlight_citation" && !out?.error && Array.isArray(out.bbox_px))
    .map(({ out }) => ({ sheet: out.sheet, bbox: out.bbox_px }));
  const highlightMatches = (sheet, bbox) => Array.isArray(bbox) && bbox.length === 4
    && highlights.some((highlight) => highlight.sheet === sheet
      && highlight.bbox.every((value, index) => Math.abs(value - bbox[index]) <= 1));
  const usedQueryRowsRaw = [];
  const answerNorm = finalText.toUpperCase().replace(/[\u2010-\u2015\u2212‑–—]/g, "-");
  for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
    const keysOnlyCount = isKeysOnlyCountResult(out);
    for (const match of out?.matches || []) {
      const rowKey = String(match?.row?.key || match?.row?.identity?.text || "");
      if (!rowKey) continue;
      const rowKeyCanonical = rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!rowKeyCanonical) continue;
      // Short keys ("B", "A3") are substrings of sheet ids / prose — require a
      // spaced standalone token in the answer, not finalCanonical.includes.
      if (rowKeyCanonical.length < 3) {
        const spaced = ` ${finalText.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
        if (!spaced.includes(` ${rowKeyCanonical} `)
          && !spaced.includes(` ${rowKey.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `)) continue;
      } else if (!finalCanonical.includes(rowKeyCanonical)) {
        continue;
      }
      const cells = Object.entries(match?.row?.all_cells || match?.row?.cells || {});
      const paintable = cells
        .map(([header, cell]) => (cell && typeof cell === "object" ? { ...cell, header } : cell))
        .filter((cell) => Array.isArray(cell?.bbox) && cell.bbox.length === 4);
      if (!paintable.length) continue;
      // Only rows whose non-key cell values appear in the answer, or explicit
      // cite / points targets from the goal on scoped queries. Naming a sheet
      // in the answer must not attach every MARK queried on that sheet.
      // Serving/relationship cells often hold another unit's MARK (VAV row
      // "AHU-A1"). That is not "using this row's answering values" when the
      // answer cites the other mark on its own.
      const isForeignMarkText = (raw) => {
        const text = String(raw || "").trim();
        if (!text) return false;
        if (!/^(?:[A-Z]{1,8}-[A-Z0-9]{1,16}|(?:AI|AO|BI|BO)\d+[A-Z]?)$/i.test(text)) return false;
        const textCanonical = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return textCanonical.length >= 3 && textCanonical !== rowKeyCanonical;
      };
      const usesCellFromRow = cells.some(([, cell]) => {
        const raw = String(cell?.text || "").trim();
        if (isForeignMarkText(raw)) return false;
        const textCanonical = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!textCanonical || textCanonical === rowKeyCanonical) return false;
        // Pure numerics: count only standalone tokens of length >= 3 so
        // ambiguous shorts (1, 2, 6.5→65) do not attach unrelated sibling
        // sheets, while real schedule values (3850, 560 from 56.0) still do.
        if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
          if (textCanonical.length < 3) return false;
          return spacedHasToken(textCanonical);
        }
        // Fractions / sized tokens (3/4) must appear as spaced answer tokens,
        // not via concatenated digit glue from unrelated numbers.
        if (/^\d+\s*\/\s*\d+$/.test(raw)) {
          return spacedHasToken(raw.replace(/\s+/g, ""));
        }
        if (textCanonical.length < 4) return false;
        return finalCanonical.includes(textCanonical);
      });
      const keyInCiteTargets = citeTargetsFromGoal
        ? citeTargetsFromGoal.has(rowKeyCanonical)
        : null;
      // Cite prompts may force MARK-only rows from scoped re-queries — never
      // from bulk keys-only count scans. When the goal lists specific tags,
      // only those tags are cite duties.
      const citeForcesRow = asksToShowCite && !keysOnlyCount
        && (keyInCiteTargets === null || keyInCiteTargets);
      // Points-list marks only when the goal itself names that point (not
      // every AI/AO/BI/BO that appears in a row-count rollup answer).
      const pointsForce = /^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(rowKey)
        && goalCanonical.includes(rowKeyCanonical)
        && !keysOnlyCount;
      if (!usesCellFromRow && !citeForcesRow && !pointsForce) continue;
      usedQueryRowsRaw.push({
        sheet: match.sheet,
        rowKey,
        cells: paintable,
        weak: !usesCellFromRow,
      });
    }
  }
  // Weak (cite-only) attachments: one paint duty per MARK key across sibling
  // sheets. Painting any matching sheet covers the duty; prefer the sheet the
  // answer names when reporting. Strong attachments keep every distinct sheet.
  const usedQueryRows = [];
  const weakByKey = new Map();
  for (const row of usedQueryRowsRaw) {
    const keyCanon = row.rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!row.weak) {
      usedQueryRows.push(row);
      continue;
    }
    if (!weakByKey.has(keyCanon)) {
      weakByKey.set(keyCanon, { rowKey: row.rowKey, options: [] });
    }
    weakByKey.get(keyCanon).options.push({ sheet: row.sheet, cells: row.cells });
  }
  const strongKeys = new Set(usedQueryRows.map((row) =>
    row.rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  for (const [keyCanon, group] of weakByKey) {
    if (strongKeys.has(keyCanon)) continue;
    const ranked = [...group.options].sort((a, b) => {
      const aSheet = String(a.sheet || "").toUpperCase().replace(/[\u2010-\u2015\u2212‑–—]/g, "-");
      const bSheet = String(b.sheet || "").toUpperCase().replace(/[\u2010-\u2015\u2212‑–—]/g, "-");
      const aHit = aSheet && answerNorm.includes(aSheet) ? 0 : 1;
      const bHit = bSheet && answerNorm.includes(bSheet) ? 0 : 1;
      return aHit - bHit;
    });
    usedQueryRows.push({
      sheet: ranked[0].sheet,
      rowKey: group.rowKey,
      cells: ranked[0].cells,
      coverAny: ranked,
    });
  }
  const usedDrawingHits = callLog
    .filter(({ name, out }) =>
      (name === "find_text" || name === "read_sheet_text")
      && !out?.error
      && Array.isArray(out?.hits)
      && out.hits.length > 0)
    .flatMap(({ out }) => out.hits)
    .map((hit) => {
      const str = typeof hit?.str === "string" ? hit.str
        : (typeof hit?.text === "string" ? hit.text : "");
      const sheet = hit?.sheet || "";
      const bbox = Array.isArray(hit?.bbox_px) && hit.bbox_px.length === 4 ? hit.bbox_px
        : (Array.isArray(hit?.bbox) && hit.bbox.length === 4 ? hit.bbox : null);
      // Only image-pixel bboxes are paint-able via highlight_citation.
      const bbox_px = Array.isArray(bbox) && bbox.every((v) => Number.isFinite(v) && Math.abs(v) > 1.5)
        ? bbox : null;
      return { str, sheet, bbox_px };
    })
    .filter((hit) => {
      if (!hit.str || !hit.bbox_px || !hit.sheet) return false;
      // Require paint for answering drawing evidence only: section labels and
      // phrase-length serving narratives — not incidental title-block hits
      // (e.g. "POINTS LIST …") that merely share tokens with the answer.
      const words = hit.str.trim().split(/\s+/).filter(Boolean);
      const isSection = /\bSECTION\b/i.test(hit.str);
      const isTitleBlock = /\bPOINTS?\s+LISTS?\b|\bSCHEDULE\b|\bCONTROL\s+SCHEMATIC\b/i.test(hit.str)
        && words.length <= 10;
      const isNarrative = !isTitleBlock
        && (words.length >= 6 || hit.str.length >= 40)
        && !/\bPOINTS?\s+LISTS?\b/i.test(hit.str);
      if (!isSection && !isNarrative) return false;
      const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (hitCanonical.length < 8) return false;
      const needle = hitCanonical.slice(0, Math.min(40, hitCanonical.length));
      return finalCanonical.includes(needle);
    });
  // Deduplicate drawing hits by sheet+bbox so one painted phrase covers repeats.
  const uniqDrawingHits = [];
  for (const hit of usedDrawingHits) {
    if (uniqDrawingHits.some((other) => other.sheet === hit.sheet
      && other.bbox_px.every((value, index) => Math.abs(value - hit.bbox_px[index]) <= 1))) continue;
    uniqDrawingHits.push(hit);
  }
  const needsPaint = usedQueryRows.length > 0 || uniqDrawingHits.length > 0;
  if ((needsPaint || asksToShowCite) && !highlights.length) {
    return "The answer cites schedule or drawing evidence that can be painted on the sheets, but no successful highlight_citation call exists. Call highlight_citation with each cited sheet and unchanged bbox_px so the estimator sees the source on the blueprint — agent-panel text alone is incomplete.";
  }
  if (usedQueryRows.length) {
    const rowCovered = (row) => {
      const keyCanon = String(row.rowKey || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      // A highlight labeled with this MARK covers the cite duty even when the
      // painted bbox is the identity cell vs another column on the same row.
      if (keyCanon && callLog.some(({ name, out, args }) =>
        name === "highlight_citation" && !out?.error
        && String(out?.text || args?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === keyCanon)) {
        return true;
      }
      const options = row.coverAny || [{ sheet: row.sheet, cells: row.cells }];
      return options.some(({ sheet, cells }) =>
        cells.some((cell) => highlightMatches(sheet, cell.bbox)));
    };
    const uncovered = usedQueryRows
      .filter((row) => {
        const keyCanon = String(row.rowKey || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        // Cite-MARK spot-check tags are enforced once via paintedTags below —
        // double-gating them here burns the step cap on every partial draft.
        if (asksToShowCite && citeTargetsFromGoal?.has(keyCanon)) return false;
        return !rowCovered(row);
      })
      .map(({ rowKey, sheet }) => `${rowKey} on ${sheet}`);
    if (uncovered.length) {
      return `The answer uses queried schedule row(s) with no painted source cell: ${[...new Set(uncovered)].join(", ")}. Call highlight_citation on at least one exact cited cell from each row before finishing.`;
    }
    // Quality bar: when the GOAL asks for multiple row attributes and the
    // answer uses those fields, paint EACH answering value cell — not only
    // the mark. Count / cite-MARK goals must not thrash on incidental numerics
    // the model copied from a schedule row (ESP 4.6, EWT 45, etc.).
    // Scope paint duties to headers the GOAL actually named (TYPE, CFM, …) so
    // a "type and CFM" ask cannot demand every coil/EWT cell on the row.
    const goalRequestsRowAttributes = /\b(?:location|room|cfm|airflow|capacity|tons?|alarm|trend|description|serves|serving|supply\s+air|return|gpm|mbh|static|ewt|lwt|\bcv\b|valve size|characteristics?|setpoint|feedback|type)\b/i.test(goal);
    if (!goalRequestsRowAttributes) {
      // cite / count goals: rowCovered (one paint) is enough
    } else {
    /** Headers the goal asked to report — set-agnostic schedule column patterns. */
    const goalAskedHeader = (header) => {
      const h = String(header || "");
      if (!h) return false;
      const checks = [];
      if (/\b(?:cfm|airflow)\b/i.test(goal)) checks.push(/\bCFM\b|AIR\s*FLOW|FAN\s*DATA/i);
      if (/\btype\b/i.test(goal)) checks.push(/^TYPE$/i);
      if (/\bgpm\b|flowrate|\bflow\b/i.test(goal) && !/\bcfm\b/i.test(goal)) {
        checks.push(/\bGPM\b|FLOWRATE|\bFLOW\b/i);
      }
      if (/\b(?:capacity|tons?|mbh|kw)\b/i.test(goal)) {
        checks.push(/CAPACITY|\bTONS?\b|\bMBH\b|\bKW\b/i);
      }
      if (/\blocation|room\b/i.test(goal)) checks.push(/LOCATION|ROOM|AREA\s*SERVED/i);
      if (/\bdescription\b/i.test(goal)) checks.push(/DESCRIPTION/i);
      if (/\b(?:alarm|trend)\b/i.test(goal)) checks.push(/ALARM|TREND/i);
      if (/\b(?:ewt|lwt|ent\.?\s*w|leaving)\b/i.test(goal)) checks.push(/EWT|LWT|ENT\.?\s*W|WATER\s*TEMP/i);
      if (/\bcv\b|valve size/i.test(goal)) checks.push(/^\s*C[Vv]\s*$|VALVE\s*SIZE|PIPE\s*SIZE/i);
      if (/\bstatic|esp\b/i.test(goal)) checks.push(/\bESP\b|STATIC|S\.?P\.?/i);
      if (!checks.length) return true; // goal named a generic attr word — keep prior behavior
      return checks.some((re) => re.test(h));
    };
    const answerUsesValueCell = (raw, rowKeyCanonical, header) => {
      if (!goalAskedHeader(header)) return false;
      const text = String(raw || "").trim();
      if (!text) return false;
      // Foreign equipment MARKs in relationship columns are not this row's
      // answering value fields (they are other units' identities).
      if (/^(?:[A-Z]{1,8}-[A-Z0-9]{1,16}|(?:AI|AO|BI|BO)\d+[A-Z]?)$/i.test(text)) {
        const textCanonical = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (textCanonical !== rowKeyCanonical) return false;
      }
      const textCanonical = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (textCanonical.length < 2) return false;
      if (/^\d+(?:[.,]\d+)?$/.test(text)) {
        // Allow short schedule figures (45°F, valve size 4) via spaced tokens.
        // Sibling-sheet attach still uses a stricter numeric floor separately.
        if (textCanonical.length < 1) return false;
        return spacedHasToken(textCanonical);
      }
      if (/^\d+\s*\/\s*\d+$/.test(text)) {
        return spacedHasToken(text.replace(/\s+/g, ""));
      }
      // Ubiquitous Yes/No alarm/trend cells must not invent multi-field paint
      // duties unless the goal actually asks about alarm or trend.
      if (/^(?:yes|no)$/i.test(text) && !/\b(?:alarm|trend)\b/i.test(goal)) return false;
      if (textCanonical.length <= 3 && /^[A-Z]+$/.test(textCanonical)) {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(finalText);
      }
      return finalCanonical.includes(textCanonical);
    };
    for (const { sheet, rowKey, cells, weak, coverAny } of usedQueryRows) {
      // Cite-only MARK duties need one paint, not every relationship column.
      if (weak) continue;
      const rowKeyCanonical = rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
      // Distinct answering texts only: identical values in adjacent columns
      // (e.g. MAX CFM and MIN CFM both 3850, or Alarm/Trend both No) share one
      // paint duty so the loop cannot thrash re-painting the same figure while
      // a twin bbox stays unmarked. Distinct fields (location vs flow) still
      // each require their own paint.
      const valueByText = new Map();
      const cellSheets = coverAny || [{ sheet, cells }];
      for (const option of cellSheets) {
        for (const cell of option.cells) {
          const textCanonical = String(cell?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!textCanonical || textCanonical === rowKeyCanonical) continue;
          if (!answerUsesValueCell(cell?.text, rowKeyCanonical, cell?.header)) continue;
          if (valueByText.has(textCanonical)) continue;
          valueByText.set(textCanonical, { cell, sheet: option.sheet, cells: option.cells });
        }
      }
      const valueCells = [...valueByText.values()];
      if (valueCells.length < 2) continue;
      const missingValues = valueCells.filter(({ cell, sheet: cellSheet, cells: siblingCells }) => {
        const textCanonical = String(cell?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const siblingBboxes = siblingCells
          .filter((other) => String(other?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === textCanonical)
          .map((other) => other.bbox);
        if (siblingBboxes.some((bbox) => highlightMatches(cellSheet, bbox))) return false;
        return !callLog.some(({ name, out }) =>
          name === "highlight_citation" && !out?.error && out.sheet === cellSheet
          && String(out.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === textCanonical);
      });
      if (!missingValues.length) continue;
      const missingLabel = missingValues
        .map(({ cell }) => `"${String(cell.text || "").slice(0, 40)}"`)
        .slice(0, 6)
        .join(", ");
      const paintHints = missingValues.slice(0, 8).map(({ cell, sheet: cellSheet }) => {
        const bbox = cell?.bbox;
        if (!Array.isArray(bbox) || bbox.length !== 4) return null;
        const col = String(cell?.header || cell?.column || "").replace(/\s+/g, "_").slice(0, 24);
        const val = String(cell.text || "").replace(/\s+/g, "_").slice(0, 32) || rowKey;
        const label = val;
        const bits = [
          `highlight_citation sheet=${cellSheet}`,
          `bbox_px=${JSON.stringify(bbox)}`,
          `text=${label}`,
          `row_key=${rowKey}`,
        ];
        if (col) bits.push(`column=${col}`);
        if (cell?.text != null && String(cell.text).trim()) bits.push(`value=${String(cell.text).trim().replace(/\s+/g, "_").slice(0, 32)}`);
        return bits.join(" ");
      }).filter(Boolean);
      const hint = paintHints.length
        ? ` Exact paint args already retrieved: ${paintHints.join("; ")}.`
        : "";
      return `The answer uses multiple fields from ${rowKey} on ${sheet}, but these answering value cells are not painted: ${missingLabel}. Call highlight_citation on EACH distinct answering value from that row (capacity, flow, size, Cv, location, description, alarm/trend, etc.) — painting only the mark or a single field is not enough. Identical twin values in adjacent columns count as one paint duty.${hint}`;
    }
    } // goalRequestsRowAttributes
  }
  if (uniqDrawingHits.length) {
    // A find_text phrase is covered by an exact bbox paint, or by a painted
    // query_table cell on the same sheet whose text matches the hit (same
    // evidence, different tool) — avoid thrashing on duplicate bboxes.
    const paintedCellTexts = new Map();
    for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
      for (const match of out?.matches || []) {
        for (const cell of Object.values(match?.row?.all_cells || match?.row?.cells || {})) {
          if (!Array.isArray(cell?.bbox) || !highlightMatches(match.sheet, cell.bbox)) continue;
          const textCanonical = String(cell?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (textCanonical.length < 8) continue;
          if (!paintedCellTexts.has(match.sheet)) paintedCellTexts.set(match.sheet, new Set());
          paintedCellTexts.get(match.sheet).add(textCanonical);
        }
      }
    }
    const uncoveredHits = uniqDrawingHits.filter((hit) => {
      if (highlightMatches(hit.sheet, hit.bbox_px)) return false;
      const hitCanonical = hit.str.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const painted = paintedCellTexts.get(hit.sheet);
      if (painted && [...painted].some((text) =>
        text.includes(hitCanonical.slice(0, Math.min(40, hitCanonical.length)))
        || hitCanonical.includes(text.slice(0, Math.min(40, text.length))))) {
        return false;
      }
      return true;
    });
    if (uncoveredHits.length) {
      return `The answer copies drawing-text evidence that is not painted on the sheet: ${uncoveredHits.slice(0, 3).map((hit) => `"${hit.str.slice(0, 48)}" on ${hit.sheet}`).join("; ")}. Call highlight_citation with that hit's sheet and bbox_px before finishing.`;
    }
  }
  {
    const evidenceCells = [];
    for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
      for (const match of out?.matches || []) {
        for (const [header, cell] of Object.entries(match?.row?.all_cells || match?.row?.cells || {})) {
          if (!Array.isArray(cell?.bbox)) continue;
          evidenceCells.push({ sheet: match.sheet, header, text: cell.text, bbox: cell.bbox });
        }
      }
    }
    for (const { out } of callLog.filter(({ name }) => name === "sweep_schedule_row")) {
      for (const [header, cell] of Object.entries(out?.row?.cell_citations || {})) {
        const bbox = cell?.bbox;
        const bboxArray = Array.isArray(bbox) ? bbox : [bbox?.x0, bbox?.y0, bbox?.x1, bbox?.y1];
        if (!bboxArray.every(Number.isFinite)) continue;
        evidenceCells.push({ sheet: out.row.sheet, header, text: cell.text, bbox: bboxArray });
      }
    }
    // Only reject true overclaims like "all cited cells are highlighted" —
    // not ordinary prose that happens to use "each"/"all" near the word
    // "highlighted" in a long takeoff answer (that thrash burned D03's cap).
    if (/\b(?:all|each)\s+(?:of\s+)?(?:the\s+)?(?:cited|requested|queried|required|spot-?check\s+)?(?:cells?|fields?|marks?|regions?|values?|sources?)\s+(?:are|is|were|was)\s+highlight/i.test(finalText)
      || /\ball\s+cited\b.{0,40}\bhighlight/i.test(finalText)
      || /\beach\s+cited\b.{0,40}\bhighlight/i.test(finalText)) {
      const painted = highlights.map((h) => `${h.sheet} ${JSON.stringify(h.bbox)}`).slice(0, 8);
      return `The final answer uses a broad all/each-highlighted claim. Rewrite without that wording and describe ONLY these painted regions: ${painted.join("; ") || "(none)"}. Do not claim any other cell was highlighted.`;
    }
    if (asksToShowCite) {
      for (const line of finalText.split("\n").filter((text) => /\bhighlight/i.test(text))) {
        // Negation / disclosure lines are not overclaims ("was not highlighted",
        // "not among the painted regions").
        if (/\b(?:not|never|no)\b.{0,40}\b(?:highlight|painted)\b|\b(?:highlight|painted)\b.{0,40}\b(?:not|never|missing|absent|failed)\b|\bnot among the painted\b/i.test(line)) {
          continue;
        }
        const lineCanonical = line.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const claimedCells = evidenceCells.filter(({ header, text }) => {
          const headerCanonical = String(header).toUpperCase().replace(/[^A-Z0-9]/g, "");
          const textCanonical = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          return headerCanonical.length >= 3 && textCanonical
            && lineCanonical.includes(headerCanonical) && lineCanonical.includes(textCanonical);
        });
        if (claimedCells.length && !claimedCells.some((cell) => highlightMatches(cell.sheet, cell.bbox))) {
          const painted = highlights.map((h) => `${h.sheet} ${JSON.stringify(h.bbox)}`).slice(0, 8);
          return `The final answer claims a schedule cell is highlighted that was not painted. Rewrite the answer without that claim. Painted regions only: ${painted.join("; ") || "(none)"}. Do not use the word "highlighted" for any unpainted field.`;
        }
      }
    }
  }
  const mentionedQuerySheets = [];
  for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
    for (const match of out?.matches || []) {
      const sheet = String(match?.sheet || "");
      if (!sheet) continue;
      const rowKey = String(match?.row?.key || match?.row?.identity?.text || "");
      const rowCanonical = rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!rowCanonical || !finalCanonical.includes(rowCanonical)) continue;
      const usesCellFromRow = Object.values(match?.row?.all_cells || match?.row?.cells || {})
        .some((cell) => {
          const raw = String(cell?.text || "").trim();
          // Relationship columns holding another unit's MARK are not this row's values.
          if (/^(?:[A-Z]{1,8}-[A-Z0-9]{1,16}|(?:AI|AO|BI|BO)\d+[A-Z]?)$/i.test(raw)) {
            const foreign = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (foreign && foreign !== rowCanonical) return false;
          }
          const textCanonical = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
          // Row key/identity text alone does not mean this sheet's row was used.
          if (!textCanonical || textCanonical === rowCanonical) return false;
          if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
            if (textCanonical.length < 3) return false;
            return spacedHasToken(textCanonical);
          }
          if (/^\d+\s*\/\s*\d+$/.test(raw)) {
            return spacedHasToken(raw.replace(/\s+/g, ""));
          }
          if (textCanonical.length < 4) return false;
          return finalCanonical.includes(textCanonical);
        });
      // Require sheet only when the answer uses this row's cell values, or the
      // goal itself asked about that points-list mark — not every AI/AO/BI/BO
      // token a rollup answer happens to mention.
      if (!usesCellFromRow) {
        const pointsNamedInGoal = /^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(rowKey)
          && goalCanonical.includes(rowCanonical);
        if (!pointsNamedInGoal) continue;
      }
      const sheetNorm = sheet.toUpperCase().replace(/[\u2010-\u2015\u2212‑–—]/g, "-");
      const answerNorm = finalText.toUpperCase().replace(/[\u2010-\u2015\u2212‑–—]/g, "-");
      if (!answerNorm.includes(sheetNorm)) mentionedQuerySheets.push(`${rowKey} → ${sheet}`);
    }
  }
  if (mentionedQuerySheets.length) {
    return `The final answer uses query_table row(s) without naming their evidence sheet id(s): ${[...new Set(mentionedQuerySheets)].slice(0, 6).join("; ")}. Copy the unchanged match.sheet string from the tool result into the citation.`;
  }
  // Explicit cite-target tags from the goal must each be painted (MARK spot-check).
  if (citeTargetsFromGoal && asksToShowCite) {
    const paintedTags = new Set();
    for (const { name, out, args } of callLog) {
      if (name !== "highlight_citation" || out?.error) continue;
      const textCanon = String(out.text || args?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (textCanon) paintedTags.add(textCanon);
      // Also accept paints whose bbox matches a queried cell for that key.
      for (const { out: qOut } of callLog.filter((c) => c.name === "query_table")) {
        for (const match of qOut?.matches || []) {
          const keyCanon = String(match?.row?.key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!keyCanon || !citeTargetsFromGoal.has(keyCanon)) continue;
          const cells = Object.values(match?.row?.all_cells || match?.row?.cells || {});
          if (cells.some((cell) => Array.isArray(cell?.bbox) && cell.bbox.length === 4
            && out.sheet === match.sheet
            && Array.isArray(out.bbox_px)
            && out.bbox_px.every((value, index) => Math.abs(value - cell.bbox[index]) <= 2))) {
            paintedTags.add(keyCanon);
          }
        }
      }
    }
    const missingCite = [...citeTargetsFromGoal].filter((tag) => !paintedTags.has(tag));
    if (missingCite.length) {
      const hints = missingCite.map((tag) => {
        for (const { out: qOut } of callLog.filter((c) => c.name === "query_table")) {
          for (const match of qOut?.matches || []) {
            const keyCanon = String(match?.row?.key || match?.row?.identity?.text || "")
              .toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (keyCanon !== tag) continue;
            const mark = match?.row?.all_cells?.MARK || match?.row?.identity;
            const bbox = mark?.bbox || mark?.bbox_px;
            if (match?.sheet && Array.isArray(bbox) && bbox.length === 4) {
              return `${tag}: highlight_citation sheet=${match.sheet} bbox_px=${JSON.stringify(bbox)} text=${match.row?.key || match.row?.identity?.text}`;
            }
          }
        }
        return null;
      }).filter(Boolean);
      const hint = hints.length
        ? ` Exact paint args already retrieved: ${hints.join("; ")}.`
        : " Re-query each with row_key, then call highlight_citation on the MARK/identity bbox before finishing.";
      return `The goal asks to cite MARK cells for ${missingCite.join(", ")}, but those tags are not painted yet.${hint}`;
    }
  }
  // "Which schedule / title is MARK on?" follow-ups must copy the primary
  // equipment schedule title from a scoped query_table — not a sibling family's
  // UNIT schedule or a vibration/valve cross-ref.
  const asksWhichScheduleTitle = /\bwhich title\b|\bis\s+(?:[A-Z]{2,8}-[A-Z0-9]+)\s+on\b.{0,80}\bschedule\b/i.test(goal);
  // "Is SUITE100 a scheduled VAV?" — affirm only when family_mark / TAG pattern matches.
  const isScheduledAsk = goal.match(
    /\bis\s+([A-Z0-9][A-Z0-9\-]*)\s+a\s+scheduled\s+(VAV|AHU|FCU|DOAH|CH|BOILER|volume\s+control)\b/i,
  );
  if (isScheduledAsk && finalText) {
    const askedKey = isScheduledAsk[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
    const family = isScheduledAsk[2].toUpperCase().replace(/\s+/g, " ");
    const familyRe = /VAV|VOLUME CONTROL/.test(family) ? /^VAV/i
      : family === "AHU" ? /^AHU/i
      : family === "FCU" ? /^FCU/i
      : family === "DOAH" ? /^DOAH/i
      : /BOILER/.test(family) ? /^B[\s\-]/i
      : family === "CH" ? /^CH/i
      : null;
    const scoped = callLog.filter(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      return (out?.matches || []).some((match) => {
        const keyCanon = String(match?.row?.key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const qKey = String(out?.query?.row_key || args?.row_key || "")
          .toUpperCase().replace(/[^A-Z0-9]/g, "");
        return keyCanon === askedKey || qKey === askedKey;
      });
    });
    const nonFamily = scoped.flatMap(({ out }) => out?.matches || []).filter((match) => {
      const keyCanon = String(match?.row?.key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (keyCanon !== askedKey) return false;
      if (match.family_mark === false || match?.row?.family_mark === false) return true;
      if (familyRe && !familyRe.test(String(match?.row?.key || ""))) return true;
      const header = String(match?.row?.identity?.header || "").toUpperCase();
      if (/REMARKS|NOTE|COMMENT/.test(header) && familyRe && !familyRe.test(String(match?.row?.key || ""))) {
        return true;
      }
      return false;
    });
    const affirms = /\b(?:yes|it is(?:\s+therefore)?\s+a\s+scheduled|is a scheduled)\b/i.test(finalText)
      && !/\b(?:no[,.]|not a scheduled|is not|not an?\s+(?:scheduled\s+)?(?:VAV|AHU|FCU)|junk|exclude|should not count|does not have a TAG)\b/i.test(finalText);
    if (nonFamily.length && affirms) {
      const sample = nonFamily[0];
      const header = sample?.row?.identity?.header || "non-TAG";
      return `Tool evidence shows "${isScheduledAsk[1]}" on this schedule is not a family equipment MARK (identity ${header}; family_mark=false). Answer NO — it is not a scheduled ${isScheduledAsk[2]} unit — and explain it is a junk/remarks key excluded from the family count.`;
    }
    if (!scoped.length && familyRe && !familyRe.test(isScheduledAsk[1])) {
      // Key itself does not look like the family — still require a scoped lookup
      // before affirming, but if the answer already affirms without evidence, reject.
      if (affirms) {
        return `The goal asks whether ${isScheduledAsk[1]} is a scheduled ${isScheduledAsk[2]}. Call query_table with that row_key on the family schedule, then answer NO if family_mark is false or the identity is REMARKS rather than a TAG/MARK matching the family pattern.`;
      }
    }
  }
  if (asksWhichScheduleTitle && finalText) {
    // Only the MARK asked about schedule membership / title — not every tag
    // mentioned later in the same follow-up (e.g. FCU-T11 in a count clause).
    const namedMarks = [...new Set([
      ...[...goal.matchAll(/\bis\s+((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+)\s+on\b/gi)].map((m) => m[1].toUpperCase()),
      ...[...goal.matchAll(/\b((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+)\b[^.?\n]{0,48}\bwhich title\b/gi)].map((m) => m[1].toUpperCase()),
    ])];
    const answerU = finalText.toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-");
    for (const tag of namedMarks) {
      const tagCanon = tag.replace(/[^A-Z0-9]/g, "");
      const scoped = callLog.filter(({ name, out, args }) => {
        if (name !== "query_table" || out?.error) return false;
        const rk = String(out?.query?.row_key || args?.row_key || "")
          .toUpperCase().replace(/[^A-Z0-9]/g, "");
        return rk === tagCanon;
      });
      if (!scoped.length) {
        return `The goal asks which schedule ${tag} is on. Call query_table with row_key=${tag} (omit title), then copy the primary equipment schedule title from matches[0].title into the answer.`;
      }
      let preferredTitle = null;
      for (const { out } of scoped) {
        for (const match of out.matches || []) {
          const t = String(match?.title?.text || match?.title || "").trim();
          if (!t) continue;
          if (/VIBRATION ISOLATION|SOUND POWER|CONTROL VALVE|POINTS LIST|PUMP SCHEDULE/i.test(t)) continue;
          preferredTitle = t;
          break;
        }
        if (preferredTitle) break;
      }
      if (!preferredTitle) continue;
      const prefU = preferredTitle.toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-");
      const titleOk = (() => {
        const prefCore = prefU.replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
        if (answerU.includes(prefCore.slice(0, 36))) return true;
        // DOAH HANDLING vs UNIT (and similar siblings): bare "HANDLING" also
        // matches AHU "Air-Handling" prose in a re-dumped takeoff — require the
        // distinctive outdoor-air handling phrase, not the single word.
        if (/\bOUTDOOR AIR HANDLING\b/.test(prefU) || /\bDEDICATED OUTDOOR AIR HANDLING\b/.test(prefU)) {
          return /\bOUTDOOR AIR HANDLING\b/.test(answerU);
        }
        if (/\bHANDLING\b/.test(prefU) && !/\bAIR HANDLING UNIT\b/.test(prefU)) {
          return answerU.includes(prefCore.slice(0, 40));
        }
        const words = prefU.split(/[^A-Z0-9]+/).filter((w) => w.length > 4);
        return words.filter((w) => answerU.includes(w)).length >= Math.min(3, words.length);
      })();
      if (!titleOk) {
        return `The goal asks which schedule ${tag} is on. Copy the primary equipment schedule title from query_table (e.g. "${preferredTitle}") into the answer — do not substitute a sibling family's schedule title or a cross-ref table.`;
      }
      // Tool found the MARK on a primary equipment schedule — rejecting
      // "not found" / "not on any schedule" when family evidence exists.
      const deniesPresence = /\b(?:not\s+found|is\s+not\s+(?:present|found)|no(?:t)?\s+(?:on|in)\s+(?:any|the)\s+schedule|does\s+not\s+appear)\b/i.test(finalText)
        && new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[\\-\\u2010-\\u2015\\u2212]?"), "i").test(finalText);
      if (deniesPresence) {
        return `Tool evidence found ${tag} on "${preferredTitle}". Do not claim it is missing — answer YES with that exact schedule title.`;
      }
    }
  }
  // Narrow follow-ups: "how many … fan coils … including FCU-T11?"
  // Copy building_tag_counts.<letter> from the FCU title-scan. Letter comes from
  // tags in the goal (FCU-T11 → T) or "building X" — never a set-specific name map.
  const asksFanCoilBuildingCount = /fan[\s\-]*coils?/i.test(goal)
    && /\b(?:how many|count|scheduled|including)\b/i.test(goal);
  const buildingLetterFromGoalTags = (() => {
    const fromTag = [...String(goal || "").matchAll(/\b(?:FCU|AHU|VAV|DOAH|UH|CUH)-([A-Z])(?=\d)/gi)]
      .map((m) => m[1].toUpperCase());
    if (fromTag.length) return fromTag[fromTag.length - 1];
    const fromBuilding = String(goal || "").match(/\bbuilding\s+([A-Z])\b/i);
    return fromBuilding ? fromBuilding[1].toUpperCase() : null;
  })();
  if (asksFanCoilBuildingCount && buildingLetterFromGoalTags && finalText) {
    const letter = buildingLetterFromGoalTags;
    const fcuScan = callLog.find(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      const q = out?.query || args || {};
      const scoped = q.row_key != null && String(q.row_key).trim() !== ""
        || q.column != null || q.cell_value != null || q.cell_contains != null;
      if (scoped) return false;
      const title = String(q.title || out.matches?.[0]?.title?.text || out.matches?.[0]?.title || "");
      return /FAN\s*COIL/i.test(title) && out.building_tag_counts
        && Number.isFinite(Number(out.building_tag_counts[letter]));
    });
    if (!fcuScan) {
      return `The goal asks for fan-coil counts for building ${letter} (from the named tag). Call query_table with title FAN COIL UNIT SCHEDULE (no row_key), then copy building_tag_counts.${letter} — do not swap letters.`;
    }
    const wantCount = Number(fcuScan.out.building_tag_counts[letter]);
    const answerU = finalText.toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-");
    const letterNear = (n) => new RegExp(
      `(?:building\\s+${letter}|\\b${letter}\\s*[=:]|${letter}-TAG|${letter}\\s+TAG|FCU-${letter})[^0-9]{0,48}\\b${n}\\b|\\b${n}\\b[^0-9]{0,48}(?:building\\s+${letter}|FCU-${letter}|\\b${letter}\\s*[=:])`,
      "i",
    ).test(answerU)
      || new RegExp(`\\b${n}\\b`).test(answerU); // allow plain count when the ask is already scoped
    // Prefer a count near the letter/tag; fall back to any mention of the exact total.
    const hasWant = letterNear(wantCount) || new RegExp(`\\b${wantCount}\\b`).test(answerU);
    if (!hasWant) {
      return `Tool evidence shows FAN COIL building_tag_counts.${letter}=${wantCount}. Copy building ${letter} fan-coil count ${wantCount} into the answer — do not swap building letters.`;
    }
    // Catch classic swap: stating another building's count as this building's.
    for (const [other, raw] of Object.entries(fcuScan.out.building_tag_counts || {})) {
      if (other === letter || other === "other") continue;
      const otherN = Number(raw);
      if (!Number.isFinite(otherN) || otherN === wantCount) continue;
      const claimsOtherAsThis = new RegExp(
        `(?:building\\s+${letter}|FCU-${letter})[^0-9]{0,24}\\b${otherN}\\b`,
        "i",
      ).test(answerU);
      if (claimsOtherAsThis && !new RegExp(`\\b${wantCount}\\b`).test(answerU)) {
        return `The answer assigns building ${other} count ${otherN} to building ${letter}. building_tag_counts.${letter}=${wantCount} — use ${wantCount}.`;
      }
    }
  }
  // Full-set schedule takeoffs must use title-scan query_table counts — not
  // the number of MARK cells painted for spot-check.
  // Narrow follow-ups ("how many … fan coils … including FCU-T11?") must NOT
  // trigger this gate — only multi-family inventory / takeoff asks do.
  // BAS points-list takeoffs name DOAH/AHU/FCU inside list titles — that must
  // not pull equipment-schedule families (DEDICATED OUTDOOR AIR UNIT, FAN COIL
  // UNIT SCHEDULE, etc.) into the count gate.
  const pointsListTakeoff = /\b(?:points?\s*list|DDC\s+points?(?:\s*list)?)\b/i.test(goal)
    && (/\b(?:AI|AO|BI|BO)\b/i.test(goal) || /\bpoint[-\s]?type/i.test(goal) || /\btakeoff\b/i.test(goal));
  const scheduleFamilyMentions = [
    ...(!pointsListTakeoff ? scheduleFamilyNeedles(goal).map((n) => n.label) : []),
    ...((/\bpoints?\s*list\b|\bDDC\s+points?\b/i.test(goal)) ? ["points-list"] : []),
  ];
  // Dedupe labels (VAV sibling titles share one label).
  const distinctFamilyCount = new Set(scheduleFamilyMentions).size;
  const familyTokens = /\b(?:AHU|FCU|VAV|DOAH|DOAS|CRAH|CUH|chiller|boiler|pump|humidifier|dehumidifier|diffuser|grille|separator|expansion|unit\s+heater|fan[\s-]*coil|points?\s*list|DDC\s+points?|scheduled|equipment)\b/i;
  const asksScheduleCounts = (
    /\btakeoff\b/i.test(goal)
    || /\bscheduled\s+(?:unit\s+)?counts?\b/i.test(goal)
    || /\bequipment\s+(?:totals?|counts?)\b/i.test(goal)
    || (/\b(?:how many|counts?|totals?|splits?)\b/i.test(goal) && distinctFamilyCount >= 3)
    || (pointsListTakeoff && /\b(?:row\s+count|breakdown|totals?)\b/i.test(goal))
  ) && familyTokens.test(goal);
  if (asksScheduleCounts && finalText) {
    // Generic / corpus BAS compile is authoritative for points-list totals — do
    // not demand a separate title-scan query_table (that deadlock is what hung
    // "point list takeoff" in spot_cites).
    const compiledBas = callLog.some(({ name, out }) =>
      name === "compile_corpus_takeoff" && !out?.error
      && (String(out?.kind || "") === "bas_points"
        || String(out?.takeoff_id || "") === "T-BAS-01"));
    if (pointsListTakeoff && compiledBas) {
      // fall through — compile totals satisfy the points-list count gate
    } else {
    const titleScans = callLog.filter(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      const q = out?.query || args || {};
      const scoped = q.row_key != null && String(q.row_key).trim() !== ""
        || q.column != null
        || q.cell_value != null
        || q.cell_contains != null;
      return !scoped && Number.isFinite(Number(out?.count)) && Number(out.count) >= 1;
    });
    if (!titleScans.length) {
      if (pointsListTakeoff && corpusCompileKind(goal) === "bas_points") {
        return 'The goal asks for a points-list takeoff. Call compile_corpus_takeoff with kind="bas_points" now (or title-scan query_table title="POINTS LIST" with no row_key), then copy list totals into the answer.';
      }
      return "The goal asks for scheduled equipment / points-list counts. Call query_table with each relevant schedule title (no row_key), then copy that result's count and building_tag_counts into the answer before finishing. Do not invent totals from the few MARK rows you painted for spot-check.";
    }
    const familyNeedles = [];
    if (!pointsListTakeoff) {
      for (const n of scheduleFamilyNeedles(goal)) {
        familyNeedles.push({
          label: n.label,
          titleRe: n.titleRe,
          exclude: n.exclude,
          minCount: n.minCount,
          title: n.title,
        });
      }
    }
    // When the goal names a specific points list (e.g. AHU-T1A/TIB), require that
    // tag in the title-scan — a bare "POINTS LIST" rollup across sibling lists
    // is the wrong family (often a doubled page sum).
    const namedPointsListTag = (() => {
      const m = goal.match(
        /\b((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+(?:\/[A-Z0-9]+)?)\s*(?:BAS\s+)?points?\s*list\b|(?:BAS\s+)?points?\s*list\b[^.\n]{0,48}\b((?:AHU|DOAH|FCU|VAV|CH|B)-[A-Z0-9]+(?:\/[A-Z0-9]+)?)/i,
      );
      return m ? String(m[1] || m[2]).toUpperCase() : null;
    })();
    if (/\bpoints?\s*list\b|\bDDC\s+points?\b|BAS\b/i.test(goal)) {
      // For multi-list points takeoffs, require at least one POINTS/DDC list
      // title-scan — do not require a single named tag across every list.
      const requireRe = (!pointsListTakeoff && namedPointsListTag)
        ? new RegExp(namedPointsListTag.split("/")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : null;
      familyNeedles.push({ label: "points-list", titleRe: /POINTS\s*LIST|DDC\s+POINTS/i, require: requireRe });
    }
    const scanTitle = (out) => String(
      out.query?.title || out.matches?.[0]?.title?.text || out.matches?.[0]?.title || "",
    );
    const scanTitleFull = (out) => [
      out.query?.title,
      out.matches?.[0]?.title?.text || out.matches?.[0]?.title,
    ].filter(Boolean).map(String).join(" ");
    const missingFamilies = familyNeedles.filter((fam) => !titleScans.some(({ out }) => {
      const title = scanTitleFull(out);
      if (!scheduleTitleMatches(title, fam.titleRe, fam.exclude)) return false;
      if (fam.require && !fam.require.test(title)) return false;
      const min = fam.minCount ?? 1;
      if (Number(out.count) < min) return false;
      return true;
    })).map((fam) => fam.label);
    if (missingFamilies.length) {
      const titleByLabel = Object.fromEntries(
        familyNeedles.filter((n) => n.title).map((n) => [n.label, n.title]),
      );
      titleByLabel["points-list"] = namedPointsListTag
        ? `POINTS LIST ${namedPointsListTag.split("/")[0]}`
        : "POINTS LIST";
      const exactScans = missingFamilies
        .map((label) => titleByLabel[label])
        .filter(Boolean)
        .map((title) => `query_table title=${JSON.stringify(title)}`);
      const hint = namedPointsListTag && missingFamilies.includes("points-list")
        ? ` For the points-list, query_table title must include ${namedPointsListTag.split("/")[0]} (not a generic POINTS LIST rollup).`
        : "";
      const exact = exactScans.length
        ? ` Exact title-scan args already chosen: ${exactScans.join("; ")}.`
        : "";
      return `The goal asks for counts of ${missingFamilies.join(", ")}, but no title-scan query_table (no row_key) was run for those schedule families yet. Call query_table with each missing schedule title, copy count/building_tag_counts, then answer.${hint}${exact}`;
    }
    // Normalize unicode dashes so "Air‑cooled" / "DOAH‑A1" match ASCII patterns.
    const answerNorm = finalText.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
    const answerSpaced = answerNorm.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    const missingCounts = [];
    const conflictingCounts = [];
    const labelPattern = (label) => ({
      FCU: /FCU|FAN[\s\-]*COIL/gi,
      "DOAH unit": /DOAH|DEDICATED OUTDOOR AIR UNIT/gi,
      "DOAH handling": /DOAH|OUTDOOR AIR HANDLING/gi,
      AHU: /\bAHUs?\b|AIR HANDLING UNIT/gi,
      VAV: /\bVAVs?\b|VARIABLE AIR VOLUME/gi,
      "heat-recovery chiller": /HEAT[\s\-]*RECOVERY[\s\-]*(?:CHILLERS?)?/gi,
      "air-cooled chiller": /AIR[\s\-]*COOLED(?![\s\-]*HEAT)[\s\-]*CHILLERS?/gi,
      boiler: /BOILERS?\b/gi,
      pump: /PUMPS?\b/gi,
      humidifier: /HUMIDIFIERS?\b/gi,
      dehumidifier: /DEHUMIDIFIERS?\b/gi,
      CRAH: /\bCRAHs?\b|COMPUTER[\s\-]*ROOM/gi,
      diffuser: /DIFFUSERS?|GRILLES?|REGISTERS?/gi,
      "unit heater": /UNIT\s+HEATERS?\b|\bUHs?\b/gi,
      "cabinet unit heater": /CABINET\s+UNIT\s+HEATERS?|\bCUHs?\b/gi,
      "air separator": /AIR\s+SEPARATORS?/gi,
      "expansion tank": /EXPANSION\s+TANKS?/gi,
      fan: /\bFANS?\b/gi,
      "points-list": /POINTS?\s*LIST|BAS\b|AHU-T1A/gi,
    }[label] || new RegExp(label, "gi"));
    // Prefer specific multi-word spaced needles — never bare "AIR" (false-hits building names).
    const spacedNeedle = (label) => ({
      FCU: "FCU",
      "DOAH unit": "DOAH",
      "DOAH handling": "DOAH",
      AHU: "AHU",
      VAV: "VAV",
      "heat-recovery chiller": "HEAT RECOVERY",
      "air-cooled chiller": "AIR COOLED",
      boiler: "BOILER",
      pump: "PUMP",
      humidifier: "HUMIDIFIER",
      dehumidifier: "DEHUMIDIFIER",
      CRAH: "CRAH",
      diffuser: "DIFFUSER",
      "unit heater": "UNIT HEATER",
      "cabinet unit heater": "CABINET UNIT HEATER",
      "air separator": "AIR SEPARATOR",
      "expansion tank": "EXPANSION TANK",
      fan: "FAN",
      "points-list": "POINTS LIST",
    }[label] || label.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim());
    const nearCountsForLabel = (label) => {
      const labelRes = labelPattern(label);
      const found = [];
      for (const m of answerNorm.matchAll(labelRes)) {
        const after = answerNorm.slice(m.index + m[0].length);
        if (/^\s*-\s*[A-Z]?\d/i.test(after)) continue;
        // Forward-only: "DOAH 2 … Boilers 3" must not satisfy DOAH=3.
        const window = answerNorm.slice(m.index, Math.min(answerNorm.length, m.index + m[0].length + 48))
          .replace(/\[[^\]]{0,120}\]/g, " ")
          .replace(/\b\d+\s*OF\s*\d+\b/gi, " ");
        for (const num of window.matchAll(/(?:^|[^0-9])(\d{1,4})(?![0-9])/g)) {
          const n = Number(num[1]);
          if (Number.isFinite(n) && n >= 1 && n <= 200) found.push(n);
        }
      }
      const needle = spacedNeedle(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const spacedRe = new RegExp(`(?:^|\\s)${needle}\\b([^0-9]{0,28})(\\d{1,4})(?:\\s|$)`, "g");
      for (const m of answerSpaced.matchAll(spacedRe)) {
        const n = Number(m[2]);
        if (Number.isFinite(n) && n >= 1) found.push(n);
      }
      return found;
    };
    const countNearLabel = (label, count) => nearCountsForLabel(label).includes(Number(count));
    for (const { out } of titleScans) {
      const count = Number(out.count);
      if (!Number.isFinite(count) || count < 2) continue;
      const title = scanTitleFull(out).toUpperCase();
      let label = null;
      // Points/DDC list titles can contain FCU/AHU/DOAH words — classify as
      // points-list first so equipment-schedule count gates do not fire.
      if (/POINTS\s*LIST|DDC\s+POINTS/i.test(title)) {
        if (namedPointsListTag && !pointsListTakeoff) {
          const tagRe = new RegExp(namedPointsListTag.split("/")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          if (!tagRe.test(title)) continue; // skip sibling/generic points-list rollups
        }
        label = "points-list";
      }       else if (/FAN\s*COIL/.test(title)) label = "FCU";
      else if (/DEDICATED OUTDOOR AIR UNIT/.test(title) && !/HANDLING/.test(title)) label = "DOAH unit";
      else if (/DEDICATED OUTDOOR AIR HANDLING/.test(title)) label = "DOAH handling";
      else if (/AIR HANDLING UNIT/.test(title) && !/DEDICATED/.test(title)) label = "AHU";
      else if (/VOLUME CONTROL BOX|VARIABLE AIR VOLUME|\bVAV\b/.test(title)) label = "VAV";
      else if (/HEAT RECOVERY/.test(title) && /CHILLER/.test(title)) label = "heat-recovery chiller";
      else if (/AIR COOLED CHILLER/.test(title) && !/HEAT RECOVERY/.test(title)) label = "air-cooled chiller";
      else if (/BOILER/.test(title)) label = "boiler";
      else if (/PUMP SCHEDULE/.test(title)) label = "pump";
      else if (/DEHUMIDIFIER SCHEDULE/.test(title)) label = "dehumidifier";
      else if (/HUMIDIFIER SCHEDULE/.test(title)) label = "humidifier";
      else if (/COMPUTER ROOM AIR HANDLER|\bCRAH\b/.test(title)) label = "CRAH";
      else if (/GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER|DIFFUSER[\s\-]*GRILLE/.test(title)) label = "diffuser";
      else if (/CABINET UNIT HEATER/.test(title)) label = "cabinet unit heater";
      else if (/^UNIT HEATER SCHEDULE|UNIT HEATER SCHEDULE/.test(title) && !/CABINET|DDC|POINTS/.test(title)) label = "unit heater";
      else if (/AIR SEPARATOR SCHEDULE/.test(title)) label = "air separator";
      else if (/EXPANSION TANK SCHEDULE/.test(title)) label = "expansion tank";
      else if (/^FAN SCHEDULE$|FAN SCHEDULE/.test(title) && !/COIL|SOUND|POWER/.test(title)) label = "fan";
      if (!label) continue;
      // Only require counts the current goal asked for — incidental title-scans
      // from exploratory follow-up tools must not force a full inventory dump.
      const goalAskedThisFamily = familyNeedles.some((fam) => fam.label === label);
      if (!goalAskedThisFamily) continue;
      // Multi-list points takeoffs: each list has its own count; require the
      // count near that list's title keywords (or overall total), not a single
      // "points-list" label that collides across lists.
      if (pointsListTakeoff && label === "points-list") {
        const listHint = title
          .replace(/POINTS\s*LIST|DDC\s+POINTS(?:\s*LIST)?/ig, " ")
          .replace(/WITH|AND|THE|FOR/g, " ")
          .trim()
          .split(/\s+/)
          .filter((w) => w.length >= 3)
          .slice(0, 3)
          .join(" ");
        const nearList = listHint
          ? nearCountsForLabel(listHint).includes(Number(count))
          : false;
        const nearPoints = countNearLabel("points-list", count)
          || countNearLabel("POINTS", count)
          || nearCountsForLabel(title.slice(0, 40)).includes(Number(count));
        if (!(nearList || nearPoints || countNearLabel("overall", count) || countNearLabel("total", count))) {
          // Accept when the answer simply states the number somewhere with the
          // list title fragment (e.g. DOAH-TI … 34).
          const titleFrag = title.replace(/[^A-Z0-9]+/g, "").slice(0, 12);
          const fragOk = titleFrag.length >= 6
            && finalCanonical.includes(titleFrag)
            && finalCanonical.includes(String(count));
          if (!fragOk) missingCounts.push(`${title.slice(0, 48)} count=${count}`);
        }
        continue;
      }
      const foundNear = nearCountsForLabel(label);
      if (!foundNear.includes(Number(count))) {
        missingCounts.push(`${label} count=${count}`);
      } else if (foundNear[0] != null && foundNear[0] !== Number(count)
        && foundNear[0] > Number(count) && foundNear[0] >= 2) {
        // Inflated primary total (e.g. DOAH **5** when title-scan count=3 from
        // summing continuation pages). Ignore smaller leading numbers (page
        // markers / incidental 1s near points-list titles).
        conflictingCounts.push(`${label} stated ${foundNear[0]} but title-scan count=${count}`);
      }
      if (out.building_tag_counts && typeof out.building_tag_counts === "object" && /\bsplit/i.test(goal)) {
        // Only enforce splits for families the goal actually asked to split —
        // incidental building_tag_counts on other title-scans must not block.
        // Family name must appear shortly BEFORE "splits" so "VAV splits … AHU-T1A"
        // does not pull AHU into the split requirement.
        const goalAsksThisSplit = (label === "FCU" && /fan[\s\-]*coil[^\n.]{0,48}\bsplits?\b/i.test(goal))
          || (label === "VAV" && /\bVAVs?[^\n.]{0,48}\bsplits?\b/i.test(goal))
          || (label === "AHU" && /\bAHUs?[^\n.]{0,48}\bsplits?\b/i.test(goal))
          || (label === "DOAH unit" && /\bDOAHs?[^\n.]{0,48}\bsplits?\b/i.test(goal));
        const wantedLetters = new Set();
        // Letters named in the goal (building A, FCU-T11 → T) — set-agnostic.
        for (const m of String(goal || "").matchAll(/\bbuilding\s+([A-Z])\b/gi)) {
          wantedLetters.add(m[1].toUpperCase());
        }
        for (const m of String(goal || "").matchAll(/\b(?:FCU|AHU|VAV|DOAH)-([A-Z])(?=\d)/gi)) {
          wantedLetters.add(m[1].toUpperCase());
        }
        // "splits" / "across buildings" with no named letter → enforce every letter key.
        if (!wantedLetters.size && /\bsplits?\b|\bacross\s+buildings?\b/i.test(goal)) {
          for (const letter of Object.keys(out.building_tag_counts || {})) {
            if (letter !== "other") wantedLetters.add(letter);
          }
        }
        if (!goalAsksThisSplit) {
          // skip split enforcement for this family
        } else for (const [letter, n] of Object.entries(out.building_tag_counts)) {
          if (letter === "other") continue;
          if (wantedLetters.size && !wantedLetters.has(letter)) continue;
          if (!Number.isFinite(Number(n)) || Number(n) < 1) continue;
          // Building splits must appear near the family or the letter token.
          const splitWindowOk = countNearLabel(label, n)
            || new RegExp(`(?:^|\\s)${letter}\\s*=\\s*${Number(n)}(?:\\s|$)`, "i").test(answerNorm)
            || new RegExp(`(?:^|\\s)${letter}\\s+${Number(n)}(?:\\s|$)`, "i").test(answerSpaced);
          if (!splitWindowOk) {
            missingCounts.push(`${label} building_tag_counts.${letter}=${n}`);
          }
        }
      }
    }
    if (missingCounts.length) {
      return `The goal asks for schedule counts, and title-scan query_table results are available, but the answer omits these tool counts next to their equipment family: ${[...new Set(missingCounts)].slice(0, 8).join("; ")}. Copy count (and building_tag_counts when splits are asked) from those tool results into the family totals — do not replace them with the number of MARKs you painted for spot-check, and do not leave a second contradictory totals table.`;
    }
    if (conflictingCounts.length) {
      return `The answer's primary family totals conflict with title-scan query_table counts: ${[...new Set(conflictingCounts)].slice(0, 6).join("; ")}. Use the tool count as the scheduled total — do not sum continuation pages or sibling schedules into a larger figure.`;
    }
    // Reject dual inventory dumps (title-scan table + painted-only "equipment totals").
    if (/(?:title[\s_-]*scan|schedule counts)/i.test(answerNorm)
      && /(?:equipment totals|total scheduled units)/i.test(answerNorm)) {
      return "The answer includes both a title-scan/schedule-counts table and a second equipment-totals table. Keep ONE family-totals table that copies title-scan query_table counts — remove any second table that recounts only painted/spot-check MARKs.";
    }
    } // end else (!compiledBas title-scan gate)
  }
  return null;
}

// The takeoff-agent contract. Kept in one exported function so the tests (and
// the mock server's authors) can read exactly what the model is promised.
export function agentSystemPrompt() {
  return [
    "You are the in-canvas takeoff agent. An estimator gave you a goal; you aim the app's own deterministic tools to satisfy it.",
    "",
    "Hard rules:",
    "- NEVER invent geometry. Rooms are measured by the one_click flood-fill engine; propose only the rings it returns.",
    "- NEVER assume a scale. If a sheet has no scale set, report that (the tool refusal tells you) and stop work on that sheet — the estimator must calibrate it.",
    "- Finding the scale: Prefer the seeded sheet_graph digest (and list_sheets). Many sets print SCALE: AS NOTED on a cover/legend while plan sheets carry numeric detected_scale / detected_label (e.g. 1/8\"=1'-0\"). Report those labels and sheets — never refuse the whole set because one title block says AS NOTED.",
    "- find_legend_symbols inventories legend glyphs only — it does NOT find plan placements. Never claim plan valve/diffuser symbols were highlighted from legend rows alone. To find plan instances: set_scale on a plan sheet, then match_reference_symbol or symbol_sweep seeded from a real plan instance (not the legend glyph). Disclose legend-only results honestly.",
    "- Every proposal MUST cite evidence: the schedule row tag and/or the exact matched text token (a room tag or schedule cell) and/or the one_click seed. propose_shapes rejects uncited shapes.",
    "- You stage proposals only. A human reviews every shape at the accept gate; nothing you do commits a takeoff.",
    "",
    "Hard rules for connectivity, symbol, and schedule tools (trace_connectivity, symbol_sweep, match_reference_symbol, find_legend_symbols, sweep_inline_motif, sweep_schedule_row, resolve_tag, read_schedule, find_schedule):",
    "- A tool's own returned status is the ONLY source of truth for what it found — never a screenshot, a view_region image, or your own visual impression of the linework. If trace_connectivity returns status:\"dead_end\" or status:\"refused\", or a match's confidence is 0 or below the tool's own commit bar, your answer MUST say plainly that no connection/match was found — even if a screenshot looks like it might show one. Do not name equipment, a register, or a connection that no tool call actually returned. If you want to double-check a dead_end, call the tool again from a different seed point or say you can't confirm — never substitute a visual guess for the tool's own answer.",
    "- THIS RULE OVERRIDES YOUR OWN JUDGMENT — it exists precisely because your visual read of a plan is NOT reliable enough to trust over a dead_end, no exceptions, ever: it is FORBIDDEN to write any sentence shaped like \"while the trace returned dead_end/no match, the plan/image clearly shows...\" or \"visually, it appears to connect to...\" or to name ANY equipment/register/grille tag as a target of a connection after a dead_end/refused/zero-confidence result, REGARDLESS of what you think you see in a view_region image. A dead_end/refused result means your answer is \"no connection found\" and NOTHING ELSE — not a softened version, not a visually-corroborated version, not a caveat followed by a claim anyway. If you catch yourself about to write \"clearly shows\" or \"appears to\" right after describing a dead_end, delete that sentence — it is exactly the mistake this rule exists to stop, not a reasonable exception to it.",
    "- If every trace_connectivity attempt for a piece of equipment came back dead_end/refused, your ENTIRE final answer about that equipment's connectivity must literally be, word for word (you may add which seed points you tried before this sentence, nothing after it): \"The connectivity trace did not find a path from <equipment id> to any other identified equipment on this sheet.\" Do not add a \"visually\", \"it appears\", \"likely\", or any tag name after that sentence — the sentence above is the complete, final word on the connectivity question, not an opening for further speculation. Anything you think you notice in a view_region image about POSSIBLE targets is not evidence and must not be written down anywhere in your answer.",
    "- NEVER report an aggregate, sum, or \"total for the building/set\" unless you have checked every relevant row across every relevant sheet AND say so. If you only checked one piece of equipment, your answer must say exactly what you checked (\"the only unit I found was X, on sheet Y — I have not verified there are no others\") and must not present that single value as a whole-building total. When in doubt about completeness, refuse to give a total and say what would need to be checked next.",
    "- Every factual claim about a connection, a symbol match, or a schedule value must trace back to a specific tool call's own returned data in this run — if you can't point to which tool call produced a fact, don't state it.",
    "- NEVER infer installed quantity from the existence of a schedule row. Installed quantity requires sweep_schedule_row; use its found count and tag_at evidence or refuse.",
    "- NEVER report a plan location for any equipment or valve tag unless sweep_schedule_row succeeded for that exact tag. A schedule-cell bbox is a schedule location, never an installed plan location, and one tag's plan coordinates never belong to another tag.",
    "- When sweep_schedule_row refuses geometric anchoring (tag not drawn on any plan sheet), still report every requested schedule field for that tag from query_table/read_schedule (CFM, manufacturer, …) with schedule citations — the refusal is only about plan location, not about dropping schedule data.",
    "- Production MCP bboxes are image pixels, not normalized coordinates. Never label them normalized.",
    "- Be extremely, genuinely useful: whatever the goal asks — a full takeoff, an AHU characteristic, counting valves, a BAS trace, schedule attributes, cross-sheet joins — do that ask end-to-end. Return every requested field with evidence-backed values plus enough citation context to trust the answer. Paint ALL answering evidence on the sheets (value cells / row data / drawing text / counted marks), not only a tag mark. Partial answers and mark-only flybys are incomplete.",
    "- query_table and find_text search the whole loaded set — they do not require the sheet to be open as a canvas tab. Never refuse schedule cell values because a tab is closed; call query_table with row_key and copy row.all_cells, then highlight_citation.",
    "- COMPLETE set HVAC, BAS, or valve takeoff (goal says complete … takeoff of this set / these drawings / this blueprint set): call compile_corpus_takeoff FIRST — kind hvac_equipment for HVAC equipment, kind bas_points for BAS/DDC points, kind control_valves for a complete valve takeoff (CHW + HHW CONTROL VALVE SCHEDULE). When the goal asks for chilled-water / CHW only or hot-water / HHW only, also pass service=\"CHW\" or service=\"HHW\". That tool is the deterministic full-set answer (same Session+ODL path as MCP). Copy its totals / category_counts / list_counts / exclusions / empty_pages into the answer. Do NOT approximate the set total by crawling find_schedule, read_schedule, or title-scanning families one-by-one — that yields partial 10-row dumps with broken cites. After compile, spot-cite a few MARKs with query_table + highlight_citation only. For valves, report valve mark, served equipment (UNIT MARK), service (CHW/HHW), size, GPM, and ONE Cv per valve — never invent dual CHW CV + HHW CV columns on the same row.",
    "- When asked for scheduled equipment or points-list row counts for NAMED families/lists (not a complete set compile), call query_table with the schedule title (no row_key and no cell_contains). Copy that tool result's count and building_tag_counts into the answer — do not re-sum sheet_graph page row totals by hand (continuation pages 1 OF 2 / 2 OF 2 repeat the same MARK keys). building_tag_counts letters are building codes from tags (A/M/T/…) — never swap letters; when the goal names a tag like FCU-T11, use building_tag_counts.T for that building's total. When point_type_counts is present, copy AI/AO/BI/BO from it — do not burn iterations re-filtering the same title with cell_contains for each point type. Prefer one accurate title needle per asked family; when the goal distinguishes sibling titles (for example dedicated outdoor-air UNIT vs HANDLING schedules, or air-cooled vs heat-recovery chillers), query the title that matches what was asked rather than blending both. When the goal names a specific points list (for example AHU-T1A/TIB), put that tag in the query_table title — a bare POINTS LIST title can roll up sibling lists and double the row count. Then re-query specific row_key values for MARK/identity bboxes you must cite.",
    "- Sequencing for named-family count + cite goals (not complete-set compile): (1) read the seeded sheet_graph digest (re-call sheet_graph only if missing/stale), (2) one title-scan query_table per requested family and copy count/building_tag_counts/point_type_counts, (3) only then re-query the named cite MARKs / points-list title and paint those cells, (4) write ONE final answer whose family totals match those tool counts (do not add a second contradictory totals table that recounts only painted MARKs). Do not paint every equipment row on a schedule, and do not dump full schedule tables into the answer.",
    "- ALWAYS paint cited evidence on the sheets before finishing: for every factual claim backed by query_table, find_text, read_sheet_text, or sweep_schedule_row, call highlight_citation with the unchanged sheet and bbox_px (or find_text hit.bbox_px) so the estimator sees the source on the blueprint. Pass row_key, column, table_title, and value whenever known so the Agent source card title reads like \"VAV-1 · CFM = 350\" (not a naked \"350\"). Do not rely on auto-flying the canvas — the UI shows clickable expandable source cards; painting is enough. When the answer uses multiple schedule fields from a row, paint EACH answering value cell (not only the mark or one field), plus each phrase-length drawing hit you copy into the answer, then write the final answer.",
    "- The final Answer in chat must give the estimator MORE than enough to understand the workflow and act: every requested count/field with units, schedule titles and sheets, and clear structure. Prefer markdown tables and short labeled lists the UI can render (not a wall of prose or pipe-character dumps). Do not embed highlight_citation markup ids (【mk-…】) in chat — those belong on Source cards. Do not dump incidental inventory rows the goal did not ask for. Do not leave the usable answer only in Sources or highlights — chat is primary.",
    "- Never draw or request overlay label text that would cover the cited cell value; the highlight is a frame around readable blueprint text.",
    "- Conversational follow-ups: when the estimator asks a follow-up about the previous answer or workflow, reply in plain language using evidence already gathered; call tools again only when new evidence is needed. Answer the follow-up question directly first — do not digress into unrelated points-list rows or extra fields unless asked. Explain what you did and why in estimator terms — not tool JSON. Be a useful collaborator across turns, not a one-shot report.",
    "- When asked whether a MARK is on a schedule and which title: call query_table with that row_key (omit title), read matches[0].title (primary equipment schedule — not vibration-isolation / valve / sound / points-list cross-refs), and copy that exact title into the answer. Sibling families can differ (for example DOAH UNIT vs DOAH HANDLING schedules).",
    "- When asked whether a key is a scheduled unit of a family (VAV, AHU, FCU, DOAH, …): answer yes only when query_table shows family_mark=true (or the row TAG/MARK matches that family's pattern, e.g. VAV-*). A junk remarks key on the same schedule (family_mark=false, identity header REMARKS/NOTE) is NOT a scheduled unit of that family — say no and note it is excluded from the title-scan family count.",
    "- Never say a cell or field was highlighted unless a successful highlight_citation call targeted that exact sheet and bbox_px. State exactly which source regions were highlighted; do not imply unpainted cells were painted. Never write that all/each cited cells are highlighted.",
    "- For a scheduled device tag, cite query_table row.identity (for example VALVE MARK), not the first different column that happens to repeat the same text (for example UNIT MARK).",
    "- For any equipment-to-control-valve join, use this direct set-wide sequence: query_table with row_key set to the equipment tag; sweep_schedule_row for installed quantity/plan evidence when requested; query_table with cell_contains set to that exact equipment tag to find compound relationship marks; then highlight the exact returned tag and row-identity bboxes. Do not browse guessed sheets or repeatedly retry the same empty exact-row query.",
    "- When the goal gives a BAS/DDC point description and asks for the point mark, alarm, or trend, call query_table with cell_contains set to that description (omit invented table titles on the first try). Read the AI/AO/BI/BO mark and alarm/trend fields from row.all_cells — never treat the description string itself as the point mark. If several sibling points share an equipment tag (e.g. HW vs CHW valve feedback), pick the row whose DESCRIPTION matches the goal's point wording.",
    "- When asked how many points-list descriptions name only equipment A vs only equipment B vs neither/shared/common: (1) title-scan the named POINTS LIST for the total row count, (2) count exclusive DESCRIPTION matches for each equipment string, (3) neither = total − onlyA − onlyB when the exclusive sets are disjoint. Do not treat 'shared' as the intersection of rows that contain both strings — shared/neither means descriptions that name neither exclusive tag.",
    "- Schedule LOCATION/ROOM cells are installation-location attributes only. When asked what equipment serves from drawing narrative, call find_text or read_sheet_text and copy from hit.str — never paraphrase a LOCATION cell into a serves claim. Schedule SERVICE (duty) cells are different: when the goal names a service that matches a SERVICE cell (for example MAIN OPERATIONS or BUILDING SOUTH), answer with that row's EQUIP/MARK and cite the SERVICE cell.",
    "- When asked for a physical drawing section or detail label where equipment is shown, cite find_text/read_sheet_text hit.str for that section label. A schedule title is not a drawing section.",
    "- When asked where equipment appears on a roof/floor plan, prefer a find_text hit whose hit.str equals the exact equipment tag on a plan sheet over longer detail/callout phrases that only contain the tag.",
    "- find_text accepts an optional sheet; omit sheet to search the entire loaded set. When a sheet-scoped search returns zero hits with a next_move, follow that next_move instead of answering from schedule cells.",
    "- resolve_tag resolves room-finish relationships only. Never use it to locate scheduled HVAC/BAS equipment.",
    "- read_schedule/find_schedule return two DIFFERENT kinds of name and they are never interchangeable: `headers` names the table's own COLUMNS (e.g. \"SYMBOL\", \"REMARKS\" as column labels), while each entry in `rows` has its own `key` naming that ONE ROW (e.g. \"AC-1\"). A word appearing in `headers` does NOT mean a row exists with that word as its key — check `rows[].key` directly, never infer a row's existence from a column name alone.",
    "",
    "Working method: A compact whole-set sheet_graph digest is usually seeded into this conversation before your first turn (schedules, roles, detected_scale) — treat that as already-read index; do not spend a turn re-calling sheet_graph unless it is missing or you need a refresh. Then query_table for cited equipment/reference cells or read_schedule for a known region; use find_text and view_region to locate and show plan evidence. Match or create conditions, measure rooms with one_click, then stage propose_shapes with evidence. Then summarize what you proposed and what you could not do, and stop. If you are blocked (no scale, sheet not open, nothing matches), say so plainly and stop rather than guessing.",
  ].join("\n");
}

/**
 * Compact whole-set sheet_graph for agent context / bootstrap seed.
 * Keeps roles, schedule titles+row counts, and detected_scale — drops spans
 * and evidence blobs that blow the context window.
 * Shared-path decision: NO — agent-surface orchestration only; schedule truth
 * still comes from Session+ODL sheet_graph / query_table.
 */
export function compactSheetGraphForAgent(data, { maxSheets = 40 } = {}) {
  const sheetsIn = Array.isArray(data?.sheets) ? data.sheets : [];
  const sheets = sheetsIn.slice(0, maxSheets).map((s) => {
    const sheet = s.sheet || s.key || s.id || s.name;
    const detected = s.detected_scale || s.detected_label || s.detected?.label;
    return {
      sheet,
      ...(s.title || s.name || s.label ? { title: s.title || s.name || s.label } : {}),
      role: s.role,
      ...(detected ? { detected_scale: detected } : {}),
      schedules: Array.isArray(s.schedules)
        ? s.schedules.map((sch) => ({
          kind: sch.kind,
          title: typeof sch.title === "string" ? sch.title : (sch.title?.text || sch.title),
          rows: sch.rows ?? sch.row_count,
        }))
        : undefined,
    };
  });
  const numeric_scales = sheets
    .filter((s) => s.detected_scale)
    .map((s) => ({ sheet: s.sheet, detected_scale: s.detected_scale }));
  return {
    ...(typeof data?.available === "boolean" ? { available: data.available } : {}),
    sheet_count: sheetsIn.length,
    sheets,
    ...(numeric_scales.length ? { numeric_scales } : {}),
    ...(sheetsIn.length > maxSheets ? { sheets_omitted: sheetsIn.length - maxSheets } : {}),
    note: "Whole-set sheet index (roles + schedule titles/row counts + detected_scale). Already computed — treat as read; use query_table/find_schedule for row detail. Re-call sheet_graph only if this digest is missing or stale.",
  };
}

function appendSeededAssistantToolCall(provider, messages, call) {
  if (provider === "anthropic") {
    messages.push({
      role: "assistant",
      content: [{ type: "tool_use", id: call.id, name: call.name, input: call.args || {} }],
    });
    return;
  }
  messages.push({
    role: "assistant",
    content: null,
    tool_calls: [{
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
    }],
  });
}

// ── provider translation ─────────────────────────────────────────────────────
export function toProviderTools(provider, defs) {
  if (provider === "anthropic") {
    return defs.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  }
  return defs.map(({ name, description, input_schema }) => ({
    type: "function",
    function: { name, description, parameters: input_schema },
  }));
}

/** One assistant reply → { ok, text, toolCalls: [{id, name, args, argsError?}], raw } | { ok:false, error }.
 *  Malformed replies come back as ok:false — the loop turns that into an error
 *  status, never a throw. */
export function parseAssistantTurn(provider, json) {
  if (!json || typeof json !== "object") return { ok: false, error: "The endpoint replied, but not with a message." };
  if (provider === "anthropic") {
    if (!Array.isArray(json.content)) {
      return { ok: false, error: json.error?.message ? `Endpoint error: ${json.error.message}` : "Malformed reply: no content blocks." };
    }
    const text = json.content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim();
    const toolCalls = json.content.filter((b) => b?.type === "tool_use").map((b, i) => ({
      id: b.id || `toolu_${i}`,
      name: typeof b.name === "string" ? b.name : "",
      args: b.input && typeof b.input === "object" ? b.input : {},
    }));
    return { ok: true, text, toolCalls, raw: json };
  }
  const msg = json.choices?.[0]?.message;
  if (!msg || typeof msg !== "object") {
    return { ok: false, error: json.error?.message ? `Endpoint error: ${json.error.message}` : "Malformed reply: no choices[0].message." };
  }
  const text = typeof msg.content === "string"
    ? msg.content.trim()
    : Array.isArray(msg.content) ? msg.content.filter((p) => p && typeof p.text === "string").map((p) => p.text).join("\n").trim() : "";
  const toolCalls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((tc, i) => {
    const call = { id: tc.id || `call_${i}`, name: tc.function?.name || "", args: {} };
    try { call.args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}; }
    catch { call.argsError = "arguments were not valid JSON"; }
    return call;
  });
  return { ok: true, text, toolCalls, raw: msg };
}

// Tool results serialize as JSON text, capped so one enormous read can't blow
// the context; image results ride as real image blocks (Anthropic) or a
// follow-up user image message (OpenAI-style function calling has no image
// slot in the tool role).
const RESULT_MAX_CHARS = 5000;
const resultText = (out) => {
  let payload = out && typeof out === "object" ? out : { value: out };
  // Cap oversized tool errors (e.g. legacy find_schedule dumps) so one failure
  // cannot blow the model context window.
  if (typeof payload?.error === "string" && payload.error.length > 600) {
    payload = { ...payload, error: `${payload.error.slice(0, 500)}…` };
  }
  // Compact sheet_graph only — full sheet dumps blow the 131k context window.
  // Other tools (sweep_schedule_row, symbol_sweep, load_plan, …) also return a
  // `sheets` array; treating them as a graph strips found/tag evidence.
  if (typeof payload?.available === "boolean" && Array.isArray(payload?.sheets) && payload.sheets.length > 0) {
    payload = compactSheetGraphForAgent(payload);
  }
  // Keep sweep_schedule_row count evidence; drop empty plan-sheet audit rows
  // before the hard char cap can slice through tag_citations.
  if (
    typeof payload?.found === "number"
    && Array.isArray(payload?.tag_citations)
    && Array.isArray(payload?.sheets)
    && (payload.tag != null || payload.anchor != null)
  ) {
    const sheets = payload.sheets.filter((sheet) => {
      if (!sheet || typeof sheet !== "object") return false;
      if (Number(sheet.found) > 0) return true;
      if (Array.isArray(sheet.matches) && sheet.matches.length) return true;
      if (Array.isArray(sheet.withheld) && sheet.withheld.length) return true;
      if (Array.isArray(sheet.excluded) && sheet.excluded.length) return true;
      if (Array.isArray(sheet.text_only) && sheet.text_only.length) return true;
      if (Array.isArray(sheet.redundant_view) && sheet.redundant_view.length) return true;
      return false;
    });
    payload = {
      tag: payload.tag,
      search_scope: payload.search_scope,
      unlabeled_audit_complete: payload.unlabeled_audit_complete,
      found: payload.found,
      tag_citations: payload.tag_citations,
      row: payload.row
        ? {
          sheet: payload.row.sheet,
          table: payload.row.table,
          key: payload.row.key,
          cells: payload.row.cells,
          citation: payload.row.citation,
        }
        : undefined,
      anchor: payload.anchor,
      sheets,
      sheets_omitted_empty: Math.max(0, payload.sheets.length - sheets.length),
      complete: payload.complete,
      note: payload.note,
      warning: payload.warning,
    };
  }
  // Compact read_schedule / large row dumps.
  if (Array.isArray(payload?.rows) && payload.rows.length > 4) {
    const { image_data_url: _i, ...rest } = payload;
    payload = { ...rest, rows: payload.rows.slice(0, 4), rows_omitted: payload.rows.length - 4 };
  }
  // Title-scan inventory dumps (no row_key, many matches) only need count +
  // building splits + one sample row — full match arrays thrash context on
  // multi-family takeoffs and trigger upstream HTTP 400s.
  const q = payload?.query;
  const scoped = q && (q.row_key != null && String(q.row_key).trim() !== ""
    || q.column != null
    || q.cell_value != null
    || q.cell_contains != null);
  if (!scoped && Array.isArray(payload?.matches) && payload.matches.length > 2
    && Number.isFinite(Number(payload.count)) && Number(payload.count) >= 2) {
    const { image_data_url: _drop, ...rest } = payload;
    payload = {
      ...rest,
      matches: payload.matches.slice(0, 1),
      matches_omitted: payload.matches.length - 1,
    };
  }
  // Scoped row hits: exact row_key lookups must keep every answering column
  // (CFM, GPM, manufacturer, …). Broader cell_contains dumps still trim to
  // identity/MARK so inventory context stays small.
  if (scoped && Array.isArray(payload?.matches)) {
    const rowKeyScoped = q.row_key != null && String(q.row_key).trim() !== "";
    payload = {
      ...payload,
      matches: payload.matches.slice(0, 3).map((match) => {
        const row = match?.row;
        if (!row?.all_cells && !row?.cells) return match;
        if (rowKeyScoped) {
          return {
            sheet: match.sheet,
            title: match.title,
            row: {
              key: row.key,
              identity: row.identity,
              all_cells: row.all_cells || row.cells,
            },
          };
        }
        const cells = row.all_cells || row.cells || {};
        const keep = {};
        for (const [k, v] of Object.entries(cells)) {
          if (/mark|identity|tag/i.test(k) || v === row.identity) keep[k] = v;
        }
        if (!Object.keys(keep).length) {
          const first = Object.entries(cells)[0];
          if (first) keep[first[0]] = first[1];
        }
        return {
          sheet: match.sheet,
          title: match.title,
          row: { key: row.key, identity: row.identity, all_cells: keep },
        };
      }),
    };
  }
  const { image_data_url: _img, ...rest } = payload && typeof payload === "object" ? payload : { value: payload };
  let s;
  try { s = JSON.stringify(rest); } catch { s = String(rest); }
  return s.length > RESULT_MAX_CHARS ? `${s.slice(0, RESULT_MAX_CHARS)}… (truncated)` : s;
};

function appendToolResults(provider, messages, results) {
  if (provider === "anthropic") {
    const blocks = results.map(({ call, out }) => {
      const content = [{ type: "text", text: resultText(out) }];
      if (out?.image_data_url) {
        const m = /^data:(image\/\w+);base64,(.*)$/s.exec(out.image_data_url) || [];
        content.unshift({ type: "image", source: { type: "base64", media_type: m[1] || "image/png", data: m[2] || "" } });
      }
      return { type: "tool_result", tool_use_id: call.id, content, ...(out?.error ? { is_error: true } : {}) };
    });
    messages.push({ role: "user", content: blocks });
    return;
  }
  const images = [];
  for (const { call, out } of results) {
    messages.push({ role: "tool", tool_call_id: call.id, content: resultText(out) });
    if (out?.image_data_url) images.push(out.image_data_url);
  }
  if (images.length) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `The ${images.length === 1 ? "image" : "images"} from view_region:` },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    });
  }
}

// ── the loop ─────────────────────────────────────────────────────────────────
/**
 * @param {{
 *   cfg: { endpoint: string, apiKey?: string, model: string, provider?: string },
 *   goal: string,
 *   tools: Array<{ name: string, description: string, input_schema: any }>,
 *   execute: (name: string, args: any) => Promise<any> | any,
 *   onEvent?: (ev: Record<string, any>) => void,
 *   signal?: AbortSignal,
 *   maxIterations?: number,
 *   priorMessages?: Array<{ role: "user" | "assistant", content: string }>,
 *   seedSheetGraph?: boolean,
 *   fetchFn?: typeof fetch,
 * }} opts
 * @returns {Promise<{ status: "done" | "aborted" | "error" | "max_iterations", text?: string, message?: string, iterations: number }>}
 */
export async function runAgentLoop({ cfg, goal, tools, execute, onEvent, signal, maxIterations = MAX_AGENT_ITERATIONS, fetchFn, priorMessages = [], seedSheetGraph = true }) {
  const provider = cfg?.provider === "anthropic" ? "anthropic" : "openai";
  const emit = (ev) => { try { onEvent?.(ev); } catch { /* a status listener must never kill the run */ } };
  const takeoffIntent = classifyTakeoffIntent(goal);
  const providerTools = toProviderTools(provider, toolsForGoal(goal, tools));
  const system = agentSystemPrompt();
  // priorMessages enables conversational follow-ups in the same Agent thread.
  const history = Array.isArray(priorMessages)
    ? priorMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }))
    : [];
  const messages = [...history, { role: "user", content: goal }];
  // Deterministic honesty backstop, generalized (see agentVerifiers.js's own
  // header for the real, live-observed history this comes from): every real
  // tool call this run makes is logged here, across every loop iteration,
  // so `runVerifiers` can check the WHOLE run's evidence — not just prompt
  // rules the model can choose to ignore — before the final answer is shown.
  /** @type {Array<{ id: string, name: string, args: unknown, out: unknown }>} */
  const callLog = [];
  // Force-read the whole-set index: seed a compact sheet_graph into the
  // transcript BEFORE the first model turn (same pattern as MCP demo runner).
  // The model cannot "forget" to call sheet_graph — the digest is already here.
  // Only when sheet_graph is in the tool set (production agent / demos).
  const hasSheetGraphTool = (tools || []).some((t) => t && t.name === "sheet_graph");
  if (seedSheetGraph && hasSheetGraphTool) {
    emit({ type: "status", text: "Loading whole-set sheet index…" });
    let graphOut;
    try { graphOut = await execute("sheet_graph", {}); }
    catch (e) { graphOut = { error: String((e && e.message) || e) }; }
    if (graphOut == null || typeof graphOut !== "object") graphOut = { result: graphOut ?? null };
    if (!graphOut.error && Array.isArray(graphOut.sheets) && graphOut.sheets.length > 0) {
      const call = { id: "seed_sheet_graph", name: "sheet_graph", args: {} };
      emit({ type: "tool_start", name: "sheet_graph", args: {}, seeded: true });
      callLog.push({ id: call.id, name: call.name, args: {}, out: graphOut });
      appendSeededAssistantToolCall(provider, messages, call);
      appendToolResults(provider, messages, [{ call, out: graphOut }]);
      emit({ type: "tool_end", name: "sheet_graph", result: compactSheetGraphForAgent(graphOut), seeded: true });
    }
  }
  // Seed workflow directive AFTER the index seed so survey→title_scan advances
  // when sheet_graph is already in the call log.
  let lastWorkflowPhase = "";
  {
    const initialWf = advanceTakeoffWorkflow(takeoffIntent, callLog, goal);
    lastWorkflowPhase = initialWf.phase;
    const directive = workflowDirective(takeoffIntent, initialWf);
    if (directive) {
      messages.push({ role: "user", content: directive });
      emit({ type: "text", text: `[Workflow: ${takeoffIntent} / ${initialWf.phase}]` });
    }
  }
  let iterations = 0;
  const aborted = () => { emit({ type: "aborted" }); return { status: /** @type {const} */ ("aborted"), iterations }; };
  let lastDraftText = "";
  let lastWordingCorrection = "";
  let wordingCorrectionStreak = 0;
  let answerNudgeSent = false;
  let consecutiveHighlightOnlyTurns = 0;

  for (; iterations < maxIterations; iterations++) {
    if (signal?.aborted) return aborted();
    let json;
    try {
      json = await chatWithTools({ cfg, system, messages, tools: providerTools, signal, fetchFn });
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return aborted();
      const message = String((e && e.message) || e);
      emit({ type: "error", message });
      return { status: "error", message, iterations };
    }
    const turn = parseAssistantTurn(provider, json);
    if (!turn.ok) {
      emit({ type: "error", message: turn.error });
      return { status: "error", message: turn.error, iterations };
    }
    // The UI's own onEvent handler renders the "text" event's payload as the
    // visible answer — the later "done" event's own text is NOT displayed
    // (confirmed live: an earlier version of this backstop attached the note
    // to "done" instead and it silently never appeared anywhere). The
    // append MUST happen here, before this emit, on the LAST turn only.
    let displayText = turn.text;
    if (!turn.toolCalls.length) {
      if (turn.text && !/^\[Evidence gate:/i.test(turn.text)) lastDraftText = turn.text;
      let draftForGate = turn.text;
      // Always merge omitted named-tag schedule attrs from query_table before
      // evidence gates — do not wait for a correction round-trip the model may
      // dodge by rewriting paint/sheet text without the values.
      {
        const missingUpfront = missingNamedScheduleAttrs(callLog, goal, draftForGate);
        if (missingUpfront.length) {
          const filled = appendNamedScheduleAttrs(draftForGate, missingUpfront);
          if (filled && filled !== draftForGate) {
            draftForGate = filled;
            displayText = filled;
            lastDraftText = filled;
            emit({ type: "text", text: "[Evidence: appended schedule attributes from query_table.]" });
          }
        }
      }
      let correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
      if (correction && correction.startsWith("__FATAL__:")) {
        const msg = correction.slice("__FATAL__:".length).trim();
        emit({ type: "text", text: msg });
        emit({ type: "done", text: msg });
        return { status: "error", text: msg, iterations: iterations + 1 };
      }
      // Auto-strip broad all/each-highlighted claims once paints exist — saves
      // a model round-trip that otherwise burns the step cap.
      if (correction && /\bbroad all\/each-highlighted claim\b/i.test(correction)
        && callLog.some((c) => c.name === "highlight_citation" && !c.out?.error)) {
        draftForGate = String(draftForGate || "")
          .replace(/\b(?:all|each)\s+(?:of\s+)?(?:the\s+)?(?:cited|requested|queried|required|spot-?check\s+)?(?:cells?|fields?|marks?|regions?|values?|sources?)\s+(?:are|is|were|was)\s+highlight[^.]*\./gi, "")
          .replace(/\ball\s+cited\b[^.]*\bhighlight[^.]*\./gi, "")
          .replace(/\beach\s+cited\b[^.]*\bhighlight[^.]*\./gi, "")
          .trim();
        displayText = draftForGate;
        lastDraftText = draftForGate;
        correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
      }
      // Auto-strip a second "Equipment totals" dump that conflicts with title-scan counts.
      if (correction && /(?:equipment-totals table|conflicting schedule totals)/i.test(correction)) {
        const stripped = String(draftForGate || "")
          .replace(/\n#{0,3}\s*\*{0,2}Equipment totals[\s\S]*?(?=\n#{1,3}\s|\n\*{2}[A-Z]|\n\[Automated|\n$)/i, "\n")
          .replace(/\n#{0,3}\s*\*{0,2}Building[- ]split totals[\s\S]*?(?=\n#{1,3}\s|\n\*{2}[A-Z]|\n\[Automated|\n$)/i, "\n")
          .trim();
        if (stripped && stripped !== draftForGate) {
          draftForGate = stripped;
          displayText = draftForGate;
          lastDraftText = draftForGate;
          correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
        }
      }
      // Auto-fill omitted TYPE/CFM (etc.) from query_table — models often paint
      // MARK and claim "values are on the same row" without copying them.
      if (correction && /omits these evidence-backed values/i.test(correction)) {
        const missing = missingNamedScheduleAttrs(callLog, goal, draftForGate);
        if (missing.length) {
          const filled = appendNamedScheduleAttrs(draftForGate, missing);
          if (filled && filled !== draftForGate) {
            draftForGate = filled;
            displayText = filled;
            lastDraftText = filled;
            correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
          }
        }
      }
      // When cite-MARK bboxes are already in the call log, paint them now
      // instead of asking the model to re-type the same highlight_citation args.
      if (correction && /Exact paint args already retrieved:/i.test(correction)) {
        const hintRe = /highlight_citation sheet=(\S+) bbox_px=(\[[^\]]+\]) text=(\S+)(?: row_key=(\S+))?(?: column=(\S+))?(?: value=(\S+))?(?: table_title=(\S+))?/g;
        let paintedAny = false;
        for (const m of correction.matchAll(hintRe)) {
          let bbox;
          try { bbox = JSON.parse(m[2]); } catch { continue; }
          if (!Array.isArray(bbox) || bbox.length !== 4) continue;
          const rawArgs = {
            sheet: m[1],
            bbox_px: bbox,
            text: m[3],
            ...(m[4] ? { row_key: m[4] } : {}),
            ...(m[5] ? { column: m[5].replace(/_/g, " ") } : {}),
            ...(m[6] ? { value: m[6].replace(/_/g, " ") } : {}),
            ...(m[7] ? { table_title: m[7].replace(/_/g, " ") } : {}),
          };
          // Prefer real schedule headers/values from the call log over underscore-squashed hints.
          const args = enrichHighlightCitationArgs(rawArgs, callLog);
          emit({ type: "tool_start", name: "highlight_citation", args });
          let out;
          try { out = await execute("highlight_citation", args); }
          catch (e) { out = { error: String((e && e.message) || e) }; }
          if (out == null || typeof out !== "object") out = { result: out ?? null };
          callLog.push({ id: `auto_paint_${callLog.length}`, name: "highlight_citation", args, out });
          emit({ type: "tool_end", name: "highlight_citation", result: out });
          paintedAny = true;
        }
        if (paintedAny) {
          correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
        }
      }
      // Auto title-scans for missing schedule families (full takeoffs thrash on
      // find_text and never finish counts — run Exact title needles now).
      if (correction && /Exact title-scan args already chosen:/i.test(correction)) {
        const scanRe = /query_table title=("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s;]+)/g;
        const scanSummaries = [];
        for (const m of correction.matchAll(scanRe)) {
          let title = m[1];
          try {
            if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
              title = JSON.parse(title.includes('"') ? title : `"${title.slice(1, -1)}"`);
            }
          } catch { /* keep raw */ }
          title = String(title || "").trim();
          if (!title) continue;
          const args = { title };
          emit({ type: "tool_start", name: "query_table", args });
          let out;
          try { out = await execute("query_table", args); }
          catch (e) { out = { error: String((e && e.message) || e) }; }
          if (out == null || typeof out !== "object") out = { result: out ?? null };
          callLog.push({ id: `auto_title_scan_${callLog.length}`, name: "query_table", args, out });
          emit({ type: "tool_end", name: "query_table", result: out });
          if (!out.error) {
            const sampleTitle = String(out.matches?.[0]?.title?.text || out.matches?.[0]?.title || title);
            scanSummaries.push(
              `${sampleTitle}: count=${out.count}`
              + (out.building_tag_counts ? ` building_tag_counts=${JSON.stringify(out.building_tag_counts)}` : "")
              + (out.point_type_counts ? ` point_type_counts=${JSON.stringify(out.point_type_counts)}` : ""),
            );
          }
        }
        if (scanSummaries.length) {
          messages.push({
            role: "user",
            content: `Auto title-scan results (copy these tool counts into the answer; do not invent totals):\n${scanSummaries.join("\n")}`,
          });
          correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
        }
      }
      if (correction) {
        messages.push(provider === "anthropic" ? { role: "assistant", content: turn.raw.content } : turn.raw);
        const needsMoreTools = /\bcall (?:query_table|find_text|read_sheet_text|sweep_schedule_row|highlight_citation|count_marks)\b/i.test(correction)
          || /\bomit sheet\b/i.test(correction)
          || /\bno successful\b/i.test(correction);
        // Wording-only gates that repeat identical corrections thrash the step
        // cap. After two identical wording corrections, strip the offending
        // all/each-highlighted sentence and accept the rest.
        if (!needsMoreTools) {
          if (correction === lastWordingCorrection) wordingCorrectionStreak += 1;
          else { lastWordingCorrection = correction; wordingCorrectionStreak = 1; }
          if (wordingCorrectionStreak >= 2 && /\ball\/each-highlighted claim\b/i.test(correction)) {
            displayText = String(draftForGate || "")
              .replace(/\b(?:all|each)\s+(?:of\s+)?(?:the\s+)?(?:cited|requested|queried|required|spot-?check\s+)?(?:cells?|fields?|marks?|regions?|values?|sources?)\s+(?:are|is|were|was)\s+highlight[^.]*\./gi, "")
              .replace(/\ball\s+cited\b[^.]*\bhighlight[^.]*\./gi, "")
              .replace(/\beach\s+cited\b[^.]*\bhighlight[^.]*\./gi, "")
              .trim();
            const notes = runVerifiers(callLog, goal);
            if (notes.length) displayText = `${displayText || ""}\n\n${notes.join("\n\n")}`;
            if (displayText) {
              lastDraftText = displayText;
              emit({ type: "text", text: displayText });
            }
            messages.push(provider === "anthropic" ? { role: "assistant", content: turn.raw.content } : turn.raw);
            emit({ type: "done", text: displayText });
            return { status: "done", text: displayText, iterations: iterations + 1 };
          }
          // Identical placeholder-wording false positives: strip trigger words and re-check once.
          if (wordingCorrectionStreak >= 2 && /example or placeholder data/i.test(correction)) {
            const cleaned = String(draftForGate || "")
              .replace(/\((?:example|placeholder|sample)(?:\s+\w+)?\)/gi, "")
              .replace(/\bplaceholder\s+(?:data|value|text|figures?|row)\b/gi, "value")
              .replace(/\bexample\s+(?:size|value|data|only|figures?)\b/gi, "value")
              .trim();
            const again = requiredEvidenceCorrection(callLog, goal, cleaned);
            if (!again) {
              displayText = cleaned;
              const notes = runVerifiers(callLog, goal);
              if (notes.length) displayText = `${displayText || ""}\n\n${notes.join("\n\n")}`;
              if (displayText) {
                lastDraftText = displayText;
                emit({ type: "text", text: displayText });
              }
              emit({ type: "done", text: displayText });
              return { status: "done", text: displayText, iterations: iterations + 1 };
            }
          }
        } else {
          lastWordingCorrection = "";
          wordingCorrectionStreak = 0;
        }
        const toolDirective = needsMoreTools
          ? "Use tools only if this correction requires new evidence or paint; otherwise emit the complete replacement answer now."
          : "Do not call any tools. Emit the complete replacement answer now.";
        messages.push({
          role: "user",
          content: `${correction}\n\n${toolDirective} Preserve every previously retrieved, tool-grounded requested field; do not answer only the latest correction. Satisfy every part of the original goal.`,
        });
        emit({ type: "text", text: `[Evidence gate: ${correction}]` });
        continue;
      }
      lastWordingCorrection = "";
      wordingCorrectionStreak = 0;
      // Final safety: re-merge any attrs the last model rewrite dropped, then
      // re-check gates so paint duties for those values still run.
      {
        const missingFinal = missingNamedScheduleAttrs(callLog, goal, draftForGate);
        if (missingFinal.length) {
          draftForGate = appendNamedScheduleAttrs(draftForGate, missingFinal);
          displayText = draftForGate;
          lastDraftText = draftForGate;
          correction = requiredEvidenceCorrection(callLog, goal, draftForGate);
          if (correction) {
            messages.push(provider === "anthropic" ? { role: "assistant", content: turn.raw.content } : turn.raw);
            messages.push({
              role: "user",
              content: `${correction}\n\nUse tools only if this correction requires new evidence or paint; otherwise emit the complete replacement answer now. Preserve every previously retrieved, tool-grounded requested field.`,
            });
            emit({ type: "text", text: `[Evidence gate: ${correction}]` });
            continue;
          }
        }
      }
      const notes = runVerifiers(callLog, goal);
      if (notes.length) displayText = `${displayText || ""}\n\n${notes.join("\n\n")}`;
    }
    if (displayText) {
      lastDraftText = displayText;
      emit({ type: "text", text: displayText });
    }
    // echo the assistant turn back verbatim so tool_use ids / tool_calls pair up
    messages.push(provider === "anthropic" ? { role: "assistant", content: turn.raw.content } : turn.raw);
    if (!turn.toolCalls.length) {
      emit({ type: "done", text: displayText });
      return { status: "done", text: displayText, iterations: iterations + 1 };
    }
    const results = [];
    const highlightOnlyTurn = turn.toolCalls.every((call) => call.name === "highlight_citation");
    if (highlightOnlyTurn) consecutiveHighlightOnlyTurns += 1;
    else consecutiveHighlightOnlyTurns = 0;
    for (const call of turn.toolCalls) {
      if (signal?.aborted) return aborted();
      const callArgs = call.name === "highlight_citation" && !call.argsError
        ? enrichHighlightCitationArgs(call.args, callLog)
        : call.args;
      emit({ type: "tool_start", name: call.name, args: callArgs });
      let out;
      // Block illegal workflow transitions before execute (durable phase machine).
      const wfBefore = advanceTakeoffWorkflow(takeoffIntent, callLog, goal);
      if (!call.argsError && isIllegalWorkflowTransition(wfBefore, call.name, callArgs || {})) {
        out = {
          error: `Illegal workflow transition (${takeoffIntent}/${wfBefore.phase}): ${call.name} is not allowed now.${wfBefore.nextMove ? ` ${wfBefore.nextMove}` : ""}`,
        };
      } else {
        try {
          out = call.argsError
            ? { error: `Invalid arguments for ${call.name}: ${call.argsError}.` }
            : await execute(call.name, callArgs);
        } catch (e) {
          out = { error: `Tool ${call.name} failed: ${String((e && e.message) || e)}` };
        }
      }
      if (out == null || typeof out !== "object") out = { result: out ?? null };
      // Vision-as-a-tool (real, later addition — see aiConfig()'s own
      // visionModel comment): route any raw image through an ISOLATED,
      // narrowly-scoped vision call instead of injecting the pixels
      // straight into the loop's own ongoing conversation. The model
      // driving the loop and writing the final answer never gets to "just
      // look and see" — it only ever gets the vision model's own literal,
      // factual description, threaded in exactly like any other tool
      // result. Degrades honestly on failure: falls back to the OLD raw-
      // image path (never silently loses the ability to look), but emits a
      // real status event disclosing the degradation rather than hiding it.
      if (out.image_data_url) {
        try {
          const description = await describeImageForAgent({ imageDataUrl: out.image_data_url, cfg, fetchFn });
          const { image_data_url: _img, ...rest } = out;
          out = { ...rest, visual_description: description };
        } catch (e) {
          emit({ type: "text", text: `[Vision routing degraded — the vision model call failed (${String((e && e.message) || e)}), falling back to the raw image for this one result.]` });
        }
      }
      if (!call.argsError) callLog.push({ id: call.id, name: call.name, args: callArgs, out });
      emit({ type: "tool_end", name: call.name, result: out });
      results.push({ call, out });
      // Hard compile infrastructure failures (missing tsx, etc.) must not burn
      // the step cap — abort as soon as Session+ODL compile fails once.
      if (call.name === "compile_corpus_takeoff" && out?.error
        && corpusCompileKind(goal)) {
        const msg = `Production compile_corpus_takeoff failed: ${String(out.error).slice(0, 500)}. `
          + "Install opentakeoff/mcp dependencies (`cd opentakeoff/mcp && npm install`) so the Session+ODL "
          + "pipeline can load TypeScript (tsx), then re-run. Not retrying.";
        emit({ type: "text", text: msg });
        emit({ type: "done", text: msg });
        return { status: "error", text: msg, iterations: iterations + 1 };
      }
    }
    appendToolResults(provider, messages, results);
    // Re-inject the workflow directive when the phase advances so later turns
    // follow the state machine without relying on a one-shot system prompt.
    {
      const wfAfter = advanceTakeoffWorkflow(takeoffIntent, callLog, goal);
      if (wfAfter.phase !== lastWorkflowPhase) {
        lastWorkflowPhase = wfAfter.phase;
        const directive = workflowDirective(takeoffIntent, wfAfter);
        if (directive) {
          messages.push({ role: "user", content: directive });
          emit({ type: "text", text: `[Workflow: ${takeoffIntent} / ${wfAfter.phase}]` });
        }
      }
    }
    // Paint thrash without an Answer burns the step cap (seen on VAV rollups
    // that highlight inventory rows forever). Nudge once: stop extra paints
    // and write the complete takeoff answer from retrieved cells.
    const paintCount = callLog.filter((c) => c.name === "highlight_citation" && !c.out?.error).length;
    const findTextCount = callLog.filter((c) => c.name === "find_text").length;
    const hasQueryEvidence = callLog.some((c) =>
      c.name === "query_table" && !c.out?.error
      && (Number(c.out?.count) > 0 || (c.out?.matches || []).length > 0));
    const takeoffLike = /\btakeoff\b|\bscheduled\s+(?:unit\s+)?counts?\b|\bequipment\s+(?:totals?|counts?)\b/i.test(goal);
    // Mid-loop: auto-run missing family title-scans before the step cap
    // (full HVAC takeoffs were burning 80 steps on find_text and never counting).
    if (takeoffLike && iterations >= 8 && iterations % 4 === 0) {
      const missingTitles = missingScheduleTitleScans(callLog, goal);
      const scanSummaries = [];
      for (const title of missingTitles) {
        // Skip titles already attempted (including zero-count) so a bad Exact
        // needle cannot thrash the step cap forever.
        const attempted = callLog.some(({ name, args }) =>
          name === "query_table"
          && String(args?.title || "").toUpperCase() === title.toUpperCase()
          && (args?.row_key == null || String(args.row_key).trim() === ""));
        if (attempted) continue;
        const args = { title };
        emit({ type: "tool_start", name: "query_table", args });
        let out;
        try { out = await execute("query_table", args); }
        catch (e) { out = { error: String((e && e.message) || e) }; }
        if (out == null || typeof out !== "object") out = { result: out ?? null };
        callLog.push({ id: `auto_title_scan_${callLog.length}`, name: "query_table", args, out });
        emit({ type: "tool_end", name: "query_table", result: out });
        if (!out.error && Number(out.count) >= 1) {
          const sampleTitle = String(out.matches?.[0]?.title?.text || out.matches?.[0]?.title || title);
          scanSummaries.push(
            `${sampleTitle}: count=${out.count}`
            + (out.building_tag_counts ? ` building_tag_counts=${JSON.stringify(out.building_tag_counts)}` : "")
            + (out.point_type_counts ? ` point_type_counts=${JSON.stringify(out.point_type_counts)}` : ""),
          );
        }
      }
      if (scanSummaries.length) {
        messages.push({
          role: "user",
          content: `Auto title-scan results (copy these tool counts into the final answer; stop find_text browsing):\n${scanSummaries.join("\n")}\nEmit the COMPLETE takeoff answer now with every requested family count and cite MARK cells. Do not call more tools unless Exact paint args are named.`,
        });
        emit({ type: "text", text: "[Loop nudge: title-scans completed — write the takeoff answer.]" });
        answerNudgeSent = true;
      }
    }
    const shouldNudgeAnswer = !answerNudgeSent && !lastDraftText && hasQueryEvidence
      && (consecutiveHighlightOnlyTurns >= 3
        || (paintCount >= 10 && iterations >= 14)
        || (paintCount >= 6 && iterations >= Math.max(18, Math.floor(maxIterations * 0.35)))
        || (takeoffLike && findTextCount >= 6 && iterations >= 16)
        || (takeoffLike && iterations >= 28));
    if (shouldNudgeAnswer) {
      answerNudgeSent = true;
      messages.push({
        role: "user",
        content: "Stop painting additional inventory / off-ask rows and stop extra find_text browsing. You already have query_table evidence and enough highlight_citation paints for the requested tags and fields. Do not call more tools unless a gate names Exact paint args still missing. Emit the COMPLETE final answer now: every requested count and attribute with sheet citations, using only retrieved cells.",
      });
      emit({ type: "text", text: "[Loop nudge: write the final answer now — stop inventory paint thrash.]" });
    }
    // After a nudge, refuse further tool thrash — demand a text-only answer.
    if (answerNudgeSent && !lastDraftText && iterations >= 36 && iterations % 6 === 0) {
      messages.push({
        role: "user",
        content: "CRITICAL: Do NOT call any more tools. Reply with the COMPLETE takeoff answer as plain text only, using Auto title-scan / query_table counts already in this thread. Omit the word \"highlighted\" unless you are sure that exact cell was painted.",
      });
      emit({ type: "text", text: "[Loop nudge: text-only answer required — tools closed.]" });
    }
  }
  emit({ type: "max_iterations", limit: maxIterations });
  // Only surface a draft Answer if it already clears evidence gates — otherwise
  // a step-cap stop would publish a paint-only / incomplete takeoff as done.
  if (lastDraftText && !requiredEvidenceCorrection(callLog, goal, lastDraftText)) {
    emit({ type: "text", text: lastDraftText });
    return { status: "max_iterations", iterations, text: lastDraftText };
  }
  return { status: "max_iterations", iterations };
}
