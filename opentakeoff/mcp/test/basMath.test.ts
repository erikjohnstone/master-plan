import test from "node:test";
import assert from "node:assert/strict";
import { runBasMath } from "../src/basMath.ts";
import { compileProductionTakeoff } from "../src/productionTakeoff.ts";
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import type { SheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { spawn } from "node:child_process";

test("Python BAS engine is strict and the transport does no arithmetic", async () => {
  const result = await runBasMath({ request: { groups: [{ group_id: "unit", quantity: 1_000_000 }],
    point_list: [{ group_id: "unit", point_id: "signals", physical: { AI: 6, AO: 2, DI: 5, DO: 1 } }],
    hardware: { profile_id: "abstract", rigid: { AI: 2, AO: 2, DI: 2, DO: 1 }, universal_inputs: 4 } } });
  assert.deepEqual(result.physical_total, { AI: 6_000_000, AO: 2_000_000, DI: 5_000_000, DO: 1_000_000 });
  assert.equal(result.hardware[0].blocks_total, 2_000_000);
  await assert.rejects(runBasMath({ request: { point_list: [], spare: { numerator: true } } }), /Invalid BAS/);
});

test("unsafe JSON integer quantities and missing Python fail explicitly", async () => {
  await assert.rejects(runBasMath({ request: { point_list: [], groups: [{ group_id: "g", quantity: Number.MAX_SAFE_INTEGER+1 }] } }), /exact numeric range/);
  await assert.rejects(runBasMath({ request: { point_list: [] } }, { python: "/nonexistent/bas-python" }), /runtime unavailable/);
  await assert.rejects(runBasMath({ request: { point_list: [] } }, { timeoutMs: 1 }), /timed out/);
});

test("safe individual inputs cannot silently produce rounded or oversized wire results", async () => {
  await assert.rejects(runBasMath({ request: {
    groups: [{ group_id: "g", quantity: Number.MAX_SAFE_INTEGER }],
    point_list: [{ group_id: "g", point_id: "p", physical: { AI: 2 } }],
  } }), /exact numeric range/);
  await assert.rejects(runBasMath({ request: { point_list: [] }, padding: "x".repeat(32*1024*1024) }), /input exceeds 32 MiB/);
});

test("an unavailable Python runtime preserves legacy BAS output without a fake zero", async () => {
  const graph = { available: true, sheets: [], tables: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  const previous = process.env.OPENTAKEOFF_BAS_PYTHON;
  process.env.OPENTAKEOFF_BAS_PYTHON = "/nonexistent/bas-python";
  try {
    const result = await compileProductionTakeoff(null, graph, "bas_points");
    assert.ok("bas_math" in result);
    const { bas_math, ...legacy } = result;
    assert.equal(bas_math.status, "unavailable");
    assert.equal(bas_math.project_complete, false);
    assert.equal("physical_total" in bas_math, false);
    assert.deepEqual(legacy, compileTakeoff(null, graph, "bas_points"));
  } finally {
    if (previous === undefined) delete process.env.OPENTAKEOFF_BAS_PYTHON;
    else process.env.OPENTAKEOFF_BAS_PYTHON = previous;
  }
});

test("production CLI drains multi-megabyte UTF-8 JSON before explicit exit", async () => {
  const moduleUrl = new URL('../scripts/cliJson.mjs', import.meta.url).href;
  const actual = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      `import {writeJsonAndExit} from ${JSON.stringify(moduleUrl)}; setInterval(()=>{},1000); await writeJsonAndExit({text:'µ→'.repeat(1_000_000)});`]);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { child.kill(); reject(new Error('response did not finish')); }, 10000);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new Error(`exit ${code}`)); });
  });
  assert.equal(JSON.parse(actual).text, 'µ→'.repeat(1_000_000));
});

test("shared production wrapper leaves all legacy results and graph values unchanged", async () => {
  const graph = { available: true, sheets: [], tables: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  const before = JSON.stringify(graph);
  const legacy = compileTakeoff(null, graph, "bas_points");
  const result = await compileProductionTakeoff(null, graph, "bas_points");
  assert.ok("bas_math" in result);
  const { bas_math, ...compiled } = result;
  assert.deepEqual(compiled, legacy);
  assert.equal(bas_math.status, "review_required");
  assert.equal(JSON.stringify(graph), before);
  assert.deepEqual(await compileProductionTakeoff(null, graph, "hvac_equipment"), compileTakeoff(null, graph, "hvac_equipment"));
});

test("singular indexed POINT LIST is consumed without modifying graph or legacy title selection", async () => {
  const graph = { available: true, sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [], tables: [{
    sheet: "source.pdf#2", title: { text: "BAS INPUT/OUTPUT POINT LIST", bbox: [0, 0, 10, 10] },
    region: [0, 0, 100, 100], headers: ["TAG", "POINT NAME", "AI", "DO"],
    rows: [{ key: "1", cells: { "POINT NAME": { text: "Supply temperature", bbox: [1, 20, 40, 30] },
      AI: { text: "X", bbox: [50, 20, 60, 30] } } }],
  }] } as unknown as SheetGraph;
  const result = await compileProductionTakeoff(null, graph, "bas_points");
  assert.ok("bas_math" in result && "physical_total" in result.bas_math);
  assert.equal(result.bas_math.physical_total.AI, 1);
  assert.equal(result.bas_math.points[0].evidence[1].column, "AI");
  assert.deepEqual(result.bas_math.points[0].evidence[1].bbox_px, [50, 20, 60, 30]);
});
