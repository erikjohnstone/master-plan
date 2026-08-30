// Agent loop (lib/agentLoop.js) against a MOCK provider — a fake fetch scripts
// the model's turns, so these exercise the real wire building both ways:
//   - a scripted tool_use sequence executes tools and returns results in the
//     NEXT request (tool_result pairing, one user message, image blocks);
//   - abort mid-loop → {status:"aborted"}, no further requests;
//   - the iteration cap stops a model that never finishes;
//   - malformed model output → {status:"error"} + an error event, never a throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, parseAssistantTurn, toProviderTools, agentSystemPrompt, MAX_AGENT_ITERATIONS, requiredEvidenceCorrection, toolsForGoal } from "../src/lib/agentLoop.js";

const CFG_A = { endpoint: "http://localhost:9999", apiKey: "k", model: "mock", provider: "anthropic" };
const CFG_O = { ...CFG_A, provider: "openai" };

const TOOLS = [
  { name: "probe", description: "probe something", input_schema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
  { name: "look", description: "look at something", input_schema: { type: "object", properties: {}, required: [] } },
];

test("exact equipment-to-valve evidence goals expose only relevant deterministic tools", () => {
  const tools: Array<{ name: string }> = [
    "list_sheets", "sheet_graph", "query_table", "sweep_schedule_row",
    "highlight_citation", "resolve_tag", "one_click", "find_text",
  ].map((name) => ({ name }));
  assert.deepEqual(
    toolsForGoal(
      "Give me installed quantity and the matching control valve; cite the exact schedule cells.",
      tools,
    ).map((tool: { name: string }) => tool.name),
    ["list_sheets", "sheet_graph", "query_table", "sweep_schedule_row", "highlight_citation"],
  );
  assert.equal(toolsForGoal("Trace AHU-1 connectivity", tools), tools);
});

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
  assert.match(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 1 },
  }], "Give me installed quantity", "Installed quantity: 1 (single row).")!, /reasoning is invalid/);
  assert.match(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 1 },
  }], "Give me installed quantity", "Installed quantity: 1 (the row appears only once).")!, /reasoning is invalid/);
  assert.match(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 1 },
  }], "Give me installed quantity", "Installed quantity: 1 (the schedule row for AHU-1 appears only once).")!, /reasoning is invalid/);
  assert.match(requiredEvidenceCorrection([], "Cite the source", "Normalized rectangle: [[0.1, 0.2], [0.3, 0.4]].")!, /image-pixel bboxes only/);
  assert.match(requiredEvidenceCorrection([], "Cite the source", "BBox [1, 2, 3, 4] (normalized ≈ [0.1, 0.2]).")!, /image-pixel bboxes only/);
  assert.match(requiredEvidenceCorrection([], "Give capacity", "Capacity is 56 tons (≈672 MBH).")!, /without labeling its derivation/);
  assert.equal(requiredEvidenceCorrection([], "Give capacity", "Capacity is 56 tons (calculated conversion: approximately 672 MBH)."), null);
  assert.match(requiredEvidenceCorrection([{
    name: "sweep_schedule_row",
    out: { found: 2 },
  }], "Give me the installed quantity", "Two units were found.")!, /does not explicitly state/);
  assert.match(requiredEvidenceCorrection([], "Give me valve size", "Valve size: 4 in (example size).")!, /example or placeholder/);
  assert.equal(requiredEvidenceCorrection([], "Give me valve size", "For example, AHU-1 is on sheet 42 with size from the schedule.")!, null);
  assert.match(requiredEvidenceCorrection([{
    name: "query_table",
    args: { cell_contains: "AHU-1" },
    out: { matches: [] },
  }, {
    name: "sweep_schedule_row",
    args: { tag: "AHU-1" },
    out: { found: 1 },
  }], "Give me the matching control valve", "The matching control valve is 4 in.")!, /no query_table result/);
  assert.match(requiredEvidenceCorrection([], "Give me the matching control valve", "No matching control valve row was found.")!, /Before refusing/);
  assert.equal(requiredEvidenceCorrection([{
    name: "query_table",
    args: { cell_contains: "AHU-1" },
    out: { matches: [] },
  }, {
    name: "sweep_schedule_row",
    args: { tag: "AHU-1" },
    out: { found: 1 },
  }], "Give me the matching control valve", "No matching control valve row was found."), null);
  assert.match(requiredEvidenceCorrection([
    {
      name: "sweep_schedule_row",
      args: { tag: "AHU-1" },
      out: { found: 1 },
    },
    {
      name: "query_table",
      args: { cell_contains: "AHU-2" },
      out: { matches: [] },
    },
  ], "Give me the matching control valve", "No matching control valve row was found.")!, /Before refusing/);
  assert.equal(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ title: { text: "CHW CONTROL VALVE SCHEDULE" } }] },
  }], "Give me the matching control valve", "The matching control valve is cited."), null);
  assert.match(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{
      title: { text: "CHW CONTROL VALVE SCHEDULE" },
      row: { identity: { header: "VALVE MARK", text: "CV-AHU-1" } },
    }] },
  }], "Give me the matching control valve", "The chiller data is complete.")!, /omitted its semantic valve identity/);
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
  assert.match(requiredEvidenceCorrection([
    {
      name: "sweep_schedule_row",
      args: { tag: "CH-A1" },
      out: {
        found: 1,
        tag_citations: [{ sheet: "set.pdf#3", bbox: [10, 20, 30, 40] }],
      },
    },
    {
      name: "query_table",
      out: { matches: [{ sheet: "set.pdf#44", row: { key: "CV-CH-A1" } }] },
    },
  ], "Find CH-A1", "Plan location | set.pdf#44 schedule bbox [1, 2, 3, 4].")!, /schedule sheet\/region as a plan location/);
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
  ], "Show me the plan location for CH-A1", "CH-A1 is shown on SET‑PDF#3."), null);
  assert.match(requiredEvidenceCorrection([
    sweptPlan,
    {
      name: "highlight_citation",
      args: { text: "CH-A1" },
      out: { sheet: "set.pdf#3", bbox_px: [10, 20, 30, 40], text: "CH-A1" },
    },
  ], "Show me the plan location for CH-A1", "CH-A1 is shown on schedule sheet set.pdf#44.")!, /actual swept plan sheet/);
  assert.match(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ row: { identity: { header: "VALVE MARK", text: "CV-CH-A1" } } }] },
  }], "Find the valve", "CV‑CH‑A1 comes from UNIT MARK.")!, /semantic identity header VALVE MARK/);
  assert.equal(requiredEvidenceCorrection([{
    name: "query_table",
    out: { matches: [{ row: { identity: { header: "VALVE MARK", text: "CV-CH-A1" } } }] },
  }], "Find the valve", "CV‑CH‑A1 comes from VALVE MARK."), null);
  assert.match(requiredEvidenceCorrection([], "Show me the plan and cite the exact cells")!, /highlight_citation/);
  // Paint-on-sheets is required for any answer that uses paint-able query_table
  // evidence — not only when the goal says "cite the exact".
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: { key: "AHU-1", all_cells: { CFM: { text: "3850", bbox: [10, 20, 30, 40] } } },
    }] } },
  ], "What is AHU-1 maximum supply airflow?", "AHU-1 is 3850 CFM.")!, /highlight_citation|painted/);
  assert.match(requiredEvidenceCorrection([
    { name: "find_text", args: { q: "SECTION" }, out: {
      count: 1,
      hits: [{ str: "AHU-1 / AHU-2 SECTION", sheet: "set.pdf#28", bbox_px: [100, 200, 400, 260] }],
    } },
  ], "Where is the physical drawing section?",
  "Physical section: AHU-1 / AHU-2 SECTION on set.pdf#28.")!, /highlight_citation|painted/);
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#28", bbox_px: [100, 200, 400, 260] } },
    { name: "find_text", args: { q: "SECTION" }, out: {
      count: 1,
      hits: [{ str: "AHU-1 / AHU-2 SECTION", sheet: "set.pdf#28", bbox_px: [100, 200, 400, 260] }],
    } },
  ], "Where is the physical drawing section?",
  "Physical section: AHU-1 / AHU-2 SECTION on set.pdf#28."), null);
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#3", bbox_px: [1, 2, 3, 4] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: { key: "CV-CH-A1", all_cells: { CV: { bbox: [10, 20, 30, 40] } } },
    }] } },
  ], "Cite the exact schedule cells", "CV-CH-A1 is 324.")!, /no painted source cell/);
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: { matches: [
      { sheet: "set.pdf#44", row: { key: "AHU-1", all_cells: { MARK: { bbox: [10, 20, 30, 40] } } } },
      { sheet: "set.pdf#44", row: { key: "AHU-2", all_cells: { MARK: { bbox: [50, 60, 70, 80] } } } },
    ] } },
  ], "Cite the exact schedule cells", "AHU-1 is cited."), null);
  // Keys-only count scans must not force painting every MARK named in a rollup
  // cite answer — only scoped row_key / cell re-queries create cite paint duty.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: {
      query: { title: "AIR HANDLING UNIT", row_key: null, column: null, cell_value: null, cell_contains: null },
      count: 12,
      building_tag_counts: { A: 5, T: 7 },
      next_move: "Use count=12 as the scheduled row total and building_tag_counts={\"A\":5,\"T\":7} for building splits. Re-query with row_key for citation cell bboxes.",
      matches: [
        { sheet: "set.pdf#42", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [1, 2, 3, 4] } } } },
        { sheet: "set.pdf#44", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [5, 6, 7, 8] } } } },
        { sheet: "set.pdf#42", row: { key: "AHU-A2", all_cells: { MARK: { text: "AHU-A2", bbox: [9, 10, 11, 12] } } } },
      ],
    } },
    { name: "query_table", out: {
      query: { title: "AIR HANDLING UNIT", row_key: "AHU-A1", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [
        { sheet: "set.pdf#44", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [10, 20, 30, 40] } } } },
      ],
    } },
  ], "Cite the schedule MARK cells for AHU-A1 and give AHU counts",
  "AHUs: 12 (Air Ops 5). Spot-check MARK AHU-A1. Also FCU-A2 and AI01 appear in the set."), null);
  // Explicit cite lists must not force paint on non-listed keys the answer mentions.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: {
      query: { title: null, row_key: "AHU-A1", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [
        { sheet: "set.pdf#44", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [10, 20, 30, 40] } } } },
      ],
    } },
    { name: "query_table", out: {
      query: { title: null, row_key: "FCU-A2", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [
        { sheet: "set.pdf#42", row: { key: "FCU-A2", all_cells: { MARK: { text: "FCU-A2", bbox: [50, 60, 70, 80] } } } },
      ],
    } },
    { name: "query_table", out: {
      query: { title: "POINTS", row_key: null, column: null, cell_value: null, cell_contains: null },
      count: 4,
      matches: [
        { sheet: "set.pdf#65", row: { key: "AI01", all_cells: { MARK: { text: "AI01", bbox: [1, 2, 3, 4] } } } },
      ],
    } },
  ], "Cite the schedule MARK cells for AHU-A1, so I can spot-check.",
  "AHU-A1 is cited. FCU-A2 and AI01 also exist on the set."), null);
  // Same MARK on two scoped sheets: cite-only duty paints one sheet, not both.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: {
      query: { title: null, row_key: "AHU-A1", column: null, cell_value: null, cell_contains: null },
      count: 2,
      matches: [
        { sheet: "set.pdf#42", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [1, 2, 3, 4] } } } },
        { sheet: "set.pdf#44", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [10, 20, 30, 40] } } } },
      ],
    } },
  ], "Cite the schedule MARK for AHU-A1", "AHU-A1 MARK is cited."), null);
  // Relationship-column foreign MARKs (VAV serves AHU-A1) must not invent
  // multi-field paint duties when the goal only cites the VAV MARK.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#43", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: {
      query: { title: null, row_key: "VAV-A101", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [{
        sheet: "set.pdf#43",
        row: {
          key: "VAV-A101",
          all_cells: {
            MARK: { text: "VAV-A101", bbox: [10, 20, 30, 40] },
            SERVES: { text: "AHU-A1", bbox: [50, 20, 70, 40] },
            SIZE: { text: "3/4", bbox: [80, 20, 100, 40] },
          },
        },
      }],
    } },
  ], "Cite the schedule MARK cells for VAV-A101 and AHU-A1, so I can spot-check.",
  "VAV-A101 MARK is cited. AHU-A1 is also on the set."), null);
  // Count / cite-MARK goals must not demand painting every numeric the model
  // happened to copy from a schedule row.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#42", bbox_px: [1, 2, 3, 4] } },
    { name: "query_table", out: {
      query: { title: null, row_key: "AHU-A1", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [{
        sheet: "set.pdf#42",
        row: {
          key: "AHU-A1",
          all_cells: {
            MARK: { text: "AHU-A1", bbox: [1, 2, 3, 4] },
            ESP: { text: "4.6", bbox: [5, 6, 7, 8] },
            EWT: { text: "45", bbox: [9, 10, 11, 12] },
          },
        },
      }],
    } },
  ], "Cite the schedule MARK for AHU-A1.",
  "AHU-A1 MARK cited; row also shows ESP 4.6 and EWT 45."), null);
  // Schedule takeoffs must run title-scan counts — paint-only MARK spot-checks fail.
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#42", bbox_px: [1, 2, 3, 4] } },
    { name: "query_table", out: {
      query: { title: null, row_key: "AHU-A1", column: null, cell_value: null, cell_contains: null },
      count: 1,
      matches: [{ sheet: "set.pdf#42", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [1, 2, 3, 4] } } } }],
    } },
  ], "Do a full HVAC takeoff — give AHU, FCU, and VAV scheduled counts and cite AHU-A1.",
  "AHUs: 1 (AHU-A1 painted).")!, /title \(no row_key\)|scheduled equipment/);
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#42", bbox_px: [1, 2, 3, 4] } },
    { name: "query_table", out: {
      query: { title: "AIR HANDLING UNIT", row_key: null, column: null, cell_value: null, cell_contains: null },
      count: 5,
      building_tag_counts: { A: 2, M: 1, T: 2 },
      matches: [{ sheet: "set.pdf#42", row: { key: "AHU-A1", all_cells: { MARK: { text: "AHU-A1", bbox: [1, 2, 3, 4] } } } }],
    } },
  ], "Do a full HVAC takeoff — give AHU scheduled counts and cite AHU-A1.",
  "AHUs: 5. Spot-check AHU-A1."), null);
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: {
        key: "AHU-1",
        all_cells: {
          MARK: { text: "AHU-1", bbox: [10, 20, 30, 40] },
          "CAPACITY (TONS)": { text: "56.0", bbox: [40, 20, 60, 40] },
        },
      },
    }] } },
  ], "Cite the exact schedule cells", "AHU-1 MARK is highlighted.\nCAPACITY (TONS) 56.0 is highlighted.")!, /highlighted that was not painted|Rewrite the answer without that claim/);
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: {
        key: "AHU-1",
        all_cells: {
          MARK: { text: "AHU-1", bbox: [10, 20, 30, 40] },
          CFM: { text: "3850", bbox: [40, 20, 60, 40] },
        },
      },
    }] } },
  ], "Cite the exact schedule cells", "AHU-1 MARK is highlighted; CFM is 3850. All cited cells are highlighted.")!, /broadly says all\/each|ONLY these painted/);
  // Multi-field answers must paint EACH answering value cell — painting only
  // location (or any single field) while citing CFM/capacity/etc. is incomplete.
  assert.match(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: {
        key: "AHU-1",
        all_cells: {
          MARK: { text: "AHU-1", bbox: [1, 2, 3, 4] },
          LOCATION: { text: "11TH FLOOR MECHANICAL", bbox: [10, 20, 30, 40] },
          CFM: { text: "3850", bbox: [50, 60, 70, 80] },
        },
      },
    }] } },
  ], "What are AHU-1 location and supply airflow?",
  "AHU-1 location is 11TH FLOOR MECHANICAL; supply airflow is 3850 CFM.")!, /answering value cells|3850|EACH answering/);
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [10, 20, 30, 40] } },
    { name: "highlight_citation", out: { sheet: "set.pdf#44", bbox_px: [50, 60, 70, 80] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#44",
      row: {
        key: "AHU-1",
        all_cells: {
          MARK: { text: "AHU-1", bbox: [1, 2, 3, 4] },
          LOCATION: { text: "11TH FLOOR MECHANICAL", bbox: [10, 20, 30, 40] },
          CFM: { text: "3850", bbox: [50, 60, 70, 80] },
        },
      },
    }] } },
  ], "What are AHU-1 location and supply airflow?",
  "AHU-1 location is 11TH FLOOR MECHANICAL on set.pdf#44; supply airflow is 3850 CFM."), null);
  // Short digits inside a mark must not invent a phantom numeric paint duty.
  assert.equal(requiredEvidenceCorrection([
    { name: "highlight_citation", out: { sheet: "set.pdf#48", bbox_px: [10, 20, 30, 40] } },
    { name: "highlight_citation", out: { sheet: "set.pdf#48", bbox_px: [50, 60, 200, 80] } },
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: {
        key: "AI10",
        all_cells: {
          MARK: { text: "AI10", bbox: [10, 20, 30, 40] },
          DESCRIPTION: { text: "HW VALVE POSITION (FEEDBACK)", bbox: [50, 60, 200, 80] },
          PHANTOM: { text: "10", bbox: [90, 90, 100, 100] },
        },
      },
    }] } },
  ], "What is the HW valve position feedback point mark?",
  "Point mark AI10 — HW VALVE POSITION (FEEDBACK) on set.pdf#48."), null);
  const servesGoal = "Trace the point back to the air handler. Give me what the unit serves and cite the physical drawing section where the equipment is shown.";
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: { key: "AHU-1", all_cells: { LOCATION: { text: "11TH FLOOR MECHANICAL" } } },
    }] } },
  ], servesGoal, "Serves: 11TH FLOOR MECHANICAL spaces.")!, /drawing-text evidence/);
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: { key: "AHU-1", all_cells: { LOCATION: { text: "11TH FLOOR MECHANICAL" } } },
    }] } },
    { name: "find_text", args: { sheet: "set.pdf#48", q: "AHU-1" }, out: { count: 0, hits: [], next_move: "omit sheet" } },
  ], servesGoal, "Serves: derived from the LOCATION field.")!, /Omit sheet/);
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: { key: "AHU-1", all_cells: { LOCATION: { text: "11TH FLOOR MECHANICAL" } } },
    }] } },
    { name: "find_text", args: { q: "AHU-1" }, out: { count: 1, hits: [{ str: "AHU-1", sheet: "set.pdf#2" }] } },
  ], servesGoal,
  "Location: 11TH FLOOR MECHANICAL.\nServes: supplies the 11TH FLOOR MECHANICAL spaces.")!, /LOCATION\/ROOM cell/);
  const narrative = "AHU-1/B provide ventilation, heating, cooling, and dehumidification to the control cab.";
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: { key: "AHU-1", all_cells: { LOCATION: { text: "11TH FLOOR MECHANICAL" } } },
    }] } },
    { name: "find_text", args: { q: "control cab" }, out: {
      count: 1,
      hits: [{ str: narrative, sheet: "set.pdf#2" }],
    } },
  ], servesGoal, "Location: 11TH FLOOR MECHANICAL.\nServes: the mechanical room.")!, /copy answering text from hit\.str/);
  assert.equal(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#48",
      row: { key: "AHU-1", all_cells: { LOCATION: { text: "11TH FLOOR MECHANICAL" } } },
    }] } },
    { name: "find_text", args: { q: "control cab" }, out: {
      count: 2,
      hits: [
        { str: narrative, sheet: "set.pdf#2" },
        { str: "AHU-1 / AHU-2 SECTION", sheet: "set.pdf#28" },
      ],
    } },
  ], servesGoal,
  `Location: 11TH FLOOR MECHANICAL on set.pdf#48.\nServes: ${narrative}\nPhysical section: AHU-1 / AHU-2 SECTION on set.pdf#28.`), null);
  assert.equal(requiredEvidenceCorrection([
    { name: "find_text", args: { q: "AHU-1" }, out: {
      count: 1,
      hits: [{ str: "AHU-1 / AHU-2 SECTION", sheet: "set.pdf#28" }],
    } },
  ], servesGoal,
  "Physical section: AHU-1 / AHU-2 SECTION on set.pdf#28.\nCould not find a drawn serving narrative with evidence; refusing serves."), null);
  assert.match(requiredEvidenceCorrection([
    { name: "query_table", out: { matches: [{
      sheet: "set.pdf#65",
      row: {
        key: "AI10",
        identity: { header: "MARK ANALOG INPUT", text: "AI10" },
        all_cells: {
          "MARK ANALOG INPUT": { text: "AI10" },
          "DESCRIPTION ANALOG INPUT": { text: "AHU-1 HW VALVE POSITION (FEEDBACK)" },
          ALARM: { text: "No" },
          TREND: { text: "No" },
        },
      },
    }] } },
    { name: "find_text", args: { q: "control cab" }, out: {
      count: 2,
      hits: [
        { str: narrative, sheet: "set.pdf#2" },
        { str: "AHU-1 / AHU-2 SECTION", sheet: "set.pdf#28" },
      ],
    } },
  ], "Give me the point mark, alarm and trend requirements, what the unit serves, and the physical drawing section.",
  `Point mark: AHU-1 HW VALVE POSITION (FEEDBACK) on set.pdf#65\nServes: ${narrative}\nPhysical section: AHU-1 / AHU-2 SECTION on set.pdf#28`), /BAS point mark|does not state that mark/);
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
