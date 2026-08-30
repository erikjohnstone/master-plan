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

export const MAX_AGENT_ITERATIONS = 24;

export function requiredEvidenceCorrection(callLog, goal, finalText = "") {
  const successfulCount = callLog.some(({ name, out }) =>
    (name === "sweep_schedule_row" && Number.isFinite(out?.found))
    || (name === "count_marks" && !out?.error));
  if (/\b(?:installed\s+quantity|quantity|take\s*off|count)\b/i.test(goal) && !successfulCount) {
    return "The goal asks for installed quantity, but no successful sweep_schedule_row or count_marks call exists in this run. Do not infer quantity from schedule-row count. Call the appropriate counting tool, then answer from its result or refuse.";
  }
  if (/\binstalled\s+quantity\b/i.test(goal) && successfulCount && finalText
    && !/\binstalled\s+quantity\b.{0,30}\b\d+(?:\.\d+)?\b/i.test(finalText)) {
    return "The goal asks for installed quantity and a deterministic count succeeded, but the final answer does not explicitly state the numeric installed quantity. Report it under an “Installed quantity” label and attribute it to the sweep/count result.";
  }
  if (/\binstalled\s+quantity\b/i.test(finalText)
    && /\b(?:single|one)\s+schedule\s+(?:entry|row)\b|\b(?:schedule\s+|the\s+)?row\s+appears\s+(?:only\s+)?(?:once|one time)\b/i.test(finalText)) {
    return "The final answer describes installed quantity as a single/one schedule entry. That reasoning is invalid even when the numeric value happens to match. Attribute installed quantity only to the successful sweep/count result and remove schedule-row-count wording.";
  }
  if (/\bnormalized\s+(?:rectangle|coordinates?|bbox|bounding box)\b/i.test(finalText)) {
    return "The final answer exposes normalized citation coordinates. Production evidence citations use image-pixel bboxes only. Remove normalized coordinates and report the unchanged sheet and bbox_px returned by the evidence tool.";
  }
  if (/\bexample\b/i.test(finalText)) {
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
  const locationClaims = finalText.split(/[\n.!?]+/)
    .filter((fragment) => /\bboth tags\b|\bplan location\b|\blocated on (?:the )?plan\b/i.test(fragment));
  const claimedUnswept = unswept.filter((tag) => {
    const tagCanonical = tag.replace(/[^A-Z0-9]/g, "");
    return locationClaims.some((fragment) =>
      fragment.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(tagCanonical));
  });
  if (claimedUnswept.length) {
    return `The final answer claims a plan location for unswept tag(s): ${claimedUnswept.join(", ")}. A schedule query proves schedule data only. Remove those plan-location claims or call sweep_schedule_row for each exact tag.`;
  }
  if (/\bshow\b.*\bplan location\b|\bshow me the plan\b/i.test(goal)) {
    const highlights = callLog.filter(({ name, out }) =>
      name === "highlight_citation" && !out?.error && Array.isArray(out.bbox_px));
    const missingPlanTags = [];
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
    }
    if (missingPlanTags.length) {
      return `The requested plan location is not painted from the exact sweep tag citation for: ${missingPlanTags.join(", ")}. Call highlight_citation with an unchanged sweep_schedule_row.tag_citations sheet and bbox, and label it with that exact tag. Do not use the broader anchor rect or label one tag as another.`;
    }
  }
  for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
    for (const match of out?.matches || []) {
      const identity = match?.row?.identity;
      if (!identity?.header || !identity?.text) continue;
      const tagCanonical = String(identity.text).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const headerCanonical = String(identity.header).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (finalCanonical.includes(tagCanonical) && !finalCanonical.includes(headerCanonical)) {
        return `The final answer mentions ${identity.text} but does not cite its semantic identity header ${identity.header}. Use query_table row.identity exactly; do not substitute another repeated-value column.`;
      }
    }
  }
  if (/\bshow\b.*\bcite\b|\bcite the exact\b/i.test(goal)
    && !callLog.some(({ name, out }) => name === "highlight_citation" && !out?.error)) {
    return "The goal asks to show exact cited source locations, but no successful highlight_citation call exists. Highlight the returned plan tag and schedule-cell bboxes on their real sheets before answering.";
  }
  if (/\bcite the exact\b/i.test(goal)) {
    const highlights = callLog.filter(({ name, out }) =>
      name === "highlight_citation" && !out?.error && Array.isArray(out.bbox_px))
      .map(({ out }) => ({ sheet: out.sheet, bbox: out.bbox_px }));
    const uncovered = [];
    for (const { out } of callLog.filter(({ name }) => name === "query_table")) {
      for (const match of out?.matches || []) {
        const rowKey = String(match?.row?.key || "");
        if (!rowKey || !finalCanonical.includes(rowKey.toUpperCase().replace(/[^A-Z0-9]/g, ""))) continue;
        const cells = Object.values(match?.row?.all_cells || match?.row?.cells || {});
        const covered = cells.some((cell) => Array.isArray(cell?.bbox)
          && highlights.some((highlight) => highlight.sheet === match.sheet
            && highlight.bbox.every((value, index) => Math.abs(value - cell.bbox[index]) <= 1)));
        if (!covered) uncovered.push(`${rowKey} on ${match.sheet}`);
      }
    }
    if (uncovered.length) {
      return `The answer uses queried schedule row(s) with no painted source cell: ${[...new Set(uncovered)].join(", ")}. Call highlight_citation on at least one exact cited cell from each row before finishing.`;
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
    "- Production MCP bboxes are image pixels, not normalized coordinates. Never label them normalized. Use highlight_citation with the unchanged sheet and bbox_px whenever the estimator asks to show or cite exact source locations.",
    "- Never say a cell or field was highlighted unless a successful highlight_citation call targeted that exact sheet and bbox_px. State exactly which source regions were highlighted; do not imply unpainted cells were painted.",
    "- For a scheduled device tag, cite query_table row.identity (for example VALVE MARK), not the first different column that happens to repeat the same text (for example UNIT MARK).",
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
 *   fetchFn?: typeof fetch,
 * }} opts
 * @returns {Promise<{ status: "done" | "aborted" | "error" | "max_iterations", text?: string, message?: string, iterations: number }>}
 */
export async function runAgentLoop({ cfg, goal, tools, execute, onEvent, signal, maxIterations = MAX_AGENT_ITERATIONS, fetchFn }) {
  const provider = cfg?.provider === "anthropic" ? "anthropic" : "openai";
  const emit = (ev) => { try { onEvent?.(ev); } catch { /* a status listener must never kill the run */ } };
  const providerTools = toProviderTools(provider, tools);
  const system = agentSystemPrompt();
  const messages = [{ role: "user", content: goal }];
  let iterations = 0;
  const aborted = () => { emit({ type: "aborted" }); return { status: /** @type {const} */ ("aborted"), iterations }; };
  // Deterministic honesty backstop, generalized (see agentVerifiers.js's own
  // header for the real, live-observed history this comes from): every real
  // tool call this run makes is logged here, across every loop iteration,
  // so `runVerifiers` can check the WHOLE run's evidence — not just prompt
  // rules the model can choose to ignore — before the final answer is shown.
  /** @type {Array<{ id: string, name: string, args: unknown, out: unknown }>} */
  const callLog = [];

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
      const correction = requiredEvidenceCorrection(callLog, goal, turn.text);
      if (correction) {
        messages.push(provider === "anthropic" ? { role: "assistant", content: turn.raw.content } : turn.raw);
        messages.push({
          role: "user",
          content: `${correction}\n\nReturn a complete replacement answer that satisfies every part of the original goal. Preserve every previously retrieved, tool-grounded requested field; do not answer only the latest correction.`,
        });
        emit({ type: "text", text: `[Evidence gate: ${correction}]` });
        continue;
      }
      const notes = runVerifiers(callLog, goal);
      if (notes.length) displayText = `${displayText || ""}\n\n${notes.join("\n\n")}`;
    }
    if (displayText) emit({ type: "text", text: displayText });
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
  return { status: "max_iterations", iterations };
}
