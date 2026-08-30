import assert from "node:assert/strict";
import test from "node:test";
import {
  citationProvenanceErrors,
  DEMO_TOOLS,
  parseJsonAnswer,
  runTimingMetadata,
  runToolCallingModel,
} from "../scripts/run-demo.mjs";

test("demo runner exposes deterministic plan-location evidence tools", () => {
  assert.equal(DEMO_TOOLS.has("find_text"), true);
  assert.equal(DEMO_TOOLS.has("read_sheet_text"), true);
  assert.equal(DEMO_TOOLS.has("view_sheet"), true);
});

test("demo timing separates cold source indexing from live prompt latency", () => {
  assert.deepEqual(runTimingMetadata(true, 1234.567), {
    latency_scope: "prompt_to_final_answer_after_loaded_source_index",
    setup: {
      fresh_session: true,
      source_index_forced_cold: true,
      latency_ms: 1234.57,
    },
  });
});

test("demo runner rejects schedule citations when plan tag evidence exists", () => {
  const answer = {
    answer: {
      equipment_tag: {
        value: "CH-A1",
        citations: [{
          sheet_id: "set.pdf#44",
          bbox_px: [10, 20, 30, 40],
        }],
      },
      installed_quantity: {
        value: 1,
        citations: [{
          sheet_id: "set.pdf#3",
          bbox_px: [1, 2, 3, 4],
          table_title: "CHILLER SCHEDULE",
        }],
      },
    },
  };
  const toolCalls = [{
    name: "sweep_schedule_row",
    result: {
      data: {
        tag_citations: [{
          sheet: "set.pdf#3",
          bbox: { x0: 1, y0: 2, x1: 3, y1: 4 },
        }],
      },
    },
  }];
  assert.deepEqual(citationProvenanceErrors(answer, toolCalls), [
    "equipment_tag must cite a plan tag returned by sweep_schedule_row.tag_citations",
    "installed_quantity uses a plan tag citation, so table_title, row_key, and column must be null or omitted",
  ]);
});

test("parseJsonAnswer accepts JSON and strips a fenced transport wrapper", () => {
  assert.deepEqual(parseJsonAnswer('{"status":"done","answer":{}}'), {
    status: "done",
    answer: {},
  });
  assert.deepEqual(parseJsonAnswer('```json\n{"status":"done","answer":{}}\n```'), {
    status: "done",
    answer: {},
  });
});

test("demo runner repairs a non-JSON final response without changing facts", async () => {
  const replies = [
    new Response(JSON.stringify({
      id: "bad-final",
      choices: [{ message: { role: "assistant", content: "**Answer:** 56 tons" } }],
    }), { status: 200 }),
    new Response(JSON.stringify({
      id: "fixed-final",
      choices: [{
        message: {
          role: "assistant",
          content: '{"status":"done","answer":{"capacity_tons":{"value":56,"citations":[]}}}',
        },
      }],
    }), { status: 200 }),
  ];
  const requests = [];
  const result = await runToolCallingModel({
    endpoint: "https://model.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    prompt: "Capacity?",
    truth: {
      source_file: "set.pdf",
      expected: { capacity_tons: { type: "number", tolerance: 0 } },
    },
    tools: [],
    execute: async () => {
      throw new Error("no tool call expected");
    },
    fetchFn: async (_endpoint, request) => {
      requests.push(JSON.parse(request.body));
      return replies.shift();
    },
  });

  assert.equal(requests.length, 2);
  assert.match(requests[1].messages.at(-1).content, /Re-emit the same answer as one valid JSON object/);
  assert.equal(result.raw_model_responses.length, 2);
  assert.equal(result.answer.answer.capacity_tons.value, 56);
});

test("demo runner captures request IDs, raw replies, and complete tool payloads", async () => {
  const replies = [
    new Response(JSON.stringify({
      id: "req-tool",
      model: "test-model-v1",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "query_table",
              arguments: '{"row_key":"CH-A1","column":"GPM"}',
            },
          }],
        },
      }],
    }), { status: 200, headers: { "x-request-id": "header-tool" } }),
    new Response(JSON.stringify({
      id: "req-final",
      model: "test-model-v1",
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            status: "done",
            answer: {
              design_flow_gpm: {
                value: 128.5,
                citations: [{
                  sheet_id: "set.pdf#2",
                  table_title: "CHILLER SCHEDULE",
                  row_key: "CH-A1",
                  column: "GPM",
                  bbox_px: [1, 2, 3, 4],
                }],
              },
            },
          }),
        },
      }],
    }), { status: 200, headers: { "x-request-id": "header-final" } }),
  ];
  const executed = [];
  const requestBodies = [];
  const result = await runToolCallingModel({
    endpoint: "https://model.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    prompt: "Give me CH-A1's flow.",
    truth: {
      source_file: "set.pdf",
      expected: {
        design_flow_gpm: { type: "number", tolerance: 0 },
      },
    },
    tools: [{
      type: "function",
      function: {
        name: "query_table",
        description: "Query a table.",
        parameters: { type: "object" },
      },
    }],
    execute: async (name, args) => {
      executed.push({ name, args });
      return { is_error: false, data: { count: 1 } };
    },
    fetchFn: async (_endpoint, request) => {
      requestBodies.push(JSON.parse(request.body));
      return replies.shift();
    },
  });

  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies.every((body) => !("response_format" in body)), true);
  assert.match(requestBodies[0].messages[0].content, /tagged_only:true/);
  assert.match(requestBodies[0].messages[0].content, /sweep_schedule_row\.tag_citations/);
  assert.match(requestBodies[0].messages[0].content, /row\.all_cells/);
  assert.match(requestBodies[0].messages[0].content, /row\.identity/);
  assert.match(requestBodies[0].messages[0].content, /row\.cell_citations/);
  assert.match(requestBodies[0].messages[0].content, /tool sheet → sheet_id/);
  assert.match(requestBodies[0].messages[0].content, /bbox_px \[x0,y0,x1,y1\]/);
  assert.deepEqual(executed, [{
    name: "query_table",
    args: { row_key: "CH-A1", column: "GPM" },
  }]);
  assert.deepEqual(result.request_ids, ["header-tool", "header-final"]);
  assert.equal(result.raw_model_responses.length, 2);
  assert.deepEqual(result.tool_calls[0].result, {
    is_error: false,
    data: { count: 1 },
  });
  assert.equal(result.answer.answer.design_flow_gpm.value, 128.5);
});
