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
  for (const field of ["equipment_tag", "installed_quantity"]) {
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

function systemPrompt(truth) {
  const fields = Object.entries(truth.expected).map(([name, spec]) => ({
    name,
    type: spec.type,
    tolerance: spec.tolerance,
  }));
  const needsInstalledQuantity = Object.hasOwn(truth.expected, "installed_quantity");
  const nonTableFields = Object.entries(truth.expected)
    .filter(([, spec]) => {
      const citations = Array.isArray(spec.citations) ? spec.citations : [spec.citation];
      return citations.some((citation) => citation && !citation.table_title);
    })
    .map(([name]) => name);
  return [
    "You are an HVAC/BAS estimator operating OpenTakeoff's production MCP API.",
    `The real drawing set ${truth.source_file} is already loaded.`,
    "Use deterministic tools for every factual claim. Never infer a value from the field names or invent a citation.",
    needsInstalledQuantity
      ? "Installed quantity is required: call sweep_schedule_row once with tagged_only:true; this returns the complete tagged count and exact tag_at locations while explicitly excluding the unnecessary unlabeled near-match audit."
      : "Installed quantity is not requested. Do not call sweep_schedule_row merely for equipment_tag; cite equipment_tag from its exact schedule identity cell returned by query_table.",
    "For schedule attributes and BAS points-list fields, call query_table. When the prompt gives a distinctive point description but asks you to discover its point mark, use cell_contains with that description, then read every requested field from row.all_cells.",
    nonTableFields.length
      ? `These required fields need drawing-text evidence rather than a table cell: ${nonTableFields.join(", ")}. Use sheet_graph to orient, then find_text/read_sheet_text to return their exact source text and bbox; do not substitute a schedule citation.`
      : "No required field needs free drawing-text evidence.",
    "Group independent tool calls into the same response. Inspect each complete result before calling another tool, and never repeat an equivalent query.",
    "Use query_table cell_value for exact cross-table relationships and cell_contains when the related tag is embedded in a compound value; do not scan a whole table or infer a row without source text.",
    "Every query_table match includes row.all_cells. After the first matching row, use all_cells for every requested field on that row instead of making separate column calls.",
    "sweep_schedule_row includes row.cell_citations for every schedule attribute. Use those exact per-cell bboxes; row.citation is only the row identity and must never be reused for attribute fields.",
    "Return JSON only after all required fields are answered.",
    "The final JSON shape is:",
    '{"status":"done","answer":{"<field>":{"value":"typed value","citations":[{"sheet_id":"exact tool sheet","table_title":"when applicable","row_key":"when applicable","column":"when applicable","bbox_px":[x0,y0,x1,y1]}]}}}',
    "Translate every native tool citation into the final JSON citation shape: tool sheet → sheet_id, and tool bbox {x0,y0,x1,y1} → bbox_px [x0,y0,x1,y1]. Preserve the exact sheet string and coordinate numbers, but do not copy the tool object's key names or bbox object shape.",
    needsInstalledQuantity
      ? "A schedule field uses its exact cell bbox. For equipment_tag and installed_quantity in this quantity workflow, use sweep_schedule_row.tag_citations and no schedule citation."
      : "Every requested schedule field, including equipment_tag, uses its exact query_table identity or value-cell bbox.",
    "A citation must name the exact source header and bbox of the cell containing that field's returned value. Never relabel a header, reuse another field's bbox, or use a row-level bbox for a cell value.",
    "For a related scheduled device's tag field, use query_table row.identity exactly; it selects the semantic identity header when duplicate cells contain the same tag.",
    "When both equipment_tag and installed_quantity are requested, cite the same plan tag_at bbox for both fields.",
    "For an installed quantity, include one plan tag citation per counted instance; the citations array length must equal the quantity.",
    `Required fields (names and types only; values are not supplied): ${JSON.stringify(fields)}`,
    "If a required value or citation cannot be established, return status \"refused\" and explain the missing evidence instead of guessing.",
  ].join("\n");
}

function requestId(response, json) {
  return response.headers.get("x-request-id")
    || response.headers.get("request-id")
    || json.id
    || null;
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
  const data = text ? JSON.parse(text) : null;
  return { is_error: !!response.isError, data };
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
  maxIterations = 12,
}) {
  const messages = [
    { role: "system", content: systemPrompt(truth) },
    { role: "user", content: prompt },
  ];
  const rawModelResponses = [];
  const toolCalls = [];
  const requestIds = [];
  let resolvedModel = model;

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
      throw new Error(`Model endpoint returned ${response.status}: ${JSON.stringify(json)}`);
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
      const result = await execute(name, args);
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
