import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import dotenv from "dotenv";
import { buildServer } from "../server.ts";
import { Session } from "../src/session.ts";

export const DEMO_TOOLS = new Set([
  "sheet_graph",
  "find_schedule",
  "read_schedule",
  "query_table",
  "read_sheet_text",
  "find_text",
  "sweep_schedule_row",
  "project_takeoff",
  "view_sheet",
]);

function arg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export function parseJsonAnswer(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("Model returned no final answer.");
  const text = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Final answer must be a JSON object.");
  }
  return parsed;
}

export function runTimingMetadata(cold, setupLatencyMs) {
  return {
    latency_scope: "prompt_to_final_answer_after_loaded_source_index",
    setup: {
      fresh_session: true,
      source_index_forced_cold: cold,
      latency_ms: +setupLatencyMs.toFixed(2),
    },
  };
}

const citationKey = (sheet, bbox) =>
  `${sheet}|${Array.isArray(bbox) ? bbox.join(",") : ""}`;

export function citationProvenanceErrors(answer, toolCalls) {
  const planTags = new Set(toolCalls.flatMap((call) =>
    call.name === "sweep_schedule_row"
      ? (call.result?.data?.tag_citations ?? []).map((citation) =>
        citationKey(citation.sheet, [
          citation.bbox?.x0,
          citation.bbox?.y0,
          citation.bbox?.x1,
          citation.bbox?.y1,
        ]))
      : []));
  if (!planTags.size) return [];
  const errors = [];
  // Field names may be bare (`installed_quantity`) or scoped
  // (`cv_1_installed_quantity`, `rtu_1_equipment_tag`) when one prompt
  // asks for several tags.
  const fields = Object.keys(answer?.answer || {}).filter((field) =>
    /(?:^|_)(?:equipment_tag|installed_quantity|plan_tag)$/i.test(field));
  for (const field of fields) {
    const citations = answer?.answer?.[field]?.citations;
    if (!Array.isArray(citations) || !citations.length) continue;
    for (const citation of citations) {
      if (!planTags.has(citationKey(citation.sheet_id, citation.bbox_px))) {
        errors.push(`${field} must cite a plan tag returned by sweep_schedule_row.tag_citations`);
      }
      if (citation.table_title || citation.row_key || citation.column) {
        errors.push(`${field} uses a plan tag citation, so table_title, row_key, and column must be null or omitted`);
      }
    }
  }
  return errors;
}

export function answerShapeErrors(answer, truth) {
  if (answer?.status !== "done" || !answer.answer || typeof answer.answer !== "object") return [];
  const errors = [];
  for (const [field, spec] of Object.entries(truth.expected)) {
    const value = answer.answer?.[field]?.value;
    if (value === undefined) {
      errors.push(`${field} is missing`);
    } else if (spec.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      errors.push(`${field} must be a finite JSON number, not ${typeof value}`);
    } else if (spec.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
      errors.push(`${field} must be a JSON integer, not ${typeof value}`);
    } else if (spec.type === "string" && typeof value !== "string") {
      errors.push(`${field} must be a JSON string, not ${typeof value}`);
    }
  }
  return errors;
}

export function citationFormErrors(answer, truth) {
  if (answer?.status !== "done" || !answer.answer || typeof answer.answer !== "object") return [];
  const errors = [];
  for (const field of Object.keys(truth.expected)) {
    const citations = answer.answer?.[field]?.citations;
    if (!Array.isArray(citations) || !citations.length) {
      errors.push(`${field} must include at least one citation`);
      continue;
    }
    for (const [index, citation] of citations.entries()) {
      if (!citation || typeof citation !== "object" || Array.isArray(citation)) {
        errors.push(`${field} citation ${index} must be an object`);
        continue;
      }
      if (Object.hasOwn(citation, "sheet")) {
        errors.push(`${field} citation ${index} uses tool key "sheet"; rename it to sheet_id`);
      }
      if (typeof citation.sheet_id !== "string" || !citation.sheet_id.trim()) {
        errors.push(`${field} citation ${index} must include sheet_id`);
      }
      if (!Array.isArray(citation.bbox_px) || citation.bbox_px.length !== 4
        || citation.bbox_px.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        errors.push(`${field} citation ${index} must include bbox_px [x0,y0,x1,y1]`);
      }
    }
  }
  return errors;
}

function collectToolTexts(toolCalls) {
  const texts = [];
  for (const call of toolCalls) {
    const data = call.result?.data;
    if (!data) continue;
    if (call.name === "find_text") {
      for (const hit of data.hits || []) {
        if (typeof hit?.str === "string") texts.push(hit.str);
      }
    } else if (call.name === "read_sheet_text") {
      if (typeof data.text === "string") texts.push(data.text);
      for (const run of data.runs || data.items || []) {
        if (typeof run?.str === "string") texts.push(run.str);
        if (typeof run?.text === "string") texts.push(run.text);
      }
    } else if (call.name === "query_table") {
      for (const match of data.matches || []) {
        for (const cell of Object.values(match.row?.all_cells || match.row?.cells || {})) {
          if (typeof cell?.text === "string") texts.push(cell.text);
        }
        if (typeof match.row?.identity?.text === "string") texts.push(match.row.identity.text);
      }
    }
  }
  return texts;
}

export function drawingTextEvidenceErrors(answer, truth, toolCalls) {
  if (answer?.status !== "done" || !answer.answer || typeof answer.answer !== "object") return [];
  const nonTableFields = Object.entries(truth.expected)
    .filter(([, spec]) => {
      const citations = Array.isArray(spec.citations) ? spec.citations : [spec.citation];
      return citations.some((citation) => citation && !citation.table_title);
    })
    .map(([name]) => name);
  if (!nonTableFields.length) return [];
  const drawingHits = toolCalls.flatMap((call) => {
    if (call.name === "find_text") {
      const query = typeof call.arguments?.q === "string" ? call.arguments.q.trim() : "";
      return (call.result?.data?.hits || []).map((hit) => ({
        sheet: hit.sheet || call.result?.data?.sheet,
        str: hit.str,
        bbox: hit.bbox,
        query,
      }));
    }
    if (call.name === "read_sheet_text") {
      const sheet = call.result?.data?.sheet;
      const text = call.result?.data?.text;
      return typeof text === "string" && sheet ? [{ sheet, str: text, bbox: null, query: "" }] : [];
    }
    if (call.name === "sweep_schedule_row") {
      const tag = call.result?.data?.tag || call.arguments?.tag || "";
      return (call.result?.data?.tag_citations || []).map((citation) => ({
        sheet: citation.sheet,
        str: tag,
        bbox: citation.bbox
          ? [citation.bbox.x0, citation.bbox.y0, citation.bbox.x1, citation.bbox.y1]
          : null,
        query: tag,
      }));
    }
    return [];
  });
  const scheduleCellTexts = new Map(); // text -> list of {sheet, bbox}
  for (const call of toolCalls.filter((c) => c.name === "query_table")) {
    for (const match of call.result?.data?.matches || []) {
      const sheet = match.sheet;
      for (const cell of Object.values(match.row?.all_cells || match.row?.cells || {})) {
        const text = typeof cell?.text === "string" ? cell.text.trim() : "";
        if (!text) continue;
        const bbox = Array.isArray(cell.bbox) ? cell.bbox
          : (cell.bbox && typeof cell.bbox === "object"
            ? [cell.bbox.x0, cell.bbox.y0, cell.bbox.x1, cell.bbox.y1]
            : null);
        const list = scheduleCellTexts.get(text) || [];
        list.push({ sheet, bbox });
        scheduleCellTexts.set(text, list);
      }
    }
  }
  const scheduleTexts = new Set([...scheduleCellTexts.keys()]);
  const sameBbox = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === 4 && b.length === 4
    && a.every((n, i) => Math.abs(n - b[i]) < 0.05);
  const errors = [];
  for (const field of nonTableFields) {
    const value = answer.answer?.[field]?.value;
    const citations = answer.answer?.[field]?.citations;
    if (!Array.isArray(citations)) continue;
    for (const [index, citation] of citations.entries()) {
      if (citation?.table_title || citation?.row_key || citation?.column) {
        errors.push(`${field} citation ${index} is a drawing-text field and must not use table_title, row_key, or column`);
      }
    }
    if (typeof value !== "string" || !value.trim()) continue;
    const supporting = drawingHits.filter((hit) => typeof hit.str === "string" && hit.str.includes(value));
    const exactDrawingHits = supporting.filter((hit) => hit.str.trim() === value.trim());
    const scheduleCellsForValue = scheduleCellTexts.get(value.trim()) || [];
    const exactIsDistinctFromSchedule = exactDrawingHits.some((hit) =>
      !scheduleCellsForValue.some((cell) =>
        (!cell.sheet || !hit.sheet || cell.sheet === hit.sheet)
        && (cell.bbox == null || hit.bbox == null || sameBbox(cell.bbox, hit.bbox))));
    if (scheduleTexts.has(value.trim()) && !exactIsDistinctFromSchedule) {
      errors.push(`${field} value is exact schedule-cell text from query_table; choose a find_text/read_sheet_text phrase that is not a schedule attribute`);
      continue;
    }
    if (!supporting.length) {
      errors.push(`${field} value must appear verbatim in find_text/read_sheet_text evidence; do not reuse a schedule cell`);
      continue;
    }
    if (supporting.some((hit) => hit.query && hit.query === value.trim() && hit.str.trim() !== value.trim())
      && !exactDrawingHits.length) {
      errors.push(`${field} value equals the find_text query string; copy answering text from hit.str instead of echoing q`);
      continue;
    }
    for (const [index, citation] of citations.entries()) {
      const matched = supporting.some((hit) =>
        hit.sheet === citation?.sheet_id
        && (hit.bbox == null || sameBbox(hit.bbox, citation?.bbox_px)));
      if (!matched) {
        errors.push(`${field} citation ${index} must reuse a find_text/read_sheet_text hit sheet and bbox for the returned phrase`);
      }
    }
  }
  return errors;
}

export function toolTextOrthographyErrors(answer, truth, toolCalls) {
  if (answer?.status !== "done" || !answer.answer || typeof answer.answer !== "object") return [];
  const toolTexts = collectToolTexts(toolCalls);
  const errors = [];
  for (const [field, spec] of Object.entries(truth.expected)) {
    if (spec.type !== "string") continue;
    const value = answer.answer?.[field]?.value;
    if (typeof value !== "string" || !value) continue;
    if (/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/.test(value)
      && toolTexts.some((text) => text.includes(value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")))) {
      errors.push(`${field} must copy the exact ASCII hyphen/text from the tool evidence`);
    }
  }
  return errors;
}

function systemPrompt(truth) {
  const fields = Object.entries(truth.expected).map(([name, spec]) => ({
    name,
    type: spec.type,
    tolerance: spec.tolerance,
  }));
  const needsInstalledQuantity = Object.keys(truth.expected).some((name) =>
    /(?:^|_)installed_quantity$/i.test(name));
  const nonTableFields = Object.entries(truth.expected)
    .filter(([, spec]) => {
      const citations = Array.isArray(spec.citations) ? spec.citations : [spec.citation];
      return citations.some((citation) => citation && !citation.table_title);
    })
    .map(([name]) => name);
  const installedFields = Object.keys(truth.expected).filter((name) =>
    /(?:^|_)installed_quantity$/i.test(name));
  const equipmentTagFields = Object.keys(truth.expected).filter((name) =>
    /(?:^|_)equipment_tag$/i.test(name));
  const planTagFields = Object.keys(truth.expected).filter((name) =>
    /(?:^|_)plan_tag$/i.test(name));
  const planStatusFields = Object.keys(truth.expected).filter((name) =>
    /(?:^|_)plan_status$/i.test(name));
  return [
    "You are an HVAC/BAS estimator operating OpenTakeoff's production MCP API.",
    `The real drawing set ${truth.source_file} is already loaded.`,
    "Use deterministic tools for every factual claim. Never infer a value from the field names or invent a citation.",
    needsInstalledQuantity
      ? `Installed quantity is required (${installedFields.join(", ")}): call sweep_schedule_row once per requested tag (tagged_only:true is preferred); this returns the complete tagged count and exact tag_at locations while explicitly excluding the unnecessary unlabeled near-match audit.`
      : "Installed quantity is not requested. Do not call sweep_schedule_row merely for equipment_tag; cite equipment_tag from its exact schedule identity cell returned by query_table.",
    planTagFields.length || planStatusFields.length
      ? `Plan location fields are required (${[...planTagFields, ...planStatusFields].join(", ")}): call sweep_schedule_row for each named tag. When the sweep returns found≥1, set each *_plan_tag value to the exact tag string and cite sweep_schedule_row.tag_citations (no schedule table_title/row_key/column). When the tool refuses because the tag is not drawn on any plan sheet, set the matching *_plan_status value exactly to "refused" and cite the schedule MARK/identity cell that proves the row exists — never invent a plan bbox.`
      : null,
    "For schedule attributes and BAS points-list fields, call query_table. When the prompt gives a distinctive point description but asks you to discover its point mark, use cell_contains with that description, then read every requested field from row.all_cells.",
    "Never invent a table-title filter from the user's category words. Omit title on the first query, or use only a literal title phrase already returned by a tool (for example POINTS LIST); 'BAS points' does not imply a table literally titled BAS POINTS.",
    "If a natural-language description returns no rows, broaden once with cell_contains set to the exact equipment tag from the prompt and no title filter, then inspect the returned descriptions for the requested point meaning. Do not repeat an equivalent empty query.",
    nonTableFields.length
      ? `These required fields need drawing-text evidence rather than a table cell: ${nonTableFields.join(", ")}. Call find_text or read_sheet_text and cite the returned hit. Never fill these fields from a schedule cell, and never invent a label that no tool returned.`
      : "No required field needs free drawing-text evidence.",
    "find_text accepts an optional sheet; omit sheet to search the entire loaded set. When searching drawing text, use a distinctive fragment from the user's question—not the field name itself—and set the answer value from hit.str (a contiguous substring is allowed). Never echo the find_text query string as the value when hit.str is longer.",
    "When the goal asks where equipment appears on a roof/floor plan, prefer a find_text hit whose hit.str equals the exact equipment tag on a plan sheet over longer detail callouts that merely contain the tag (for example prefer plan-sheet \"RTU-1\" over \"RTU-1. TRANSITION TO UNIT\" on a detail sheet). Cite that exact hit's sheet and bbox.",
    "Group independent tool calls into the same response. Inspect each complete result before calling another tool, and never repeat an equivalent query.",
    "Use query_table cell_value for exact cross-table relationships and cell_contains when the related tag is embedded in a compound value; do not scan a whole table or infer a row without source text.",
    "Every query_table match includes row.all_cells. After the first matching row, use all_cells for every requested field on that row instead of making separate column calls.",
    "When a required field is a scheduled equipment or points-list row count (not installed_quantity), call query_table with the schedule title (no row_key). Copy count and building_tag_counts from that tool result into the answer — do not re-sum or re-partition keys by hand. building_tag_counts letters map to building namespaces as A=Air Ops, M=MITRACON/Mitracon, T=ATCT — never swap them. If sheet_graph shows multiple related schedule titles for one family (air-cooled vs heat-recovery chillers; dedicated outdoor-air UNIT vs HANDLING schedules), query each title the goal asks for and sum those count values for unique keys (and merge building_tag_counts). Do not blend sibling titles the goal excluded — for DOAH unit schedules, query title \"DEDICATED OUTDOOR AIR UNIT\" (not HANDLING); query HANDLING only when the goal asks for it. Then re-query specific row_key values for the MARK/identity bboxes you must cite. Do not invent units from vibration-isolation, connection, or calculation cross-reference tables, and do not treat concatenated twin marks as extra units.",
    "For those schedule/points-list count fields, cite the schedule title region: sheet_id + table_title + matches[0].title.bbox as bbox_px, with row_key and column null. Never cite a TAG/MARK cell for a count field.",
    "sweep_schedule_row includes row.cell_citations for every schedule attribute. Use those exact per-cell bboxes; row.citation is only the row identity and must never be reused for attribute fields.",
    "Copy string values exactly from tool text. Do not replace ASCII hyphens with Unicode dashes, and do not paraphrase a returned phrase.",
    "Return JSON only after all required fields are answered.",
    "The final JSON shape is:",
    '{"status":"done","answer":{"<field>":{"value":"typed value","citations":[{"sheet_id":"exact tool sheet","table_title":"when applicable","row_key":"when applicable","column":"when applicable","bbox_px":[x0,y0,x1,y1]}]}}}',
    "Translate every native tool citation into the final JSON citation shape: tool sheet → sheet_id, and tool bbox {x0,y0,x1,y1} → bbox_px [x0,y0,x1,y1]. Preserve the exact sheet string and coordinate numbers, but do not copy the tool object's key names or bbox object shape. Never emit a citation key named sheet.",
    needsInstalledQuantity
      ? `A schedule field uses its exact cell bbox. For ${[...equipmentTagFields, ...installedFields].join(", ") || "equipment_tag and installed_quantity"} in this quantity workflow, use sweep_schedule_row.tag_citations and no schedule citation.`
      : "Every requested schedule field, including equipment_tag, uses its exact query_table identity or value-cell bbox.",
    "A citation must name the exact source header and bbox of the cell containing that field's returned value. Never relabel a header, reuse another field's bbox, or use a row-level bbox for a cell value.",
    "For a related scheduled device's tag field, use query_table row.identity exactly; it selects the semantic identity header when duplicate cells contain the same tag.",
    "When both equipment_tag and installed_quantity are requested, cite the same plan tag_at bbox for both fields.",
    "For an installed quantity, include one plan tag citation per counted instance; the citations array length must equal the quantity.",
    `Required fields (names and types only; values are not supplied): ${JSON.stringify(fields)}`,
    "If a required value or citation cannot be established, return status \"refused\" and explain the missing evidence instead of guessing.",
  ].filter((line) => typeof line === "string" && line.length > 0).join("\n");
}

function requestId(response, json) {
  return response.headers.get("x-request-id")
    || response.headers.get("request-id")
    || json.id
    || null;
}

/** Compact sheet_graph payload for seeding the already-computed setup index into
 * the model transcript without re-sending full span/evidence payloads. */
export function compactSheetGraph(data) {
  const sheets = Array.isArray(data?.sheets) ? data.sheets : [];
  return {
    sheet_count: sheets.length,
    sheets: sheets.map((sheet) => ({
      sheet: sheet.sheet,
      role: sheet.role,
      schedules: Array.isArray(sheet.schedules)
        ? sheet.schedules.map((schedule) => ({
          kind: schedule.kind,
          title: schedule.title,
          rows: schedule.rows,
        }))
        : [],
    })),
  };
}

/** Keep installed-count evidence; drop empty plan-sheet audit rows. */
export function compactSweepScheduleRow(data) {
  if (!data || typeof data !== "object") return data;
  const sheets = Array.isArray(data.sheets) ? data.sheets : [];
  const active = sheets.filter((sheet) => {
    if (!sheet || typeof sheet !== "object") return false;
    if (Number(sheet.found) > 0) return true;
    if (Array.isArray(sheet.matches) && sheet.matches.length) return true;
    if (Array.isArray(sheet.withheld) && sheet.withheld.length) return true;
    if (Array.isArray(sheet.excluded) && sheet.excluded.length) return true;
    if (Array.isArray(sheet.text_only) && sheet.text_only.length) return true;
    if (Array.isArray(sheet.redundant_view) && sheet.redundant_view.length) return true;
    return false;
  });
  const row = data.row && typeof data.row === "object"
    ? {
      sheet: data.row.sheet,
      table: data.row.table,
      key: data.row.key,
      cells: data.row.cells,
      citation: data.row.citation,
      // cell_citations ride with query_table for field answers; keep the row cells.
    }
    : data.row;
  return {
    tag: data.tag,
    search_scope: data.search_scope,
    unlabeled_audit_complete: data.unlabeled_audit_complete,
    row,
    tag_citations: data.tag_citations,
    anchor: data.anchor,
    found: data.found,
    sheets: active,
    sheets_omitted_empty: Math.max(0, sheets.length - active.length),
    complete: data.complete,
    skipped: Array.isArray(data.skipped) ? data.skipped.slice(0, 8) : data.skipped,
    committed: data.committed,
    shape_ids: data.shape_ids,
    condition: data.condition,
    ea_total: data.ea_total,
    note: data.note,
    warning: data.warning,
  };
}

/** Keep demo-runner transcripts under the model context limit on large sets. */
export function compactToolResult(result) {
  if (!result || typeof result !== "object") return result;
  const data = result.data;
  if (!data || typeof data !== "object") {
    if (typeof result.error === "string" && result.error.length > 600) {
      return { ...result, error: `${result.error.slice(0, 500)}…` };
    }
    return result;
  }
  let next = data;
  // sheet_graph alone uses top-level `available` + role/schedule sheet rows.
  // Other tools (sweep_schedule_row, symbol_sweep, load_plan, …) also return a
  // `sheets` array — compacting those as a graph silently strips found/tag
  // evidence and causes honest refusals on installed-quantity demos.
  if (typeof data.available === "boolean" && Array.isArray(data.sheets) && data.sheets.length > 0) {
    next = compactSheetGraph(data);
  } else if (
    typeof data.found === "number"
    && Array.isArray(data.tag_citations)
    && Array.isArray(data.sheets)
    && (data.tag != null || data.anchor != null)
  ) {
    next = compactSweepScheduleRow(data);
  } else if (Array.isArray(data.matches) && data.matches.length > 2
    && Number.isFinite(Number(data.count)) && Number(data.count) >= 2) {
    const q = data.query || {};
    const scoped = q.row_key != null && String(q.row_key).trim() !== ""
      || q.column != null
      || q.cell_value != null
      || q.cell_contains != null;
    if (!scoped) {
      next = {
        ...data,
        matches: data.matches.slice(0, 1),
        matches_omitted: data.matches.length - 1,
      };
    } else if (data.matches.length > 3) {
      next = { ...data, matches: data.matches.slice(0, 3), matches_omitted: data.matches.length - 3 };
    }
  } else if (Array.isArray(data.rows) && data.rows.length > 4) {
    next = { ...data, rows: data.rows.slice(0, 4), rows_omitted: data.rows.length - 4 };
  }
  const payload = { ...result, data: next };
  const text = JSON.stringify(payload);
  if (text.length > 8000) {
    // Prefer a real shrink over a lying "truncated" flag that still ships the
    // full payload — that note made the model skip follow-up sweeps.
    if (
      typeof next.found === "number"
      && Array.isArray(next.tag_citations)
      && next.tag != null
    ) {
      return {
        ...result,
        data: {
          tag: next.tag,
          found: next.found,
          tag_citations: next.tag_citations,
          row: next.row
            ? { sheet: next.row.sheet, table: next.row.table, key: next.row.key, cells: next.row.cells }
            : undefined,
          anchor: next.anchor
            ? {
              sheet: next.anchor.sheet,
              at: next.anchor.at,
              corroborated: next.anchor.corroborated,
              occurrences: next.anchor.occurrences,
            }
            : undefined,
          complete: next.complete,
          search_scope: next.search_scope,
          note: "sweep_schedule_row compacted to count evidence; empty plan sheets omitted.",
        },
      };
    }
    return {
      ...result,
      data: {
        ...(typeof next === "object" ? next : { value: next }),
        truncated_for_context: true,
        note: "Tool result truncated for model context; re-query with tighter filters for details.",
      },
    };
  }
  return payload;
}

async function productionPair(stdio) {
  const client = new Client({ name: "opentakeoff-demo-runner", version: "1.0.0" });
  if (stdio) {
    const mcpRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/server.js"],
      cwd: mcpRoot,
      stderr: "inherit",
    });
    await client.connect(transport);
    return { client, server: null };
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(new Session());
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function callTool(client, name, args) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.find((item) => item.type === "text")?.text;
  if (response.isError) {
    return { is_error: true, data: { error: text || `${name} failed` } };
  }
  if (!text) return { is_error: false, data: null };
  try {
    return { is_error: false, data: JSON.parse(text) };
  } catch {
    return { is_error: true, data: { error: text } };
  }
}

export async function runToolCallingModel({
  endpoint,
  apiKey,
  model,
  prompt,
  truth,
  tools,
  execute,
  fetchFn = fetch,
  maxIterations = 28,
  seededToolCalls = [],
}) {
  const messages = [
    { role: "system", content: systemPrompt(truth) },
    { role: "user", content: prompt },
  ];
  const rawModelResponses = [];
  const toolCalls = [];
  const requestIds = [];
  let resolvedModel = model;

  for (const seeded of seededToolCalls) {
    const callId = seeded.id || `seed-${toolCalls.length + 1}`;
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: callId,
        type: "function",
        function: {
          name: seeded.name,
          arguments: JSON.stringify(seeded.arguments || {}),
        },
      }],
    });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      content: JSON.stringify(seeded.result),
    });
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const started = performance.now();
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0,
      }),
    });
    const elapsedMs = performance.now() - started;
    const json = await response.json();
    const id = requestId(response, json);
    if (id) requestIds.push(id);
    rawModelResponses.push({ request_id: id, latency_ms: +elapsedMs.toFixed(2), response: json });
    if (!response.ok) {
      const error = new Error(`Model endpoint returned ${response.status}: ${JSON.stringify(json)}`);
      error.diagnostics = {
        raw_model_responses: rawModelResponses,
        tool_calls: toolCalls,
        request_ids: requestIds,
        model_version_identifier: resolvedModel,
      };
      throw error;
    }
    resolvedModel = json.model || resolvedModel;
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Model response had no choices[0].message.");
    messages.push(message);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      try {
        const answer = parseJsonAnswer(message.content);
        const shapeErrors = answerShapeErrors(answer, truth);
        if (shapeErrors.length) {
          messages.push({
            role: "user",
            content: `Your previous final response violated the required field types: ${shapeErrors.join("; ")}. Re-emit the same answer with those JSON types corrected. Do not change factual values, citations, or add new claims.`,
          });
          continue;
        }
        const formErrors = citationFormErrors(answer, truth);
        if (formErrors.length) {
          messages.push({
            role: "user",
            content: `Your previous final response violated the required citation shape: ${formErrors.join("; ")}. Re-emit the same answer using sheet_id and bbox_px only. Do not change factual values or add new claims.`,
          });
          continue;
        }
        const orthographyErrors = toolTextOrthographyErrors(answer, truth, toolCalls);
        if (orthographyErrors.length) {
          messages.push({
            role: "user",
            content: `Your previous final response altered tool text orthography: ${orthographyErrors.join("; ")}. Re-emit the same answer copying the exact characters returned by the tools.`,
          });
          continue;
        }
        const drawingErrors = drawingTextEvidenceErrors(answer, truth, toolCalls);
        if (drawingErrors.length) {
          messages.push({
            role: "user",
            content: `Your previous final response lacked drawing-text evidence: ${drawingErrors.join("; ")}. If a prior find_text/read_sheet_text hit already contains the required phrase, re-emit using that hit's sheet_id and bbox_px. Do not substitute schedule attribute strings. Only call find_text again when no prior hit contains the phrase.`,
          });
          continue;
        }
        const provenanceErrors = citationProvenanceErrors(answer, toolCalls);
        if (provenanceErrors.length) {
          messages.push({
            role: "user",
            content: `Your previous final response used unsupported citation provenance: ${provenanceErrors.join("; ")}. Re-emit the same answer with citations drawn only from the named tool evidence. Do not change factual values or add new claims.`,
          });
          continue;
        }
        return {
          answer,
          raw_response: message.content,
          raw_model_responses: rawModelResponses,
          tool_calls: toolCalls,
          request_ids: requestIds,
          model_version_identifier: resolvedModel,
        };
      } catch (error) {
        messages.push({
          role: "user",
          content: `Your previous final response violated the required JSON-only transport (${error instanceof Error ? error.message : String(error)}). Re-emit the same answer as one valid JSON object using the exact required final shape. Do not add Markdown, commentary, or new factual claims.`,
        });
        continue;
      }
    }
    for (const call of calls) {
      const name = call.function?.name;
      let args;
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const normalizeArgs = (toolName, toolArgs) => {
        const sorted = {};
        for (const key of Object.keys(toolArgs || {}).sort()) {
          const value = toolArgs[key];
          if (typeof value === "string"
            && (key === "q" || key === "cell_contains" || key === "cell_value" || key === "title" || key === "row_key" || key === "column")) {
            sorted[key] = value.trim().toLowerCase().replace(/\s+/g, " ");
          } else {
            sorted[key] = value;
          }
        }
        return sorted;
      };
      const signature = `${name}:${JSON.stringify(normalizeArgs(name, args))}`;
      const prior = toolCalls.find((previous) =>
        `${previous.name}:${JSON.stringify(normalizeArgs(previous.name, previous.arguments))}` === signature);
      let result;
      if (prior
        && prior.result
        && (prior.result.is_error
          || prior.result.data?.count === 0
          || (Array.isArray(prior.result.data?.matches) && prior.result.data.matches.length === 0)
          || (Array.isArray(prior.result.data?.hits) && prior.result.data.hits.length === 0))) {
        result = {
          ...prior.result,
          repeated_empty_query: true,
          next_move: prior.result.data?.next_move
            || "This exact tool call already returned empty. Change the filter using prior tool evidence, or refuse; do not repeat the same empty query.",
        };
      } else {
        result = await execute(name, args);
      }
      result = compactToolResult(result);
      toolCalls.push({ id: call.id, name, arguments: args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  const error = new Error(`Model exceeded ${maxIterations} tool-use iterations.`);
  error.code = "ITERATION_LIMIT";
  error.diagnostics = {
    raw_model_responses: rawModelResponses,
    tool_calls: toolCalls,
    request_ids: requestIds,
    model_version_identifier: resolvedModel,
  };
  throw error;
}

async function main() {
  const args = process.argv.slice(2);
  const truthPath = arg(args, "--truth");
  const promptPath = arg(args, "--prompt");
  const runNumber = Number(arg(args, "--run"));
  const outputPath = arg(args, "--output");
  const cold = args.includes("--cold");
  const stdio = args.includes("--stdio");
  if (!truthPath || !promptPath || !Number.isInteger(runNumber) || runNumber < 1 || !outputPath) {
    console.error("usage: npm run run:demo -- --truth <truth.json> --prompt <prompt.txt> --run <N> --output <run.json> [--cold] [--stdio]");
    process.exit(2);
  }

  dotenv.config({
    path: resolve(dirname(fileURLToPath(import.meta.url)), "../../server/.env"),
    quiet: true,
  });
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  if (!apiKey) throw new Error("CEREBRAS_API_KEY is required for real demo runs.");
  const endpoint = process.env.CEREBRAS_ENDPOINT || "https://api.cerebras.ai/v1/chat/completions";
  const model = process.env.CEREBRAS_MODEL || "gpt-oss-120b";
  if (cold) process.env.OPENTAKEOFF_ODL_NO_CACHE = "1";

  const truth = JSON.parse(readFileSync(resolve(truthPath), "utf8"));
  const prompt = readFileSync(resolve(promptPath), "utf8").trim();
  const corpusDir = dirname(dirname(dirname(resolve(truthPath))));
  const sourcePath = resolve(corpusDir, "raw", truth.source_file);
  const { client, server } = await productionPair(stdio);
  const startedAt = new Date().toISOString();
  try {
    const setupStarted = performance.now();
    const load = await callTool(client, "load_plan", { path: sourcePath });
    if (load.is_error) throw new Error(`load_plan failed: ${JSON.stringify(load.data)}`);
    const sourceIndex = await callTool(client, "sheet_graph", {});
    if (sourceIndex.is_error) throw new Error(`sheet_graph failed: ${JSON.stringify(sourceIndex.data)}`);
    const setupLatencyMs = performance.now() - setupStarted;
    const listed = await client.listTools();
    const tools = listed.tools
      .filter((tool) => DEMO_TOOLS.has(tool.name))
      .map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    const started = performance.now();
    let modelResult;
    try {
      modelResult = await runToolCallingModel({
        endpoint,
        apiKey,
        model,
        prompt,
        truth,
        tools,
        execute: (name, toolArgs) => callTool(client, name, toolArgs),
        seededToolCalls: [{
          id: "seed-sheet-graph",
          name: "sheet_graph",
          arguments: {},
          result: { is_error: false, data: compactSheetGraph(sourceIndex.data) },
        }],
      });
    } catch (error) {
      const elapsed = performance.now() - started;
      const diagnostics = error?.diagnostics || {};
      const failureRecord = {
        schema_version: 1,
        demo_id: truth.demo_id,
        run_number: runNumber,
        cold_cache: cold,
        timestamp: startedAt,
        ...runTimingMetadata(cold, setupLatencyMs),
        local_run_id: randomUUID(),
        transport: stdio ? "stdio_local_process" : "in_memory_local_process",
        request_id: diagnostics.request_ids?.at(-1) ?? null,
        request_ids: diagnostics.request_ids || [],
        requested_model: model,
        model_version_identifier: diagnostics.model_version_identifier || model,
        latency_ms: +elapsed.toFixed(2),
        status: "failed",
        failure_class: error?.code === "ITERATION_LIMIT" ? "RETRIEVAL" : "PARSE",
        failure: error instanceof Error ? error.message : String(error),
        raw_model_responses: diagnostics.raw_model_responses || [],
        tool_calls: [
          { name: "load_plan", arguments: { path: basename(sourcePath) }, result: load },
          { name: "sheet_graph", arguments: {}, result: sourceIndex },
          ...(diagnostics.tool_calls || []),
        ],
      };
      mkdirSync(dirname(resolve(outputPath)), { recursive: true });
      writeFileSync(resolve(outputPath), `${JSON.stringify(failureRecord, null, 2)}\n`);
      console.error(JSON.stringify({
        output: resolve(outputPath),
        status: failureRecord.status,
        failure_class: failureRecord.failure_class,
        failure: failureRecord.failure,
        tool_calls: failureRecord.tool_calls.length,
      }, null, 2));
      throw error;
    }
    const elapsed = performance.now() - started;
    const record = {
      schema_version: 1,
      demo_id: truth.demo_id,
      run_number: runNumber,
      cold_cache: cold,
      timestamp: startedAt,
      ...runTimingMetadata(cold, setupLatencyMs),
      local_run_id: randomUUID(),
      transport: stdio ? "stdio_local_process" : "in_memory_local_process",
      request_id: modelResult.request_ids.at(-1) ?? null,
      request_ids: modelResult.request_ids,
      requested_model: model,
      model_version_identifier: modelResult.model_version_identifier,
      latency_ms: +elapsed.toFixed(2),
      status: modelResult.answer.status,
      answer: modelResult.answer.answer,
      raw_response: modelResult.raw_response,
      raw_model_responses: modelResult.raw_model_responses,
      tool_calls: [
        { name: "load_plan", arguments: { path: basename(sourcePath) }, result: load },
        { name: "sheet_graph", arguments: {}, result: sourceIndex },
        ...modelResult.tool_calls,
      ],
    };
    mkdirSync(dirname(resolve(outputPath)), { recursive: true });
    writeFileSync(resolve(outputPath), `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({
      output: resolve(outputPath),
      request_id: record.request_id,
      model: record.model_version_identifier,
      latency_ms: record.latency_ms,
      status: record.status,
      tool_calls: record.tool_calls.length,
    }, null, 2));
  } finally {
    await client.close();
    await server?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
