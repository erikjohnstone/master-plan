// Real source, real MCP calls; source keys are audited separately. No mock graph.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { exportTakeoffOutput } from '../src/outputs.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const [pdf, priorFile, currentFile, directory] = process.argv.slice(2);
assert.ok(directory, 'Usage: PDF PRIOR_COMPILE CURRENT_CLI_COMPILE OUTPUT_DIRECTORY');
mkdirSync(directory, { recursive: true });
const prior = JSON.parse(readFileSync(priorFile)), current = JSON.parse(readFileSync(currentFile));
const { bas_workflow, ...oldFields } = current;
assert.deepEqual(oldFields, prior, 'Every pre-existing compile field, including all point evidence, must remain equal');
await verifyBasWorkflow(bas_workflow);
const session = new Session(), server = buildServer(session);
const client = new Client({ name: 'bas-workflow-verifier', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st); await client.connect(ct);
const start = performance.now();
async function call(name, args) {
  const reply = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(Boolean(reply.isError), false, JSON.stringify(reply.content));
  const value = JSON.parse(reply.content[0].text);
  assert.deepEqual(reply.structuredContent, value, `${name} structured/text parity`);
  return value;
}
let report;
try {
  await call('load_plan', { path: pdf });
  const compiled = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  assert.deepEqual(compiled, { ...current, path: null, export_path: null });
  const exportedFile = path.resolve(directory, 'mcp-takeoff.json');
  const exported = await call('export_takeoff', { path: exportedFile });
  assert.deepEqual(z.object(exportTakeoffOutput).parse(exported).bas_workflow, bas_workflow);
  assert.deepEqual(JSON.parse(readFileSync(exportedFile)).bas_workflow, bas_workflow);
  await call('load_plan', { path: pdf });
  assert.equal(session.basWorkflow, null);
  await call('import_takeoff', { path: exportedFile });
  const restored = await call('export_takeoff', {});
  assert.deepEqual(await verifyBasWorkflow(restored.bas_workflow), bas_workflow);
  await call('import_takeoff', { path: exportedFile });
  assert.equal(session.basWorkflow.captures.length, 1);
  report = { scope: 'Real Fort Sam CLI/MCP compile, export/reset/import parity. Not complete equipment/revision workflows.',
    prior_fields_exactly_unchanged: true, mcp_cli_exact_parity: true, real_export_reset_import: true,
    capture_id: bas_workflow.current_capture_id, matrices: bas_workflow.captures[0].points.matrices.length,
    elapsed_ms: Math.round(performance.now() - start), main_process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024 };
} finally { await client.close(); await server.close(); shutdownVectorGrid(); }
writeFileSync(path.join(directory, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
await writeJsonAndExit(report);
