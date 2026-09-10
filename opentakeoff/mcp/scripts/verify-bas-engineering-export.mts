/** Real original PDF + ordinary browser archive through packaged public MCP.
 * This checks export parity, not new source interpretation or installed proof. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertProofEqual as same } from './helpers/proofEquality.ts';
const { unzipSync, strFromU8 } = createRequire(new URL('../../web/package.json', import.meta.url))('fflate');
const [pdf, archive, browserWorkbook, output] = process.argv.slice(2);
assert.ok(pdf && archive && browserWorkbook && output);
const out = resolve(output); assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const expected = JSON.parse(readFileSync(resolve(archive), 'utf8')).bas_workflow;
const sha = createHash('sha256').update(readFileSync(resolve(pdf))).digest('hex');
assert.ok(expected.captures.some((c: { sources: { sha256: string }[] }) => c.sources.some(s => s.sha256 === sha)));
const client = new Client({ name: 'engineering-workbook-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
  cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
const started = performance.now();
async function call(name: string, args: Record<string, unknown> = {}, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 2000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  return JSON.parse(text.text);
}
try {
  await client.connect(transport);
  await call('load_plan', { path: resolve(pdf) }); await call('import_takeoff', { path: resolve(archive) });
  const baseline = await call('export_takeoff'); same(baseline.bas_workflow, expected, 'Retained original history');
  const target = resolve(out, 'engineering-review.xlsx');
  const result = await call('export_takeoff', { engineering_workbook_path: target });
  same(result, baseline, 'Unchanged inline annotation payload');
  same(await call('export_takeoff'), baseline, 'Unchanged session after export');
  const actual = unzipSync(readFileSync(target)), browser = unzipSync(readFileSync(resolve(browserWorkbook)));
  same(Object.keys(actual), Object.keys(browser), 'Identical workbook parts');
  for (const key of Object.keys(actual)) assert.equal(strFromU8(actual[key]), strFromU8(browser[key]), key);
  const prior = readFileSync(target); await call('export_takeoff', { engineering_workbook_path: target }, true);
  assert.deepEqual(readFileSync(target), prior);
  const checks = { pdf_sha256: sha, exact_workbook_parts: Object.keys(actual).length, bytes: prior.length,
    saved_history_unchanged: true, legacy_inline_unchanged: true, existing_workbook_protected: true, duration_ms: Math.round(performance.now() - started) };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(checks, null, 2)); console.log(JSON.stringify(checks));
} catch (error) { writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stderr }, null, 2)); throw error; }
finally { await client.close(); await transport.close(); writeFileSync(resolve(out, 'stderr.log'), stderr); }
