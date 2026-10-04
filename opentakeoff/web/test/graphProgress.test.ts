// A cold sheet-graph build runs for minutes on a large set. Its steps reach
// the canvas as they finish: the graph CLI prints them, the server streams
// them as NDJSON when asked, and the canvas reads the stream.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readNdjsonResult } from "../src/lib/ndjsonReply.js";
import { withProgressLine } from "../src/lib/progressLog.js";
import { runCli } from "../vite.corpusTakeoffApi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(HERE, "../public/demo/sample-mechanical-set.pdf");

/** A reply whose body arrives in the given chunks, as a network does. */
const reply = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) {
    for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
    controller.close();
  },
}));

test("an NDJSON reply hands each progress line on and returns its result, lines split anywhere", async () => {
  const seen: unknown[] = [];
  const lines = [
    JSON.stringify({ type: "progress", phase: "graph_step", stage: "sheets", done: 1, total: 2 }),
    JSON.stringify({ type: "progress", phase: "graph_step", stage: "tables", done: 0, total: 1 }),
    JSON.stringify({ type: "result", result: { tables: [{ title: "PUMP SCHEDULE — °F" }] } }),
  ].join("\n");
  const cut = [lines.slice(0, 7), lines.slice(7, 70), lines.slice(70)];
  const result = await readNdjsonResult(reply(cut), (p: unknown) => seen.push(p), "sheet-graph");
  assert.deepEqual(result, { tables: [{ title: "PUMP SCHEDULE — °F" }] });
  assert.deepEqual(seen.map((p: any) => `${p.stage} ${p.done}/${p.total}`), ["sheets 1/2", "tables 0/1"]);
  await assert.rejects(() => readNdjsonResult(reply([`${JSON.stringify({ type: "error", error: "M-1.pdf is empty (0 bytes)" })}\n`]), null, "sheet-graph"),
    /M-1\.pdf is empty/);
  await assert.rejects(() => readNdjsonResult(reply([`${JSON.stringify({ type: "progress", done: 0, total: 1 })}\n`]), null, "sheet-graph"),
    /sheet-graph stream ended without a result/);
});

test("the graph CLI reports each sheet read and each schedule sheet read, in order, as the build runs", async () => {
  const before = process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  process.env.OPENTAKEOFF_GRAPH_NO_CACHE = "1"; // a cached graph is answered without a build, so without steps
  const steps: any[] = [];
  try {
    await (runCli as (options: object) => Promise<unknown>)({
      mode: "graph", pdfPaths: [SAMPLE], onProgress: (p: any) => { if (p.phase === "graph_step") steps.push(p); },
    });
  } finally {
    if (before === undefined) delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
    else process.env.OPENTAKEOFF_GRAPH_NO_CACHE = before;
  }
  const sheets = steps.filter((p) => p.stage === "sheets");
  assert.deepEqual(sheets.map((p) => `${p.done}/${p.total}`), Array.from({ length: 9 }, (_, i) => `${i}/8`));
  assert.match(sheets.at(-1).message, /^Reading sheet 8 of 8…$/);
  // The table stage runs where the table reader is installed; when it does,
  // it counts from 0 to its total after every sheet is read.
  const tables = steps.filter((p) => p.stage === "tables");
  if (tables.length) {
    assert.ok(steps.indexOf(tables[0]) > steps.indexOf(sheets.at(-1)));
    assert.deepEqual(tables.map((p) => p.done), Array.from({ length: tables[0].total + 1 }, (_, i) => i));
    assert.match(tables.at(-1).message, /^Reading schedules: \d+ of \d+ sheets?…$/);
  }
});

test("a compile's agent log shows a graph build's steps as one line counting up, not a line a sheet", () => {
  type Line = { kind: string; text: string; step?: boolean };
  let log: Line[] = [{ kind: "text", text: "Run takeoff" }];
  log = withProgressLine(log, "Building Session + ODL sheet graph (schedules, roles, tables)…");
  for (let i = 0; i <= 47; i++) log = withProgressLine(log, `Reading sheet ${i} of 47…`, { step: true });
  for (let i = 0; i <= 12; i++) log = withProgressLine(log, `Reading schedules: ${i} of 12 sheets…`, { step: true });
  log = withProgressLine(log, "Sheet graph ready — 47 sheets, 30 schedule tables.");
  log = withProgressLine(log, "Sheet graph ready — 47 sheets, 30 schedule tables.");
  assert.deepEqual(log.map((l) => l.text), [
    "Run takeoff",
    "Building Session + ODL sheet graph (schedules, roles, tables)…",
    "Reading schedules: 12 of 12 sheets…",
    "Sheet graph ready — 47 sheets, 30 schedule tables.",
  ]);
  // Other progress lines stay one each, and the log keeps its last 200.
  for (let i = 0; i < 250; i++) log = withProgressLine(log, `Grounded ${i} schedule tags`);
  assert.equal(log.length, 200);
  assert.equal(log.at(-1)!.text, "Grounded 249 schedule tags");
});
