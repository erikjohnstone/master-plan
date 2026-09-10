/** Actual HTTP/CLI/Python over controlled source-shaped revisions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { basRevisionMiddleware, basAssignmentMiddleware } from '../../web/vite.basAssignmentApi.js';
import { Readable } from 'node:stream';
import { resolveTsxLoader } from '../../web/vite.corpusTakeoffApi.js';
import { comparisonFixture } from '../../web/test/helpers/basRevisionComparisonFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { assertBasRevisionResponse, basRevisionResponseSchema, type BasRevisionOperation } from '../../web/src/lib/basRevisionOperations.ts';
import { runBasRevisionOperation } from '../src/basRevisionOperations.ts';

test('actual revision HTTP service saves/reopens exact comparison, preserves sources and binds responses', async () => {
  const f = await comparisonFixture({ ai: 4, variable: 'RETURN AIR TEMPERATURE' }), before = structuredClone(f.workflow);
  const middleware = basRevisionMiddleware(resolveTsxLoader), server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ot/bas-revision`;
  const post = (workflow: unknown, request: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow, request }) });
  try {
    const inventoryOp: BasRevisionOperation = { kind: 'inventory', basis: f.request.before };
    const inventory = await post(f.workflow, inventoryOp); assert.equal(inventory.status, 200);
    assert.deepEqual(await assertBasRevisionResponse(f.workflow, inventoryOp, await inventory.json()), await runBasRevisionOperation(f.workflow, inventoryOp, 'operator_input'));
    const operation: BasRevisionOperation = { kind: 'compare', comparison: f.request };
    const previewReply = await post(f.workflow, operation); assert.equal(previewReply.status, 200);
    const preview = await assertBasRevisionResponse(f.workflow, operation, await previewReply.json());
    if (preview.kind !== 'compare') throw new Error('Expected comparison');
    assert.deepEqual(preview, await runBasRevisionOperation(f.workflow, operation, 'operator_input'));
    const record: BasRevisionOperation = { kind: 'record', review: { operation_id: uuid(900), comparison: preview.comparison,
      expected_head: preview.expected_head, expected_report_fingerprint: preview.expected_report_fingerprint,
      name: 'Controlled HTTP revision', reviewer: 'Self-declared HTTP reviewer', reason: 'Explicit source-shaped fixture correspondence' } };
    const reply = await post(f.workflow, record); assert.equal(reply.status, 200);
    const saved = await assertBasRevisionResponse(f.workflow, record, await reply.json());
    if (saved.kind !== 'record') throw new Error('Expected saved review');
    assert.deepEqual(saved.workflow.captures, before.captures); assert.deepEqual(f.workflow, before);
    assert.equal(saved.event.origin, 'operator_input'); assert.equal(saved.event.approved, false);
    const read: BasRevisionOperation = { kind: 'read', event_id: saved.event.event_id };
    const reopenedReply = await post(saved.workflow, read); assert.equal(reopenedReply.status, 200);
    const reopened = await assertBasRevisionResponse(saved.workflow, read, await reopenedReply.json());
    if (reopened.kind !== 'read') throw new Error('Expected reopened review');
    assert.deepEqual(reopened.report, preview.report); assert.equal(reopened.report_verification, 'matches_saved_report');
    const retryReply = await post(saved.workflow, record); assert.equal(retryReply.status, 200);
    assert.deepEqual(basRevisionResponseSchema.parse(await retryReply.json()), saved);
    await assert.rejects(assertBasRevisionResponse(f.workflow, operation, { ...preview, expected_head: 'f'.repeat(64) }), /head/);
    const wrong = structuredClone(preview); wrong.report.rows[0].reason = 'Changed response';
    await assert.rejects(assertBasRevisionResponse(f.workflow, operation, wrong), /fingerprint/);
    await assert.rejects(assertBasRevisionResponse(f.workflow, record, { ...saved, workflow: { ...saved.workflow, current_capture_id: null } }), /omitted retained/);
    await assert.rejects(assertBasRevisionResponse(saved.workflow, read, { ...reopened, report_verification: 'different_from_saved_report' }), /concealed/);
    const sourceChanged = structuredClone(f.workflow); sourceChanged.captures[0].narrative_sources!.pages[0].spans[0].text += ' changed';
    assert.equal((await post(sourceChanged, operation)).status, 422);
    assert.equal((await post(f.workflow, { kind: 'compare', comparison: f.request, arbitrary_result: {} })).status, 422);
    assert.equal((await fetch(url)).status, 405);
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('revision-only transport preserves the old 32 MiB limit and rejects bodies beyond 128 MiB before spawning', async () => {
  const block = Buffer.alloc(64 * 1024);
  for (const [factory, kind, mib] of [[basRevisionMiddleware, 'revision', 128], [basAssignmentMiddleware, 'assignment-demand', 32]] as const) {
    const req = Object.assign(Readable.from(Array.from({ length: mib * 16 + 1 }, () => block)), {
      url: `/__ot/bas-${kind}`, method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost' },
    });
    let status = 0, body = '', spawned = false;
    const res = { destroyed: false, writeHead(code: number) { status = code; }, end(value: string) { body = value; } };
    await factory(() => { spawned = true; throw new Error('Oversized input must not spawn'); })(req, res, () => { throw new Error('Route skipped'); });
    assert.equal(status, 413); assert.match(JSON.parse(body).error, new RegExp(`exceeds ${mib} MiB`)); assert.equal(spawned, false);
  }
});
