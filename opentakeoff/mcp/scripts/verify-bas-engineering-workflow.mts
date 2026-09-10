/** Real PDF and ordinary browser evidence export through packaged public MCP.
 * The imported counterpart ratings are controlled inputs, not PDF detections. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { basEngineeringHeads, basEngineeringSummarySchema } from '../../web/src/lib/basEngineeringReview.ts';
import { basEngineeringReviewRequestSchema } from '../../web/src/lib/basEngineeringRegister.ts';
import { assertProofEqual as same } from './helpers/proofEquality.ts';

const [pdf, reviewedFile, output] = process.argv.slice(2);
assert.ok(pdf && reviewedFile && output, 'Usage: original PDF, browser engineering export, new evidence directory');
const original = await verifyBasWorkflow(JSON.parse(readFileSync(resolve(reviewedFile), 'utf8')).bas_workflow);
const sha = createHash('sha256').update(readFileSync(resolve(pdf))).digest('hex');
assert.ok(original.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const out = resolve(output); mkdirSync(out, { recursive: true });
const client = new Client({ name: 'bas-engineering-public-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
  cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
const started = performance.now(); let phase = 'initializing';
// Verification-only telemetry; do not change production memory limits or timings.
let stderrTail = Buffer.alloc(0), stderrBytes = 0;
transport.stderr?.on('data', chunk => {
  const bytes = Buffer.from(chunk); stderrBytes += bytes.length;
  stderrTail = Buffer.concat([stderrTail, bytes]).subarray(-65536);
});
const peakRssKb: Record<string, number> = {};
function sampleResources() {
  const elapsed_ms = Math.round(performance.now() - started);
  try {
    const pids = [process.pid, transport.pid].filter((pid): pid is number => pid !== null);
    const rows = execFileSync('ps', ['-o', 'pid=,ppid=,rss=,vsz=,%cpu=,etime=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 1000 })
      .trim().split('\n').filter(Boolean).map(line => {
        const [pid, ppid, rss_kb, virtual_kb, cpu_percent, elapsed] = line.trim().split(/\s+/);
        peakRssKb[pid] = Math.max(peakRssKb[pid] || 0, Number(rss_kb));
        return { pid: Number(pid), ppid: Number(ppid), rss_kb: Number(rss_kb), virtual_kb: Number(virtual_kb), cpu_percent: Number(cpu_percent), elapsed };
      });
    appendFileSync(resolve(out, 'resources.ndjson'), JSON.stringify({ elapsed_ms, phase, processes: rows, parent_heap: process.memoryUsage() }) + '\n');
  } catch (error) {
    appendFileSync(resolve(out, 'resources.ndjson'), JSON.stringify({ elapsed_ms, phase, observation_error: String(error) }) + '\n');
  }
  writeFileSync(resolve(out, 'stderr-tail.log'), stderrTail);
}
const monitor = setInterval(sampleResources, 1000); monitor.unref();
sampleResources();
async function call(name: string, args: Record<string, unknown>, expectedError = false) {
  phase = name; console.error(JSON.stringify({ phase, elapsed_ms: Math.round(performance.now() - started) }));
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
  assert.equal(!!response.isError, expectedError, JSON.stringify(response.content).slice(0, 2000));
  const content = response.content.find(c => c.type === 'text'); assert.ok(content && content.type === 'text');
  const data = JSON.parse(content.text);
  if (!expectedError) same(response.structuredContent, data, `${name} typed/text parity`);
  return data;
}
const compile = (args: Record<string, unknown> = {}, expectedError = false) => call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', ...args }, expectedError);
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const schema = listed.tools.find(t => t.name === 'compile_corpus_takeoff')!.inputSchema;
  assert.ok(schema.properties?.bas_engineering_review && schema.properties?.bas_engineering_inspect);
  await call('load_plan', { path: resolve(pdf) });
  await call('import_takeoff', { path: resolve(reviewedFile) });
  const initial = await compile();
  const current = initial.bas_workflow.captures.find((capture: { capture_id: string }) => capture.capture_id === initial.bas_workflow.current_capture_id);
  writeFileSync(resolve(out, 'compiled-capture.json'), JSON.stringify(current));
  same(initial.bas_workflow, original, 'Initial compile retained workflow');
  const savedSummary = basEngineeringSummarySchema.parse(initial.bas_engineering);
  assert.equal(savedSummary.calculation_verification, 'requires_python_replay');
  const inspected = await compile({ bas_engineering_inspect: { capture_id: original.current_capture_id } });
  assert.equal(basEngineeringSummarySchema.parse(inspected.bas_engineering).calculation_verification, 'verified_shared_python_replay');
  same(inspected.bas_workflow, original, 'Inspection retained workflow');
  const heads = basEngineeringHeads(original, original.current_capture_id!);
  const request = basEngineeringReviewRequestSchema.parse({ operation_id: randomUUID(), capture_id: original.current_capture_id,
    expected_head: heads.engineering, expected_equipment_head: heads.equipment, expected_assembly_head: heads.assembly,
    expected_sequence_head: heads.sequence, register: savedSummary.register,
    reason: 'Controlled public MCP confirmation of the browser-declared signal inputs; no new source interpretation or installed claim' });
  const reviewed = await compile({ bas_engineering_review: request });
  const summary = basEngineeringSummarySchema.parse(reviewed.bas_engineering);
  assert.equal(summary.event!.origin, 'agent_proposal');
  assert.equal(summary.calculation_verification, 'verified_shared_python_replay');
  assert.equal(summary.project_complete, false); assert.equal(summary.installed_quantity, null);
  same(summary.event!.result, savedSummary.event!.result, 'UI/MCP engineering outcomes');
  const updated = await verifyBasWorkflow(reviewed.bas_workflow);
  same(updated.engineering_events!.slice(0, -1), original.engineering_events, 'Retained engineering history');
  same(updated.captures, original.captures, 'Retained captures');
  same(updated.equipment_events, original.equipment_events, 'Equipment history'); same(updated.assembly_events, original.assembly_events, 'Assembly history');
  const legacy = (raw: unknown) => { const { bas_engineering: _engineering, bas_workflow: _workflow, ...rest } = z.record(z.unknown()).parse(raw); return rest; };
  same(legacy(reviewed), legacy(initial), 'Legacy output unchanged');
  same(await compile({ bas_engineering_review: request }), reviewed, 'Idempotent public retry');
  const foreign = structuredClone(request); foreign.operation_id = randomUUID(); foreign.expected_head = summary.event!.event_id;
  foreign.register.resources[0].source_span_ids = ['foreign-source-span'];
  await compile({ bas_engineering_review: foreign }, true);
  same((await compile()).bas_workflow, updated, 'Rejected foreign source preserves workflow');
  const file = resolve(out, 'reviewed.takeoff.json');
  const exported = await call('export_takeoff', { path: file });
  same(JSON.parse(readFileSync(file, 'utf8')), exported, 'Export file/response parity'); same(exported.bas_workflow, updated, 'Export retains workflow');
  await call('load_plan', { path: resolve(pdf) }); await call('import_takeoff', { path: file });
  const restored = await compile({ bas_engineering_inspect: { capture_id: updated.current_capture_id } });
  same(restored.bas_workflow, updated, 'Reimport/replay retains workflow');
  assert.equal(basEngineeringSummarySchema.parse(restored.bas_engineering).calculation_verification, 'verified_shared_python_replay');
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify({ ok: true, source_sha256: sha, elapsed_ms: Math.round(performance.now() - started),
    workflow_bytes: Buffer.byteLength(JSON.stringify(updated)), sampled_peak_rss_kb: peakRssKb, stderr_bytes: stderrBytes,
    checks: ['packaged public tool schemas', 'real original PDF', 'ordinary UI export import',
      'typed/text parity', 'shared Python replay', 'Agent proposal with exact UI result', 'original histories retained', 'idempotent retry',
      'foreign source rejected atomically', 'legacy output equality', 'public export/reset/import/replay'],
    limits: 'One real source-note case, controlled counterpart ratings. One-second sampled memory is a lower bound, not an exact peak. Not all rule-family documents, addenda or production completion.' }, null, 2));
} catch (error) {
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify({ ok: false, phase, error: String(error), sampled_peak_rss_kb: peakRssKb, stderr_bytes: stderrBytes }, null, 2)); throw error;
} finally { clearInterval(monitor); sampleResources(); await client.close(); }
