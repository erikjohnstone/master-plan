import assert from "node:assert/strict";
import test from "node:test";
import {
  answerShapeErrors,
  citationFormErrors,
  citationProvenanceErrors,
  compactSheetGraph,
  compactToolResult,
  DEMO_TOOLS,
  drawingTextEvidenceErrors,
  parseJsonAnswer,
  runTimingMetadata,
  runToolCallingModel,
  toolTextOrthographyErrors,
} from "../scripts/run-demo.mjs";
import { formatDemoRun } from "../scripts/show-demo-run.mjs";

test("demo runner seeds the setup sheet_graph compactly without counting it as a model call", async () => {
  const requests = [];
  const result = await runToolCallingModel({
    endpoint: "https://model.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    prompt: "Tag?",
    truth: {
      source_file: "set.pdf",
      expected: {
        equipment_tag: {
          type: "string",
          citation: {
            sheet_id: "set.pdf#1",
            table_title: "AIR HANDLING UNIT SCHEDULE",
            bbox_px: [1, 2, 3, 4],
          },
        },
      },
    },
    tools: [],
    seededToolCalls: [{
      id: "seed-sheet-graph",
      name: "sheet_graph",
      arguments: {},
      result: { is_error: false, data: compactSheetGraph({
        sheets: [{ sheet: "set.pdf#1", role: "schedule", schedules: [{ kind: "equipment", title: "AIR HANDLING UNIT SCHEDULE", rows: 2 }] }],
      }) },
    }],
    execute: async () => {
      throw new Error("no tool call expected");
    },
    fetchFn: async (_endpoint, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(JSON.stringify({
        id: "final",
        choices: [{
          message: {
            role: "assistant",
            content: JSON.stringify({
              status: "done",
              answer: {
                equipment_tag: {
                  value: "AHU-T1A",
                  citations: [{
                    sheet_id: "set.pdf#1",
                    table_title: "AIR HANDLING UNIT SCHEDULE",
                    row_key: "AHU-T1A",
                    column: "MARK",
                    bbox_px: [1, 2, 3, 4],
                  }],
                },
              },
            }),
          },
        }],
      }), { status: 200 });
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].messages[2].tool_calls[0].function.name, "sheet_graph");
  assert.match(requests[0].messages[0].content, /omit sheet to search the entire loaded set/);
  assert.equal(result.tool_calls.length, 0);
  assert.equal(result.answer.answer.equipment_tag.value, "AHU-T1A");
});

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

test("demo runner rejects tool-key citation sheets and missing sheet_id", () => {
  assert.deepEqual(citationFormErrors({
    status: "done",
    answer: {
      equipment_tag: {
        value: "AHU-T1A",
        citations: [{
          sheet: "set.pdf#48",
          bbox_px: [1, 2, 3, 4],
        }],
      },
    },
  }, {
    expected: { equipment_tag: { type: "string" } },
  }), [
    'equipment_tag citation 0 uses tool key "sheet"; rename it to sheet_id',
    "equipment_tag citation 0 must include sheet_id",
  ]);
});

test("demo runner rejects schedule cells for drawing-text fields", () => {
  assert.deepEqual(drawingTextEvidenceErrors({
    status: "done",
    answer: {
      serves: {
        value: "11TH FLOOR MECHANICAL",
        citations: [{
          sheet_id: "set.pdf#48",
          bbox_px: [1, 2, 3, 4],
        }],
      },
    },
  }, {
    expected: {
      serves: {
        type: "string",
        citation: {
          sheet_id: "set.pdf#2",
          bbox_px: [1, 2, 3, 4],
          grounding_text: "control cab",
        },
      },
    },
  }, [{
    name: "query_table",
    result: {
      data: {
        matches: [{
          row: {
            all_cells: {
              LOCATION: { text: "11TH FLOOR MECHANICAL", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } },
            },
          },
        }],
      },
    },
  }, {
    name: "find_text",
    result: {
      data: {
        hits: [{ sheet: "set.pdf#48", str: "11TH FLOOR MECHANICAL", bbox: [1, 2, 3, 4] }],
      },
    },
  }]), [
    "serves value is exact schedule-cell text from query_table; choose a find_text/read_sheet_text phrase that is not a schedule attribute",
  ]);
});

test("demo runner rejects Unicode hyphen substitutions of tool text", () => {
  assert.deepEqual(toolTextOrthographyErrors({
    status: "done",
    answer: {
      equipment_tag: {
        value: "AHU\u2011T1A",
        citations: [{ sheet_id: "set.pdf#48", bbox_px: [1, 2, 3, 4] }],
      },
    },
  }, {
    expected: { equipment_tag: { type: "string" } },
  }, [{
    name: "query_table",
    result: {
      data: {
        matches: [{
          row: { all_cells: { MARK: { text: "AHU-T1A", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } } } },
        }],
      },
    },
  }]), [
    "equipment_tag must copy the exact ASCII hyphen/text from the tool evidence",
  ]);
});

test("local demo presenter shows transport, prompt, values, and citations", () => {
  const text = formatDemoRun({
    demo_id: "D01",
    transport: "stdio_local_process",
    model_version_identifier: "test-model",
    request_id: "request-1",
    latency_ms: 2500,
    answer: {
      capacity_tons: {
        value: 56,
        citations: [{
          sheet_id: "set.pdf#44",
          table_title: "CHILLER SCHEDULE",
          column: "CAPACITY",
          bbox_px: [1, 2, 3, 4],
        }],
      },
    },
  }, "Find CH-A1.");
  assert.match(text, /Transport: stdio_local_process/);
  assert.match(text, /FROZEN PROMPT\nFind CH-A1\./);
  assert.match(text, /capacity_tons: 56/);
  assert.match(text, /set\.pdf#44 \| CHILLER SCHEDULE \| CAPACITY \| bbox \[1,2,3,4\]/);
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

test("demo runner rejects numeric strings using only the frozen type contract", () => {
  assert.deepEqual(answerShapeErrors({
    status: "done",
    answer: {
      capacity_tons: { value: "56.0", citations: [] },
      installed_quantity: { value: 1.5, citations: [] },
      equipment_tag: { value: "CH-A1", citations: [] },
    },
  }, {
    expected: {
      capacity_tons: { type: "number" },
      installed_quantity: { type: "integer" },
      equipment_tag: { type: "string" },
    },
  }), [
    "capacity_tons must be a finite JSON number, not string",
    "installed_quantity must be a JSON integer, not number",
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
          content: JSON.stringify({
            status: "done",
            answer: {
              capacity_tons: {
                value: 56,
                citations: [{
                  sheet_id: "set.pdf#44",
                  table_title: "CHILLER SCHEDULE",
                  row_key: "CH-A1",
                  column: "CAPACITY (TONS)",
                  bbox_px: [1, 2, 3, 4],
                }],
              },
            },
          }),
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
      expected: {
        capacity_tons: {
          type: "number",
          tolerance: 0,
          citation: {
            sheet_id: "set.pdf#44",
            table_title: "CHILLER SCHEDULE",
            bbox_px: [1, 2, 3, 4],
          },
        },
      },
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

test("demo runner repairs tool-key sheet citations before accepting a run", async () => {
  const replies = [
    new Response(JSON.stringify({
      id: "bad-cite",
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            status: "done",
            answer: {
              equipment_tag: {
                value: "AHU-T1A",
                citations: [{
                  sheet: "set.pdf#48",
                  bbox_px: [1, 2, 3, 4],
                }],
              },
            },
          }),
        },
      }],
    }), { status: 200 }),
    new Response(JSON.stringify({
      id: "fixed-cite",
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            status: "done",
            answer: {
              equipment_tag: {
                value: "AHU-T1A",
                citations: [{
                  sheet_id: "set.pdf#48",
                  table_title: "AIR HANDLING UNIT SCHEDULE",
                  row_key: "AHU-T1A",
                  column: "MARK",
                  bbox_px: [1, 2, 3, 4],
                }],
              },
            },
          }),
        },
      }],
    }), { status: 200 }),
  ];
  const requests = [];
  const result = await runToolCallingModel({
    endpoint: "https://model.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    prompt: "Tag?",
    truth: {
      source_file: "set.pdf",
      expected: {
        equipment_tag: {
          type: "string",
          citation: {
            sheet_id: "set.pdf#48",
            table_title: "AIR HANDLING UNIT SCHEDULE",
            bbox_px: [1, 2, 3, 4],
          },
        },
      },
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
  assert.match(requests[1].messages.at(-1).content, /required citation shape/);
  assert.equal(result.answer.answer.equipment_tag.citations[0].sheet_id, "set.pdf#48");
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
  assert.match(requestBodies[0].messages[0].content, /Installed quantity is not requested/);
  assert.match(requestBodies[0].messages[0].content, /Do not call sweep_schedule_row merely for equipment_tag/);
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

test("compactToolResult compacts sheet_graph but preserves sweep_schedule_row evidence", () => {
  const graph = compactToolResult({
    is_error: false,
    data: {
      available: true,
      sheets: [
        { sheet: "set.pdf#1", role: "plan", schedules: [] },
        { sheet: "set.pdf#2", role: "schedule", schedules: [{ kind: "equipment", title: "VALVE SCHEDULE", rows: 9 }] },
      ],
      rooms: [{ id: "101" }],
      counts: { rooms: 1, schedules: 1, callouts: 0 },
    },
  });
  assert.deepEqual(graph.data, {
    sheet_count: 2,
    sheets: [
      { sheet: "set.pdf#1", role: "plan", schedules: [] },
      { sheet: "set.pdf#2", role: "schedule", schedules: [{ kind: "equipment", title: "VALVE SCHEDULE", rows: 9 }] },
    ],
  });

  const sweep = {
    is_error: false,
    data: {
      tag: "CV-1",
      found: 1,
      search_scope: "exhaustive",
      unlabeled_audit_complete: true,
      tag_citations: [{ sheet: "set.pdf#5", bbox: [10, 20, 30, 40] }],
      row: {
        sheet: "set.pdf#13",
        table: "CONTROL VALVE SCHEDULE",
        key: "CV-1",
        cells: { GPM: "5" },
        cell_citations: { GPM: { text: "5", bbox: [1, 2, 3, 4] } },
        citation: { sheet: "set.pdf#13", bbox: [1, 2, 3, 4] },
      },
      anchor: {
        sheet: "set.pdf#5",
        at: [15, 25],
        rect: [1, 2, 3, 4],
        segments: 4,
        length_px: 40,
        corroborated: true,
        occurrences: 1,
      },
      sheets: [
        { sheet: "set.pdf#3", found: 0, matches: [], withheld: [], excluded: [], text_only: [], candidates: { considered: 0, dropped: 0 }, complete: true, elapsed_ms: 1 },
        { sheet: "set.pdf#5", found: 1, matches: [{ at: [15, 25], score: 1, rotation: 0, mirrored: false, tag_at: [10, 20, 30, 40] }], withheld: [], excluded: [], text_only: [], candidates: { considered: 1, dropped: 0 }, complete: true, elapsed_ms: 2 },
      ],
      complete: true,
      skipped: [],
    },
  };
  const compacted = compactToolResult(sweep);
  assert.equal(compacted.data.found, 1);
  assert.deepEqual(compacted.data.tag_citations, sweep.data.tag_citations);
  assert.equal(compacted.data.sheets.length, 1);
  assert.equal(compacted.data.sheets[0].sheet, "set.pdf#5");
  assert.equal(compacted.data.sheets_omitted_empty, 1);
  assert.equal(compacted.data.truncated_for_context, undefined);
});

test("demo runner preserves diagnostics when the model exceeds its iteration budget", async () => {
  const toolReply = () => new Response(JSON.stringify({
    id: "req-loop",
    model: "test-model-v1",
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-loop",
          type: "function",
          function: { name: "query_table", arguments: '{"row_key":"AHU-1"}' },
        }],
      },
    }],
  }), { status: 200 });
  await assert.rejects(runToolCallingModel({
    endpoint: "https://model.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    prompt: "Find AHU-1.",
    truth: { source_file: "set.pdf", expected: {} },
    tools: [],
    execute: async () => ({ is_error: false, data: { count: 1 } }),
    fetchFn: async () => toolReply(),
    maxIterations: 2,
  }), (error) => {
    assert.equal(error.code, "ITERATION_LIMIT");
    assert.equal(error.diagnostics.raw_model_responses.length, 2);
    assert.equal(error.diagnostics.tool_calls.length, 2);
    assert.deepEqual(error.diagnostics.request_ids, ["req-loop", "req-loop"]);
    assert.equal(error.diagnostics.model_version_identifier, "test-model-v1");
    return true;
  });
});
