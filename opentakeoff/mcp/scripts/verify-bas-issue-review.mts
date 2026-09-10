/** Packaged public MCP, exact real-PDF/browser-history replay and process restart. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertProofEqual as same } from './helpers/proofEquality.ts';
import { inspectBasIssueReview, readBasIssueDecision } from '../../web/src/lib/basIssueReview.ts';
import { basIssueTransportResultSchema } from '../../web/src/lib/basIssueTransportContract.ts';
const [pdf, archive, browserReplay, output] = process.argv.slice(2);
assert.ok(pdf && archive && browserReplay && output);
const out = resolve(output); assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const original = JSON.parse(readFileSync(resolve(archive), 'utf8')).bas_workflow;
const browser = JSON.parse(readFileSync(resolve(browserReplay), 'utf8'));
const timings: Record<string, number> = {}, checks: string[] = [];
async function connection() {
  const client = new Client({ name: 'bas-issue-public-proof', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
    cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}, expectError = false) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
    assert.equal(!!response.isError, expectError, JSON.stringify(response.content).slice(0, 2000));
    const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
    const parsed = JSON.parse(text.text);
    if (response.structuredContent) same(response.structuredContent, parsed, `${name} text/structured parity`);
    return parsed;
  };
  const issue = async (command: Record<string, unknown>, key?: string) => {
    const start = performance.now(), result = basIssueTransportResultSchema.parse((await call('bas_issue_review', { command })).result);
    if (key) timings[key] = Math.round(performance.now() - start); return result;
  };
  return { client, call, issue, close: async () => { await client.close(); await transport.close(); return stderr; } };
}
let c = await connection();
try {
  await c.call('load_plan', { path: resolve(pdf) }); await c.call('import_takeoff', { path: resolve(archive) });
  same((await c.call('export_takeoff')).bas_workflow, original, 'Ordinary import preserves browser history');
  const inspection = await c.issue({ action: 'inspect', query: { path: ['project_review', 'issues'], limit: 2 } }, 'inspect_ms');
  const shared = await inspectBasIssueReview(original, original.current_capture_id);
  assert.equal(inspection.page!.total, shared.project_review.issues.length);
  const replay = await c.issue({ action: 'replay', event_id: browser.decision.event_id }, 'replay_ms');
  await c.issue({ action: 'export', view_id: replay.view_id, path: resolve(out, 'historical-replay.json') });
  const expected = await readBasIssueDecision(original, browser.decision.event_id), exported = JSON.parse(readFileSync(resolve(out, 'historical-replay.json'), 'utf8'));
  same(exported, expected, 'Built MCP/shared exact full replay');
  same(exported.original_finding, browser.original_finding, 'Browser/MCP identical original evidence');
  same(exported.reviewed_change, browser.reviewed_change, 'Browser/MCP identical pinned absence inputs');
  const evidence = exported.original_finding.evidence.find((e: { bbox_px: unknown }) => e.bbox_px);
  const [x0, y0, x1, y1] = evidence.bbox_px;
  const image = await c.client.callTool({ name: 'view_sheet', arguments: { sheet: evidence.page_id, original_pdf_path: resolve(pdf), region: { x0, y0, x1, y1 }, px: 1200 } });
  assert.equal(image.isError, undefined, JSON.stringify(image.content).slice(0, 1000));
  const png = image.content.find(e => e.type === 'image'); assert.ok(png?.type === 'image');
  writeFileSync(resolve(out, 'original-source.png'), Buffer.from(png.data, 'base64'));
  same((await c.call('export_takeoff')).bas_workflow, original, 'Source read does not mutate or activate history');
  const finding = shared.project_review.issues[0];
  const request = { operation_id: randomUUID(), capture_id: inspection.capture_id, expected_head: inspection.head, expected_basis: inspection.basis,
    reviewer: 'Controlled MCP proposal', reason: 'Public packaged observation, not human approval',
    action: { kind: 'acknowledge', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } };
  const record = await c.issue({ action: 'record', request }, 'record_ms');
  const after = (await c.call('export_takeoff', { path: resolve(out, 'saved.takeoff.json') })).bas_workflow;
  assert.equal(after.issue_events.at(-1).origin, 'agent_proposal'); same(after.captures, original.captures, 'Sources remain exact');
  assert.equal((await c.issue({ action: 'record', request })).event_id, record.event_id);
  await c.call('bas_issue_review', { command: { action: 'record', request: { ...request, operation_id: randomUUID() } } }, true);
  same((await c.call('export_takeoff')).bas_workflow, after, 'Retry and stale rejection preserve state');
  writeFileSync(resolve(out, 'first-stderr.log'), await c.close()); c = await connection();
  await c.call('load_plan', { path: resolve(pdf) }); await c.call('import_takeoff', { path: resolve(out, 'saved.takeoff.json') });
  same((await c.call('export_takeoff')).bas_workflow, after, 'New process ordinary recovery');
  const reopened = await c.issue({ action: 'replay', event_id: record.event_id }, 'reopen_ms');
  assert.equal(reopened.verification, 'shared_projection_replayed');
  for (const value of Object.values(timings)) assert.ok(value < 10000, 'Public single issue operation < 10 seconds');
  checks.push('Built public tool; ordinary real-PDF/history import; bounded read; exact browser/shared historical evidence and absence; source-byte view; proposal/retry/stale rejection; full export; new process recovery');
  const proof = { checks, timings, browser_original_evidence_equal: true, historical_absence_equal: true,
    final_events: after.issue_events.length, no_extraction_or_installed_count_claim: true };
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) { writeFileSync(resolve(out, 'failure.txt'), String(error)); throw error; }
finally { writeFileSync(resolve(out, 'stderr.log'), await c.close()); }
