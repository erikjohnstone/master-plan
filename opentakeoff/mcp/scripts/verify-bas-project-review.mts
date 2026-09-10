/** Packaged public MCP against the original PDF and ordinary browser archive.
 * Default compile parity, exact shared/browser finding export and retained state. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertProofEqual as same } from './helpers/proofEquality.ts';
import { basProjectReview } from '../../web/src/lib/basProjectReview.ts';
const [pdf, archive, browserFindings, output] = process.argv.slice(2);
assert.ok(pdf && archive && browserFindings && output);
const out = resolve(output); assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const original = JSON.parse(readFileSync(resolve(archive), 'utf8')).bas_workflow;
const sha = createHash('sha256').update(readFileSync(resolve(pdf))).digest('hex');
assert.ok(original.captures.some((c: { sources: { sha256: string }[] }) => c.sources.some(s => s.sha256 === sha)));
const client = new Client({ name: 'bas-project-review-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
  cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
const started = performance.now();
async function call(name: string, args: Record<string, unknown> = {}, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 2000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  const parsed = JSON.parse(text.text);
  if (response.structuredContent) same(response.structuredContent, parsed, `${name} structured/text parity`);
  return parsed;
}
try {
  await client.connect(transport);
  await call('load_plan', { path: resolve(pdf) }); await call('import_takeoff', { path: resolve(archive) });
  const imported = await call('export_takeoff'); same(imported.bas_workflow, original, 'Retained imported history');
  const baseline = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  assert.equal('bas_project_review' in baseline, false);
  const retained = await call('export_takeoff');
  const reviewStarted = performance.now();
  const inspected = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_project_review: { capture_id: original.current_capture_id } });
  const inspectMs = Math.round(performance.now() - reviewStarted);
  const { bas_project_review: findings, ...existing } = inspected;
  same(existing, baseline, 'Every existing compile output remains identical');
  same(findings, await basProjectReview(retained.bas_workflow, original.current_capture_id), 'Shared projection');
  same(findings, JSON.parse(readFileSync(resolve(browserFindings), 'utf8')), 'Browser/public MCP exact queue');
  same(await call('export_takeoff'), retained, 'Opt-in read preserves Session state');
  await call('compile_corpus_takeoff', { kind: 'bas_points', bas_project_review: { capture_id: '0'.repeat(64) } }, true);
  same(await call('export_takeoff'), retained, 'Foreign capture rejection preserves state');
  writeFileSync(resolve(out, 'findings.json'), JSON.stringify(findings, null, 2));
  const result = { pdf_sha256: sha, findings: findings.issues.length, original_capture_unchanged: true,
    browser_mcp_parity: true, legacy_compile_parity: true, foreign_capture_rejected: true, inspect_ms: inspectMs, duration_ms: Math.round(performance.now() - started) };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) { writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stderr }, null, 2)); throw error; }
finally { await client.close(); await transport.close(); writeFileSync(resolve(out, 'stderr.log'), stderr); }
