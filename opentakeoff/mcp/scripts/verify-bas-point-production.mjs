// Read-only real MCP/CLI parity diagnostic. Does not construct expected counts
// from production output: independent point-matrix/source keys are audited
// separately. Never writes the input PDF, keys, graph or Session annotations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { compileCorpusTakeoffOutput } from '../src/outputs.ts';
import { writeJsonAndExit } from './cliJson.mjs';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';

const [pdf, previousPath, currentPath, reportPath] = process.argv.slice(2);
if (!reportPath) throw new Error('usage: verify-bas-point-production.mjs PDF PREVIOUS_COMPILE CURRENT_CLI_COMPILE REPORT');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const previous = read(previousPath), current = read(currentPath);
const { bas_point_lists: newRecord, ...priorFields } = current;
assert.deepEqual(priorFields, previous, 'Every legacy and bas_math field must remain unchanged');
const session = new Session(), server = buildServer(session);
const client = new Client({ name: 'bas-point-parity-audit', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair();
const start = performance.now();
await server.connect(st);
await client.connect(ct);
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(Boolean(result.isError), false, name);
  assert.equal(result.content.length, 1);
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, data, 'MCP text/structuredContent parity');
  return data;
}
let report;
try {
  await call('load_plan', { path: pdf });
  const sources = session.basSourcesForPipeline();
  const result = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  assert.deepEqual(z.object(compileCorpusTakeoffOutput).parse(result), result);
  // The existing MCP envelope explicitly returns null output destinations;
  // CLI has no corresponding path fields. Assert that exact known distinction.
  assert.deepEqual(result, { ...current, path: null, export_path: null },
    'Real MCP and production CLI must return the same complete result plus the existing MCP destination envelope');
  assert.ok(newRecord && 'matrices' in newRecord, 'An unavailable observer is not a pass');
  const pages = new Map(sources.pages.map(p => [p.page_id, p]));
  let notes = 0, observations = 0;
  for (const matrix of newRecord.matrices) {
    const page = pages.get(matrix.page_id);
    assert.ok(page && page.source_id === matrix.source_id && page.sheet_keys.includes(matrix.raw.sheet));
    for (const note of matrix.notes) {
      const span = page.spans.find(s => s.span_id === note.source.span_id);
      assert.ok(span, 'Every footnote must address an actual retained source span');
      assert.equal(span.text, note.source.text);
      assert.deepEqual(span.bbox_px, note.source.bbox_px);
      notes++;
    }
    observations += matrix.rows.reduce((n, r) => n + r.observations.length, 0);
  }
  report = { scope: 'Real MCP/CLI parity and source-span grounding. Independent matrix keys are a separate audit; no installed quantity or workflow completion claim.',
    source_sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
    legacy_and_math_exactly_unchanged: true, mcp_cli_payload_exact_parity: true,
    mcp_only_fields: { path: null, export_path: null },
    matrices: newRecord.matrices.length, listed_rows: newRecord.matrices.reduce((n, m) => n + m.rows.length, 0),
    observations, verified_note_spans: notes, project_complete: newRecord.project_complete,
    elapsed_ms: Math.round(performance.now() - start), rss_bytes: process.resourceUsage().maxRSS * 1024 };
} finally {
  await client.close(); await server.close(); shutdownVectorGrid();
}
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
await writeJsonAndExit(report);
