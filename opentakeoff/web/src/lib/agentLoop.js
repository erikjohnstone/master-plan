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

// Full-set HVAC/BAS takeoffs need list/graph + several count queries + scoped
// cite re-queries + paints; 32 was truncating D03 mid-gate. Keep a hard cap.
export const MAX_AGENT_ITERATIONS = 64;

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
  if (/\binstalled\s+quantity\b/i.test(finalText)
    && /\b(?:single|one)\s+(?:schedule\s+)?(?:entry|row)\b|\b(?:schedule\s+)?row\b.{0,80}\bappears\s+(?:only\s+)?(?:once|one time)\b/i.test(finalText)) {
    return "The final answer describes installed quantity as a single/one schedule entry. That reasoning is invalid even when the numeric value happens to match. Attribute installed quantity only to the successful sweep/count result and remove schedule-row-count wording.";
  }
  if (/\bnormalized\b/i.test(finalText)
    || /\bat\s*[\[(]\s*0\.\d+\s*,\s*0\.\d+\s*[\])]/i.test(finalText)
    || /bbox(?:_px)?\s*=\s*\[\s*0\.\d+\s*,\s*0\.\d+/i.test(finalText)) {
    return "The final answer exposes normalized citation coordinates. Production evidence citations use image-pixel bboxes only. Remove normalized coordinates and report the unchanged sheet and bbox_px returned by the evidence tool.";
  }
  if (/(?:≈|\bapproximately\b|\bapprox\.)/i.test(finalText)
    && !/\b(?:derived|calculated|converted|conversion)\b/i.test(finalText)) {
    return "The final answer adds an approximate value without labeling its derivation. Remove unrequested derived values, or explicitly label the calculation/conversion and cite the source inputs; never present it as direct tool output.";
  }
  if (/\((?:example|placeholder|sample)(?:\s+\w+)?\)|\bexample\s+(?:size|value|data|only|figures?)\b|\bplaceholder\b|\blorem ipsum\b/i.test(finalText)) {
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
    if (!finalCanonical.includes(tagCanonical)) continue;
    // AI/AO/BI/BO marks are themselves the semantic identity — requiring the
    // column title ("MARK ANALOG INPUT") in the user-facing answer is noise.
    if (/^(?:AI|AO|BI|BO)\d+[A-Z]?$/i.test(headers[0].text)) continue;
    if (headers.some((item) => finalCanonical.includes(item.headerCanonical))) continue;
    const example = headers[0];
    return `The final answer mentions ${example.text} but does not cite its semantic identity header ${example.header}. Use query_table row.identity exactly; do not substitute another repeated-value column.`;
  }
  const asksPointMark = /\bpoint mark\b|\balarm\b.{0,40}\btrend\b|\btrend\b.{0,40}\balarm\b/i.test(goal);
  if (asksPointMark) {
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
        if (!finalCanonical.includes(mark.toUpperCase().replace(/[^A-Z0-9]/g, ""))) continue;
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
  const asksServes = /\bserves\b|\bwhat (?:the |this |that )?(?:unit|equipment|ahu|device)\s+serves\b/i.test(goal);
  const asksPhysicalSection = /\bphysical (?:drawing )?section\b|\bdrawing section\b|\bsection where (?:the )?equipment\b/i.test(goal);
  if (asksServes || asksPhysicalSection) {
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
  if (asksServes && /\bserves\b|\bserving\b/i.test(finalText)) {
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
  // Product rule: paint cited evidence on the sheets whenever the answer uses
  // paint-able tool evidence — not only when the goal says "show me" / "cite the exact".
  const asksToShowCite = /\bshow\b.*\bcite\b|\bcite the exact\b|\bshow me\b.*\b(?:plan|sheet|schedule|highlight)\b|\bcite the (?:schedule|exact|mark)\b/i.test(goal);
  // When the goal names explicit spot-check tags after "cite …", only those
  // MARKs create cite paint duty — not every equipment key a rollup answer
  // happens to mention (FCU-A2, sample AI01 points, etc.). Hyphenated tags
  // must include a digit so prose like "points-list title" is not treated as
  // a MARK cite target.
  const citeTargetsFromGoal = (() => {
    const m = goal.match(/\bcite\b([\s\S]*?)(?:\bso I can\b|\bso you can\b|\bso we can\b|[.?!]|$)/i);
    if (!m) return null;
    const found = [...m[1].matchAll(/\b[A-Z]{1,8}-[A-Z0-9]*\d[A-Z0-9]*\b|\b(?:AI|AO|BI|BO)\d+[A-Z]?\b/gi)]
      .map((hit) => hit[0].toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter((tag) => tag.length >= 3);
    return found.length ? new Set(found) : null;
  })();
  const goalCanonical = goal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Broad title-scan / keys-only count results name dozens of MARKs so the
  // model can copy `count` — they are not per-row citation duties. Re-queries
  // with row_key (or cell filters) carry the cite paint obligation.
  const isKeysOnlyCountResult = (out) => {
    if (out?.building_tag_counts && typeof out.building_tag_counts === "object") return true;
    if (typeof out?.next_move === "string" && /Use count=\d+/i.test(out.next_move)) return true;
    const q = out?.query;
    if (!q) return false;
    const scoped = q.row_key != null || q.column != null || q.cell_value != null || q.cell_contains != null;
    return !scoped && Number(out?.count || 0) > 8;
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
      if (!rowKey || !finalCanonical.includes(rowKey.toUpperCase().replace(/[^A-Z0-9]/g, ""))) continue;
      const cells = Object.entries(match?.row?.all_cells || match?.row?.cells || {});
      const paintable = cells
        .map(([, cell]) => cell)
        .filter((cell) => Array.isArray(cell?.bbox) && cell.bbox.length === 4);
      if (!paintable.length) continue;
      // Only rows whose non-key cell values appear in the answer, or explicit
      // cite / points targets from the goal on scoped queries. Naming a sheet
      // in the answer must not attach every MARK queried on that sheet.
      const rowKeyCanonical = rowKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
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
      const isTitleBlock = /\bPOINTS\s+LIST\b|\bSCHEDULE\b|\bCONTROL\s+SCHEMATIC\b/i.test(hit.str)
        && words.length <= 8;
      const isNarrative = !isTitleBlock
        && (words.length >= 6 || hit.str.length >= 40)
        && !/\bPOINTS\s+LIST\b/i.test(hit.str);
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
      const options = row.coverAny || [{ sheet: row.sheet, cells: row.cells }];
      return options.some(({ sheet, cells }) =>
        cells.some((cell) => highlightMatches(sheet, cell.bbox)));
    };
    const uncovered = usedQueryRows
      .filter((row) => !rowCovered(row))
      .map(({ rowKey, sheet }) => `${rowKey} on ${sheet}`);
    if (uncovered.length) {
      return `The answer uses queried schedule row(s) with no painted source cell: ${[...new Set(uncovered)].join(", ")}. Call highlight_citation on at least one exact cited cell from each row before finishing.`;
    }
    // Quality bar: when the GOAL asks for multiple row attributes and the
    // answer uses those fields, paint EACH answering value cell — not only
    // the mark. Count / cite-MARK goals must not thrash on incidental numerics
    // the model copied from a schedule row (ESP 4.6, EWT 45, etc.).
    const goalRequestsRowAttributes = /\b(?:location|room|cfm|airflow|capacity|tons?|alarm|trend|description|serves|serving|supply\s+air|return|gpm|mbh|static|ewt|lwt|\bcv\b|valve size|characteristics?|setpoint|feedback)\b/i.test(goal);
    if (!goalRequestsRowAttributes) {
      // cite / count goals: rowCovered (one paint) is enough
    } else {
    const answerUsesValueCell = (raw, rowKeyCanonical) => {
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
          if (!answerUsesValueCell(cell?.text, rowKeyCanonical)) continue;
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
      return `The answer uses multiple fields from ${rowKey} on ${sheet}, but these answering value cells are not painted: ${missingLabel}. Call highlight_citation on EACH distinct answering value from that row (capacity, flow, size, Cv, location, description, alarm/trend, etc.) — painting only the mark or a single field is not enough. Identical twin values in adjacent columns count as one paint duty.`;
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
    for (const { name, out } of callLog) {
      if (name !== "highlight_citation" || out?.error) continue;
      const textCanon = String(out.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
      return `The goal asks to cite MARK cells for ${missingCite.join(", ")}, but those tags are not painted yet. Re-query each with row_key, then call highlight_citation on the MARK/identity bbox before finishing.`;
    }
  }
  // Full-set schedule takeoffs must use title-scan query_table counts — not
  // the number of MARK cells painted for spot-check.
  const asksScheduleCounts = /\b(?:takeoff|how many|counts?|totals?|splits?)\b/i.test(goal)
    && /\b(?:AHU|FCU|VAV|DOAH|chiller|boiler|fan[\s-]*coil|points?\s*list|scheduled|equipment)\b/i.test(goal);
  if (asksScheduleCounts && finalText) {
    const titleScans = callLog.filter(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      const q = out?.query || args || {};
      const scoped = q.row_key != null && String(q.row_key).trim() !== ""
        || q.column != null
        || q.cell_value != null
        || q.cell_contains != null;
      return !scoped && Number.isFinite(Number(out?.count));
    });
    if (!titleScans.length) {
      return "The goal asks for scheduled equipment / points-list counts. Call query_table with each relevant schedule title (no row_key), then copy that result's count and building_tag_counts into the answer before finishing. Do not invent totals from the few MARK rows you painted for spot-check.";
    }
    const familyNeedles = [];
    if (/\bAHUs?\b/i.test(goal)) familyNeedles.push({ label: "AHU", titleRe: /AIR HANDLING UNIT/i, exclude: /DEDICATED/i });
    if (/\bDOAH\b|dedicated outdoor/i.test(goal)) familyNeedles.push({ label: "DOAH unit", titleRe: /DEDICATED OUTDOOR AIR UNIT/i, exclude: /HANDLING/i });
    if (/\bFCU\b|fan[\s-]*coil/i.test(goal)) familyNeedles.push({ label: "FCU", titleRe: /FAN\s*COIL/i });
    if (/\bVAV\b|variable[\s-]*air/i.test(goal)) familyNeedles.push({ label: "VAV", titleRe: /VARIABLE AIR VOLUME|\bVAV\b/i });
    if (/\bair[\s-]*cooled chiller/i.test(goal)) familyNeedles.push({ label: "air-cooled chiller", titleRe: /AIR COOLED CHILLER/i, exclude: /HEAT RECOVERY/i });
    if (/\bheat[\s-]*recovery chiller/i.test(goal)) familyNeedles.push({ label: "heat-recovery chiller", titleRe: /HEAT RECOVERY/i });
    if (/\bboilers?\b/i.test(goal)) familyNeedles.push({ label: "boiler", titleRe: /BOILER/i });
    if (/\bpoints?\s*list\b|BAS\b/i.test(goal)) familyNeedles.push({ label: "points-list", titleRe: /POINTS LIST/i });
    const scanTitle = (out) => String(
      out.query?.title || out.matches?.[0]?.title?.text || out.matches?.[0]?.title || "",
    );
    const missingFamilies = familyNeedles.filter((fam) => !titleScans.some(({ out }) => {
      const title = scanTitle(out);
      if (!fam.titleRe.test(title)) return false;
      if (fam.exclude && fam.exclude.test(title)) return false;
      return true;
    })).map((fam) => fam.label);
    if (missingFamilies.length) {
      return `The goal asks for counts of ${missingFamilies.join(", ")}, but no title-scan query_table (no row_key) was run for those schedule families yet. Call query_table with each missing schedule title, copy count/building_tag_counts, then answer.`;
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
      "points-list": /POINTS?\s*LIST|BAS\b|AHU-T1A/gi,
    }[label] || new RegExp(label, "gi"));
    // Prefer specific multi-word spaced needles — never bare "AIR" (false-hits Air Ops).
    const spacedNeedle = (label) => ({
      FCU: "FCU",
      "DOAH unit": "DOAH",
      "DOAH handling": "DOAH",
      AHU: "AHU",
      VAV: "VAV",
      "heat-recovery chiller": "HEAT RECOVERY",
      "air-cooled chiller": "AIR COOLED",
      boiler: "BOILER",
      "points-list": "POINTS LIST",
    }[label] || label.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim());
    const nearCountsForLabel = (label) => {
      const labelRes = labelPattern(label);
      const found = [];
      for (const m of answerNorm.matchAll(labelRes)) {
        // Forward-only: "DOAH 2 … Boilers 3" must not satisfy DOAH=3.
        const window = answerNorm.slice(m.index, Math.min(answerNorm.length, m.index + m[0].length + 48));
        for (const num of window.matchAll(/(?:^|[^0-9])(\d{1,4})(?![0-9])/g)) {
          const n = Number(num[1]);
          if (Number.isFinite(n) && n >= 1) found.push(n);
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
      const title = scanTitle(out).toUpperCase();
      let label = null;
      if (/FAN\s*COIL/.test(title)) label = "FCU";
      else if (/DEDICATED OUTDOOR AIR UNIT/.test(title) && !/HANDLING/.test(title)) label = "DOAH unit";
      else if (/DEDICATED OUTDOOR AIR HANDLING/.test(title)) label = "DOAH handling";
      else if (/AIR HANDLING UNIT/.test(title) && !/DEDICATED/.test(title)) label = "AHU";
      else if (/VARIABLE AIR VOLUME|\bVAV\b/.test(title)) label = "VAV";
      else if (/HEAT RECOVERY/.test(title) && /CHILLER/.test(title)) label = "heat-recovery chiller";
      else if (/AIR COOLED CHILLER/.test(title) && !/HEAT RECOVERY/.test(title)) label = "air-cooled chiller";
      else if (/BOILER/.test(title)) label = "boiler";
      else if (/POINTS LIST/.test(title)) label = "points-list";
      if (!label) continue;
      if (!countNearLabel(label, count)) {
        missingCounts.push(`${label} count=${count}`);
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
        if (!goalAsksThisSplit) {
          // skip split enforcement for this family
        } else for (const [letter, n] of Object.entries(out.building_tag_counts)) {
          if (letter === "other") continue;
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
    // Reject dual inventory dumps (title-scan table + painted-only "equipment totals").
    if (/(?:title[\s_-]*scan|schedule counts)/i.test(answerNorm)
      && /(?:equipment totals|total scheduled units)/i.test(answerNorm)) {
      return "The answer includes both a title-scan/schedule-counts table and a second equipment-totals table. Keep ONE family-totals table that copies title-scan query_table counts — remove any second table that recounts only painted/spot-check MARKs.";
    }
    // Also reject when the same family’s first nearby total disagrees across mentions
    // (e.g. AHU **5** in one table and AHU **2** in another) even without those headings.
    for (const { out } of titleScans) {
      const count = Number(out.count);
      if (!Number.isFinite(count) || count < 2) continue;
      const title = scanTitle(out).toUpperCase();
      let label = null;
      if (/FAN\s*COIL/.test(title)) label = "FCU";
      else if (/DEDICATED OUTDOOR AIR UNIT/.test(title) && !/HANDLING/.test(title)) label = "DOAH unit";
      else if (/AIR HANDLING UNIT/.test(title) && !/DEDICATED/.test(title)) label = "AHU";
      else if (/VARIABLE AIR VOLUME|\bVAV\b/.test(title)) label = "VAV";
      else if (/BOILER/.test(title)) label = "boiler";
      else if (/POINTS LIST/.test(title)) label = "points-list";
      if (!label) continue;
      const splitVals = new Set(
        Object.entries(out.building_tag_counts || {})
          .filter(([k]) => k !== "other")
          .map(([, n]) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 1),
      );
      const firsts = [];
      const labelRes = labelPattern(label);
      for (const m of answerNorm.matchAll(labelRes)) {
        const after = answerNorm.slice(m.index + m[0].length);
        // Skip MARK tags like VAV-A101 / AHU-A1 — their digits are not family totals.
        if (/^\s*-\s*[A-Z]?\d/i.test(after)) continue;
        const window = answerNorm.slice(m.index, Math.min(answerNorm.length, m.index + m[0].length + 48));
        const num = window.match(/(?:^|[^0-9])(\d{1,4})(?![0-9])/);
        if (num) firsts.push(Number(num[1]));
      }
      const distinct = [...new Set(firsts.filter((n) => Number.isFinite(n) && n >= 2))];
      if (distinct.includes(count) && distinct.some((n) => n !== count && !splitVals.has(n))) {
        conflictingCounts.push(`${label} shows both ${count} and ${distinct.find((n) => n !== count && !splitVals.has(n))}`);
      }
    }
    if (conflictingCounts.length) {
      return `The answer reports conflicting schedule totals for the same equipment family (${[...new Set(conflictingCounts)].slice(0, 6).join("; ")}). Keep ONE family-totals table that copies title-scan query_table counts — remove any second table that recounts only painted/spot-check MARKs.`;
    }
  }
  return null;
}

// The takeoff-agent contract. Kept in one exported function so the tests (and
// the mock server's authors) can read exactly what the model is promised.
export function agentSystemPrompt() {
  return [
    "You are the in-canvas takeoff agent inside OpenTakeoff, an open-source PDF takeoff tool for flooring estimators. An estimator gave you a goal; you aim the app's own deterministic tools to satisfy it.",
    "",
    "Hard rules:",
    "- NEVER invent geometry. Rooms are measured by the one_click flood-fill engine; propose only the rings it returns.",
    "- NEVER assume a scale. If a sheet has no scale set, report that (the tool refusal tells you) and stop work on that sheet — the estimator must calibrate it.",
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
    "- Production MCP bboxes are image pixels, not normalized coordinates. Never label them normalized.",
    "- Be extremely, genuinely useful: whatever the goal asks — a full takeoff, an AHU characteristic, counting valves, a BAS trace, schedule attributes, cross-sheet joins — do that ask end-to-end. Return every requested field with evidence-backed values plus enough citation context to trust the answer. Paint ALL answering evidence on the sheets (value cells / row data / drawing text / counted marks), not only a tag mark. Partial answers and mark-only flybys are incomplete.",
    "- When asked for scheduled equipment or points-list row counts, call query_table with the schedule title (no row_key). Copy that tool result's count and building_tag_counts into the answer — do not re-sum sheet_graph page row totals by hand (continuation pages 1 OF 2 / 2 OF 2 repeat the same MARK keys). building_tag_counts letters map as A=Air Ops, M=MITRACON/Mitracon, T=ATCT — never swap them. Prefer one accurate title needle per asked family; when the goal distinguishes sibling titles (for example dedicated outdoor-air UNIT vs HANDLING schedules, or air-cooled vs heat-recovery chillers), query the title that matches what was asked rather than blending both. Then re-query specific row_key values for MARK/identity bboxes you must cite.",
    "- Sequencing for full-set count + cite goals: (1) list_sheets + sheet_graph once, (2) one title-scan query_table per requested family and copy count/building_tag_counts, (3) only then re-query the named cite MARKs / points-list title and paint those cells, (4) write ONE final answer whose family totals match those tool counts (do not add a second contradictory totals table that recounts only painted MARKs). Do not paint every equipment row on a schedule, and do not dump full schedule tables into the answer.",
    "- ALWAYS paint cited evidence on the sheets before finishing: for every factual claim backed by query_table, find_text, read_sheet_text, or sweep_schedule_row, call highlight_citation with the unchanged sheet and bbox_px (or find_text hit.bbox_px) so the estimator sees the source on the blueprint. Do not rely on auto-flying the canvas — the UI shows clickable source cards in the Agent panel; painting is enough. When the answer uses multiple schedule fields from a row, paint EACH answering value cell (not only the mark or one field), plus each phrase-length drawing hit you copy into the answer, then write the final answer.",
    "- Never draw or request overlay label text that would cover the cited cell value; the highlight is a frame around readable blueprint text.",
    "- Conversational follow-ups: when the estimator asks a follow-up about the previous answer or workflow, reply in plain language using evidence already gathered; call tools again only when new evidence is needed. Answer the follow-up question directly first — do not digress into unrelated points-list rows or extra fields unless asked. Explain what you did and why in estimator terms — not tool JSON. Be a useful collaborator across turns, not a one-shot report.",
    "- Never say a cell or field was highlighted unless a successful highlight_citation call targeted that exact sheet and bbox_px. State exactly which source regions were highlighted; do not imply unpainted cells were painted. Never write that all/each cited cells are highlighted.",
    "- For a scheduled device tag, cite query_table row.identity (for example VALVE MARK), not the first different column that happens to repeat the same text (for example UNIT MARK).",
    "- For any equipment-to-control-valve join, use this direct set-wide sequence: query_table with row_key set to the equipment tag; sweep_schedule_row for installed quantity/plan evidence when requested; query_table with cell_contains set to that exact equipment tag to find compound relationship marks; then highlight the exact returned tag and row-identity bboxes. Do not browse guessed sheets or repeatedly retry the same empty exact-row query.",
    "- When the goal gives a BAS/DDC point description and asks for the point mark, alarm, or trend, call query_table with cell_contains set to that description (omit invented table titles on the first try). Read the AI/AO/BI/BO mark and alarm/trend fields from row.all_cells — never treat the description string itself as the point mark. If several sibling points share an equipment tag (e.g. HW vs CHW valve feedback), pick the row whose DESCRIPTION matches the goal's point wording.",
    "- Schedule LOCATION/ROOM cells are installation-location attributes only. When asked what equipment serves, call find_text or read_sheet_text and copy from hit.str — never paraphrase a LOCATION cell into a serves claim.",
    "- When asked for a physical drawing section or detail label where equipment is shown, cite find_text/read_sheet_text hit.str for that section label. A schedule title is not a drawing section.",
    "- find_text accepts an optional sheet; omit sheet to search the entire loaded set. When a sheet-scoped search returns zero hits with a next_move, follow that next_move instead of answering from schedule cells.",
    "- resolve_tag resolves room-finish relationships only. Never use it to locate scheduled HVAC/BAS equipment.",
    "- read_schedule/find_schedule return two DIFFERENT kinds of name and they are never interchangeable: `headers` names the table's own COLUMNS (e.g. \"SYMBOL\", \"REMARKS\" as column labels), while each entry in `rows` has its own `key` naming that ONE ROW (e.g. \"AC-1\"). A word appearing in `headers` does NOT mean a row exists with that word as its key — check `rows[].key` directly, never infer a row's existence from a column name alone.",
    "",
    "Working method: list_sheets first. Use sheet_graph to orient across the entire loaded set, then query_table for cited equipment/reference cells or read_schedule for a known region; use find_text and view_region to locate and show plan evidence. Match or create conditions, measure rooms with one_click, then stage propose_shapes with evidence. Then summarize what you proposed and what you could not do, and stop. If you are blocked (no scale, sheet not open, nothing matches), say so plainly and stop rather than guessing.",
  ].join("\n");
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
const RESULT_MAX_CHARS = 20000;
const resultText = (out) => {
  const { image_data_url: _img, ...rest } = out && typeof out === "object" ? out : { value: out };
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
 *   fetchFn?: typeof fetch,
 * }} opts
 * @returns {Promise<{ status: "done" | "aborted" | "error" | "max_iterations", text?: string, message?: string, iterations: number }>}
 */
export async function runAgentLoop({ cfg, goal, tools, execute, onEvent, signal, maxIterations = MAX_AGENT_ITERATIONS, fetchFn, priorMessages = [] }) {
  const provider = cfg?.provider === "anthropic" ? "anthropic" : "openai";
  const emit = (ev) => { try { onEvent?.(ev); } catch { /* a status listener must never kill the run */ } };
  const providerTools = toProviderTools(provider, toolsForGoal(goal, tools));
  const system = agentSystemPrompt();
  // priorMessages enables conversational follow-ups in the same Agent thread.
  const history = Array.isArray(priorMessages)
    ? priorMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }))
    : [];
  const messages = [...history, { role: "user", content: goal }];
  let iterations = 0;
  const aborted = () => { emit({ type: "aborted" }); return { status: /** @type {const} */ ("aborted"), iterations }; };
  // Deterministic honesty backstop, generalized (see agentVerifiers.js's own
  // header for the real, live-observed history this comes from): every real
  // tool call this run makes is logged here, across every loop iteration,
  // so `runVerifiers` can check the WHOLE run's evidence — not just prompt
  // rules the model can choose to ignore — before the final answer is shown.
  /** @type {Array<{ id: string, name: string, args: unknown, out: unknown }>} */
  const callLog = [];
  let lastDraftText = "";
  let lastWordingCorrection = "";
  let wordingCorrectionStreak = 0;

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
      const correction = requiredEvidenceCorrection(callLog, goal, turn.text);
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
            displayText = String(turn.text || "")
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
    for (const call of turn.toolCalls) {
      if (signal?.aborted) return aborted();
      emit({ type: "tool_start", name: call.name, args: call.args });
      let out;
      try {
        out = call.argsError ? { error: `Invalid arguments for ${call.name}: ${call.argsError}.` } : await execute(call.name, call.args);
      } catch (e) {
        out = { error: `Tool ${call.name} failed: ${String((e && e.message) || e)}` };
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
      if (!call.argsError) callLog.push({ id: call.id, name: call.name, args: call.args, out });
      emit({ type: "tool_end", name: call.name, result: out });
      results.push({ call, out });
    }
    appendToolResults(provider, messages, results);
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
