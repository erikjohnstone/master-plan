import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_TOOLS, parseJsonAnswer, runToolCallingModel } from "../scripts/run-demo.mjs";

test("demo runner exposes deterministic plan-location evidence tools", () => {
  assert.equal(DEMO_TOOLS.has("find_text"), true);
  assert.equal(DEMO_TOOLS.has("read_sheet_text"), true);
  assert.equal(DEMO_TOOLS.has("view_sheet"), true);
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
  assert.match(requestBodies[0].messages[0].content, /row\.all_cells/);
  assert.match(requestBodies[0].messages[0].content, /row\.cell_citations/);
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
