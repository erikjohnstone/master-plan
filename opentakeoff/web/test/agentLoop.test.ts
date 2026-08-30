// Agent loop (lib/agentLoop.js) against a MOCK provider — a fake fetch scripts
// the model's turns, so these exercise the real wire building both ways:
//   - a scripted tool_use sequence executes tools and returns results in the
//     NEXT request (tool_result pairing, one user message, image blocks);
//   - abort mid-loop → {status:"aborted"}, no further requests;
//   - the iteration cap stops a model that never finishes;
//   - malformed model output → {status:"error"} + an error event, never a throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, parseAssistantTurn, toProviderTools, agentSystemPrompt, MAX_AGENT_ITERATIONS, requiredEvidenceCorrection } from "../src/lib/agentLoop.js";

const CFG_A = { endpoint: "http://localhost:9999", apiKey: "k", model: "mock", provider: "anthropic" };
const CFG_O = { ...CFG_A, provider: "openai" };

const TOOLS = [
  { name: "probe", description: "probe something", input_schema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
  { name: "look", description: "look at something", input_schema: { type: "object", properties: {}, required: [] } },
];

const resp = (json: unknown, status = 200) => ({ ok: status < 400, status, json: async () => json });

/** A fetch stub replaying scripted bodies and recording every request body. */
function scriptedFetch(replies: unknown[]) {
  const requests: any[] = [];
  const fn = async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body));
    if (!replies.length) throw new Error("script exhausted");
    return resp(replies.shift());
  };
  return { fn, requests };
}

const anthropicTurn = (id: string, name: string, input: unknown, text = "") => ({
  content: [...(text ? [{ type: "text", text }] : []), { type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
});
const anthropicDone = (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

test("installed quantity cannot finish without deterministic count evidence", () => {
  assert.match(requiredEvidenceCorrection([], "Give me the installed quantity for CH-A1")!, /no successful sweep_schedule_row/);
  assert.equal(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 1 },
  }], "Give me the installed quantity for CH-A1"), null);
  assert.equal(requiredEvidenceCorrection([], "Give me CH-A1 capacity"), null);
  assert.match(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 1 },
  }], "Give me installed quantity", "Installed quantity: 1 (single schedule entry).")!, /reasoning is invalid/);
  assert.match(requiredEvidenceCorrection([], "Give me valve size", "Valve size: 4 in (example size).")!, /example or placeholder/);
  assert.match(requiredEvidenceCorrection([], "Give me the matching control valve", "The matching control valve is 4 in.")!, /no query_table result/);
  assert.equal(requiredEvidenceCorrection([], "Give me the matching control valve", "No matching control valve row was found."), null);
  assert.equal(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ title: { text: "CHW CONTROL VALVE SCHEDULE" } }] },
  }], "Give me the matching control valve", "The matching control valve is cited."), null);
  assert.match(requiredEvidenceCorrection([
    { name: "sweep_schedule_row", args: { tag: "CH-A1" }, out: { found: 1 } },
    { name: "query_table", out: { matches: [{ row: { key: "CV-CH-A1" } }] } },
  ], "Find CH-A1", "Both tags share this plan location: CH-A1 and CV-CH-A1.")!, /unswept tag/);
  assert.match(requiredEvidenceCorrection([
    { name: "sweep_schedule_row", args: { tag: "CH-A1" }, out: { found: 1 } },
    { name: "query_table", out: { matches: [{ row: { key: "CV-CH-A1" } }] } },
  ], "Find CH-A1", "Plan location for CV‑CH‑A1 is the same." )!, /unswept tag/);
  assert.equal(requiredEvidenceCorrection([
    { name: "sweep_schedule_row", args: { tag: "CH-A1" }, out: { found: 1 } },
    { name: "query_table", out: { matches: [{ row: { key: "CV-CH-A1" } }] } },
  ], "Find CH-A1", "Plan location: CH-A1 is on sheet 3.\nValve schedule: CV-CH-A1 is 4 in."), null);
  const sweptPlan = {
    name: "sweep_schedule_row",
    args: { tag: "CH-A1" },
    out: {
      found: 1,
      tag_citations: [{
        sheet: "set.pdf#3",
        bbox: { x0: 10, y0: 20, x1: 30, y1: 40 },
      }],
    },
  };
  assert.match(requiredEvidenceCorrection([
    sweptPlan,
    {
      name: "highlight_citation",
      args: { text: "Valve CV-CH-A1" },
      out: { sheet: "set.pdf#3", bbox_px: [5, 15, 35, 45], text: "Valve CV-CH-A1" },
    },
  ], "Show me the plan location for CH-A1", "CH-A1 is shown.")!, /exact sweep tag citation/);
  assert.equal(requiredEvidenceCorrection([
    sweptPlan,
    {
      name: "highlight_citation",
      args: { text: "CH-A1" },
      out: { sheet: "set.pdf#3", bbox_px: [10, 20, 30, 40], text: "CH-A1" },
    },
  ], "Show me the plan location for CH-A1", "CH-A1 is shown."), null);
  assert.match(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ row: { identity: { header: "VALVE MARK", text: "CV-CH-A1" } } }] },
  }], "Find the valve", "CV‑CH‑A1 comes from UNIT MARK.")!, /semantic identity header VALVE MARK/);
  assert.equal(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ row: { identity: { header: "VALVE MARK", text: "CV-CH-A1" } } }] },
  }], "Find the valve", "CV‑CH‑A1 comes from VALVE MARK."), null);
  assert.match(requiredEvidenceCorrection([], "Show me the plan and cite the exact cells")!, /highlight_citation/);
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#3", bbox_px: [1, 2, 3, 4] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: { key: "CV-CH-A1", all_cells: { CV: { bbox: [10, 20, 30, 40] } } },
    }] } },
  ], "Cite the exact schedule cells", "CV-CH-A1 is 324.")!, /no painted source cell/);
});

test("anthropic-style: scripted tool_use → tools execute → results pair up in ONE user message → done", async () => {
  const { fn, requests } = scriptedFetch([
    { // two parallel tool calls in one turn
      content: [
        { type: "text", text: "Working." },
        { type: "tool_use", id: "toolu_1", name: "probe", input: { q: "rooms" } },
        { type: "tool_use", id: "toolu_2", name: "look", input: {} },
      ],
      stop_reason: "tool_use",
    },
    // the vision-routing seam's own isolated call for "look"'s image (real,
    // later addition — see ai.js's own aiConfig()/describeImageForAgent
    // comments): a SEPARATE request, in between the two main loop turns,
    // never the raw image reaching the model driving the loop.
    { content: [{ type: "text", text: "A duct riser with a tagged register nearby." }], stop_reason: "end_turn" },
    anthropicDone("All staged."),
  ]);
  const executed: Array<[string, unknown]> = [];
  const events: any[] = [];
  const res = await runAgentLoop({
    cfg: CFG_A, goal: "take off the carpet", tools: TOOLS,
    execute: (name, args) => {
      executed.push([name, args]);
      return name === "look"
        ? { image_data_url: "data:image/png;base64,QUJD", width: 10, height: 10 }
        : { found: 2 };
    },
    onEvent: (ev) => events.push(ev),
    fetchFn: fn as any,
  });
  assert.equal(res.status, "done");
  assert.equal(res.text, "All staged.");
  assert.deepEqual(executed, [["probe", { q: "rooms" }], ["look", {}]]);
  // request 1: system contract + the goal + provider-shaped tools
  assert.equal(requests[0].system, agentSystemPrompt());
  assert.deepEqual(requests[0].messages, [{ role: "user", content: "take off the carpet" }]);
  assert.deepEqual(requests[0].tools.map((t: any) => t.name), ["probe", "look"]);
  // request 2 is the ISOLATED vision call (no tools, no system contract,
  // no shared conversation history) — the model driving the loop never
  // sees this request at all.
  assert.equal(requests[1].tools, undefined);
  // request 3 (the loop's own next turn): assistant echo + BOTH results in
  // one user message, ids paired — "look"'s own result now carries the
  // vision model's own literal TEXT description, never the raw image.
  const msgs = requests[2].messages;
  assert.equal(msgs.length, 3);
  assert.equal(msgs[1].role, "assistant");
  const results = msgs[2].content;
  assert.equal(msgs[2].role, "user");
  assert.deepEqual(results.map((r: any) => r.tool_use_id), ["toolu_1", "toolu_2"]);
  assert.match(results[0].content[0].text, /"found":2/);
  // the image result is NEVER an image block anymore — it's the vision
  // model's own described text, and the raw base64 never reaches this turn
  assert.equal(results[1].content.length, 1);
  assert.equal(results[1].content[0].type, "text");
  assert.match(results[1].content[0].text, /A duct riser with a tagged register nearby\./);
  assert.ok(!JSON.stringify(results[1].content).includes("QUJD"), "the raw base64 image data must never reach the loop's own conversation");
  // streaming status: text → tool_start/tool_end ×2 → final text → done
  // (the isolated vision call for "look" happens INSIDE that tool's own
  // tool_start/tool_end pair — it emits no separate event of its own on
  // the success path, only on the disclosed-degradation path)
  assert.deepEqual(events.map((e) => e.type), ["text", "tool_start", "tool_end", "tool_start", "tool_end", "text", "done"]);
});

test("vision routing degrades honestly, with a disclosed event, when the isolated vision call itself fails — never silently", async () => {
  const requests: any[] = [];
  let call = 0;
  const fn = async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body));
    call++;
    if (call === 1) return resp({ content: [{ type: "tool_use", id: "toolu_1", name: "look", input: {} }], stop_reason: "tool_use" });
    if (call === 2) return { ok: false, status: 500, json: async () => ({}) }; // the isolated vision call itself fails
    return resp(anthropicDone("Done despite the degraded look."));
  };
  const events: any[] = [];
  const res = await runAgentLoop({
    cfg: CFG_A, goal: "look at it", tools: TOOLS,
    execute: () => ({ image_data_url: "data:image/png;base64,QUJD", width: 10, height: 10 }),
    onEvent: (ev) => events.push(ev),
    fetchFn: fn as any,
  });
  assert.equal(res.status, "done");
  // the raw image still reaches the model's next turn — a real, working
  // fallback, not a lost capability — but disclosed via a real text event,
  // never silently
  const degradeEvents = events.filter((e) => e.type === "text" && /Vision routing degraded/.test(e.text || ""));
  assert.equal(degradeEvents.length, 1);
  const msgs = requests[2].messages;
  const results = msgs[msgs.length - 1].content;
  assert.equal(results[0].content[0].type, "image", "the OLD raw-image path is the real fallback, not a dropped tool result");
});

test("openai-style: function calling round-trip with role:tool results", async () => {
  const { fn, requests } = scriptedFetch([
    { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "probe", arguments: '{"q":"schedule"}' } }] } }] },
    { choices: [{ message: { role: "assistant", content: "done" } }] },
  ]);
  const executed: Array<[string, unknown]> = [];
  const res = await runAgentLoop({
    cfg: CFG_O, goal: "go", tools: TOOLS,
    execute: (name, args) => { executed.push([name, args]); return { ok: 1 }; },
    fetchFn: fn as any,
  });
  assert.equal(res.status, "done");
  assert.deepEqual(executed, [["probe", { q: "schedule" }]]);
  // system prompt rides as messages[0] on this wire; tools are function-shaped
  assert.equal(requests[0].messages[0].role, "system");
  assert.equal(requests[0].tools[0].type, "function");
  assert.equal(requests[0].tools[0].function.name, "probe");
  const msgs = requests[1].messages;
  const toolMsg = msgs.find((m: any) => m.role === "tool");
  assert.equal(toolMsg.tool_call_id, "call_1");
  assert.match(toolMsg.content, /"ok":1/);
});

test("openai-style: unparseable function arguments become an error result, not a crash", async () => {
  const { fn, requests } = scriptedFetch([
    { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "probe", arguments: "{not json" } }] } }] },
    { choices: [{ message: { role: "assistant", content: "ok" } }] },
  ]);
  let executed = 0;
  const res = await runAgentLoop({ cfg: CFG_O, goal: "go", tools: TOOLS, execute: () => { executed++; return {}; }, fetchFn: fn as any });
  assert.equal(res.status, "done");
  assert.equal(executed, 0);   // the tool itself never ran on bad args
  const toolMsg = requests[1].messages.find((m: any) => m.role === "tool");
  assert.match(toolMsg.content, /not valid JSON/);
});

test("abort mid-loop: no further requests, {status:aborted}", async () => {
  const ctl = new AbortController();
  const { fn, requests } = scriptedFetch([
    anthropicTurn("toolu_1", "probe", { q: "x" }),
    anthropicDone("never reached"),
  ]);
  const events: any[] = [];
  const res = await runAgentLoop({
    cfg: CFG_A, goal: "go", tools: TOOLS,
    execute: () => { ctl.abort(); return { late: true }; },   // the user hits Stop while a tool runs
    onEvent: (ev) => events.push(ev),
    signal: ctl.signal,
    fetchFn: fn as any,
  });
  assert.equal(res.status, "aborted");
  assert.equal(requests.length, 1);                            // the second request never fired
  assert.equal(events.at(-1).type, "aborted");
});

test("max-iterations cap stops a model that never finishes", async () => {
  let calls = 0;
  const fn = async () => { calls++; return resp(anthropicTurn(`toolu_${calls}`, "look", {})); };
  const events: any[] = [];
  const res = await runAgentLoop({
    cfg: CFG_A, goal: "go", tools: TOOLS,
    execute: () => ({}), onEvent: (ev) => events.push(ev),
    maxIterations: 3, fetchFn: fn as any,
  });
  assert.equal(res.status, "max_iterations");
  assert.equal(calls, 3);
  assert.equal(events.at(-1).type, "max_iterations");
  assert.ok(MAX_AGENT_ITERATIONS >= 8);   // the real cap leaves room for a full schedule→measure→propose run
});

test("malformed model output → error status + event, not a crash", async () => {
  for (const bad of [{ nonsense: true }, { content: "not-an-array" }, null]) {
    const { fn } = scriptedFetch([bad]);
    const events: any[] = [];
    const res = await runAgentLoop({ cfg: CFG_A, goal: "go", tools: TOOLS, execute: () => ({}), onEvent: (ev) => events.push(ev), fetchFn: fn as any });
    assert.equal(res.status, "error");
    assert.equal(events.at(-1).type, "error");
  }
});

test("transport failure (HTTP 500) → error status with a plain-language message", async () => {
  const fn = async () => resp({ oops: 1 }, 500);
  const res = await runAgentLoop({ cfg: CFG_A, goal: "go", tools: TOOLS, execute: () => ({}), fetchFn: fn as any });
  assert.equal(res.status, "error");
  assert.match(res.message!, /HTTP 500/);
});

test("a throwing execute is contained as a tool error result", async () => {
  const { fn, requests } = scriptedFetch([
    anthropicTurn("toolu_1", "probe", { q: "x" }),
    anthropicDone("recovered"),
  ]);
  const res = await runAgentLoop({
    cfg: CFG_A, goal: "go", tools: TOOLS,
    execute: () => { throw new Error("capability blew up"); },
    fetchFn: fn as any,
  });
  assert.equal(res.status, "done");
  const result = requests[1].messages[2].content[0];
  assert.equal(result.is_error, true);                          // contained AND flagged
  assert.match(result.content[0].text, /capability blew up/);   // the message reaches the model as a correctable turn
});

test("parseAssistantTurn + toProviderTools are honest about shapes", () => {
  assert.equal(parseAssistantTurn("anthropic", { content: [] }).ok, true);
  assert.equal(parseAssistantTurn("anthropic", { error: { message: "boom" } }).ok, false);
  assert.equal(parseAssistantTurn("openai", { choices: [] }).ok, false);
  const [a] = toProviderTools("anthropic", TOOLS);
  assert.deepEqual(Object.keys(a).sort(), ["description", "input_schema", "name"]);
  const [o] = toProviderTools("openai", TOOLS);
  assert.equal(o.type, "function");
});
