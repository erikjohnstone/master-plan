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

export const MAX_AGENT_ITERATIONS = 24;

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
    "",
    "Working method: list_sheets first. Read the finish schedule (read_schedule) or the sheet text (read_sheet_text) to ground WHAT to take off; use view_region to look at scanned or ambiguous areas. Match or create conditions, measure rooms with one_click, then stage propose_shapes with evidence. Then summarize what you proposed and what you could not do, and stop. If you are blocked (no scale, sheet not open, nothing matches), say so plainly and stop rather than guessing.",
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
  // Deterministic honesty backstop for trace_connectivity (real, live-observed
  // failure: a vision-capable model narrating a view_region image sometimes
  // names a connection/tag its own tools never confirmed, even when the
  // system prompt explicitly forbids it — prompting alone did not reliably
  // hold this pattern out, confirmed by direct live re-testing before this
  // was added). Tracked deterministically in code, not left to the model's
  // own wording: if every trace_connectivity call this run returned
  // dead_end/refused (never a real "reached"), the final answer gets an
  // appended, code-generated fact the model cannot omit or soften.
  let connectivityCalls = 0;
  let connectivityEverReached = false;

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
    if (!turn.toolCalls.length && connectivityCalls > 0 && !connectivityEverReached) {
      const note = "\n\n[Automated check: every trace_connectivity call in this run returned dead_end or refused — no connection was confirmed by any tool. Any equipment, register, or tag name mentioned above beyond that fact is an unverified visual guess, not a tool-confirmed result.]";
      displayText = (displayText || "") + note;
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
      if (call.name === "trace_connectivity" && !call.argsError) {
        connectivityCalls++;
        // A "reached" whose target sits right where the seed started is the
        // seed trivially re-finding the equipment it was seeded AT, not a
        // real connection to something else — real, observed live: the
        // model routinely seeds from_norm at the equipment's own position,
        // which the tracer trivially "reaches" in 0-2 hops. Only a
        // meaningfully distant reach (not the seed's own starting point)
        // counts as a genuine connection for the honesty backstop below.
        const fromN = Array.isArray(call.args?.from_norm) ? call.args.from_norm : null;
        const reachedAt = out?.reached_equipment?.at;
        const trivialSelfReach = fromN && Array.isArray(reachedAt)
          && Math.hypot(reachedAt[0] - fromN[0], reachedAt[1] - fromN[1]) < 0.02;
        if (out && out.status === "reached" && !trivialSelfReach) connectivityEverReached = true;
      }
      emit({ type: "tool_end", name: call.name, result: out });
      results.push({ call, out });
    }
    appendToolResults(provider, messages, results);
  }
  emit({ type: "max_iterations", limit: maxIterations });
  return { status: "max_iterations", iterations };
}
