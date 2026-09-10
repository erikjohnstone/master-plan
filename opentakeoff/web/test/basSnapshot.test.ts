/** Controlled source declarations, not independent real-PDF takeoff accuracy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan, verifyBasSnapshot, basSnapshotRecordSchema } from '../src/lib/basSnapshot.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';
import { basSourceInventory } from '../src/lib/basSourceRetention.ts';
import { assertBasWorkflowReplayReceipt, prepareBasWorkflowReplay } from '../src/lib/basWorkflowReplay.ts';

const request = (scope: string) => ({ operation_id: uuid(950), scope_event_id: scope, reviewer: 'Estimator — controlled test',
  reason: 'Approve only the scheduled equipment scope explicitly reviewed here', declared_at: '2026-09-10T17:00:00.000Z' });
const hash = (v: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(v)));
async function fixture() {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow);
  return { ...f, ...r, payload: { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: r.workflow,
    shapes: [], project_name: 'Exact snapshot 雪', retained_extra: { value: 0, missing: null } },
    io: { readSource: async () => f.bytes } };
}
async function rehash(raw: unknown) {
  const r = basSnapshotRecordSchema.parse(raw); r.snapshot_id = await hash(r.snapshot); r.seal.snapshot_id = r.snapshot_id;
  const { event_id: _id, ...body } = r.seal; r.seal.event_id = await hash(body); return r;
}

test('explicit positive scope prepares deterministic owned snapshot, exact payload and separate seal without writes', async () => {
  const f = await fixture(), before = canonicalBasJson(f.payload), req = request(f.scope.event_id);
  const p = await prepareBasSnapshotApproval(f.payload, req, 'operator_input', f.io), owned = readBasSnapshotPlan(p);
  assert.equal(owned.payload_json, before); assert.equal(canonicalBasJson(f.payload), before);
  assert.equal(owned.committed, false); assert.equal(owned.current_working_state, 'not_evaluated');
  assert.equal(owned.record.snapshot.declaration.reviewer, req.reviewer);
  assert.equal(owned.record.snapshot.project_complete, false); assert.equal(owned.record.snapshot.installed_quantity, null);
  const readiness = JSON.parse(owned.record.snapshot.readiness_json);
  assert.ok(readiness.issues.some((i: { scope: string }) => i.scope === 'outside_included_claims'));
  assert.equal(readiness.approved, false, 'readiness preview was not rewritten to pretend it is a seal');
  assert.equal(owned.record.seal.snapshot_id, p.snapshot_id); assert.equal(owned.record.seal.previous_event_id, null);
  assert.deepEqual(readBasSnapshotPlan(await prepareBasSnapshotApproval(f.payload, req, 'operator_input', f.io)), owned);
  const reopened = readBasSnapshotPlan(await verifyBasSnapshot(f.payload, owned.record, f.io));
  assert.deepEqual(reopened.record, owned.record); assert.equal(reopened.mode, 'reopen');
});

test('agent origin, blank/invalid declarations and supplied authority flags refuse', async () => {
  const f = await fixture(), req = request(f.scope.event_id);
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'agent_proposal', f.io), /explicit operator/);
  for (const change of [{ reviewer: '  ' }, { reason: '' }, { declared_at: 'not-a-time' }, { operation_id: 'bad' },
    { approved: true }, { readiness: { status: 'ready_for_explicit_approval' } }])
    await assert.rejects(prepareBasSnapshotApproval(f.payload, { ...req, ...change }, 'operator_input', f.io));
});

test('missing/wrong originals, blockers and failed replay cannot create a plan', async () => {
  const f = await fixture(), req = request(f.scope.event_id);
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'operator_input'), /blocked.*original_source_unavailable/);
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'operator_input', { readSource: async () => new Uint8Array(f.bytes.length) }), /digest mismatch/);
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'operator_input', { ...f.io,
    replayCalculations: async () => { throw new Error('Actual Python failed'); } }), /Actual Python failed/);
  const blocked = await reviewReadyScope(f.workflow, [{ claim: 'responsibilities', capture_id: f.workflow.current_capture_id!, subject_id: uuid(30) }], 980);
  await assert.rejects(prepareBasSnapshotApproval({ ...f.payload, bas_workflow: blocked.workflow }, request(blocked.scope.event_id), 'operator_input', f.io), /blocked/);
});

test('caller mutation, counterfeit plans and cancellation cannot change or revive owned authority', async () => {
  const f = await fixture(), controller = new AbortController(), req = request(f.scope.event_id), before = canonicalBasJson(f.payload);
  const pending = prepareBasSnapshotApproval(f.payload, req, 'operator_input', f.io, controller.signal);
  req.reviewer = 'Later mutation'; f.payload.project_name = 'Later mutation';
  const plan = await pending, owned = readBasSnapshotPlan(plan);
  assert.equal(owned.payload_json, before); assert.notEqual(owned.record.snapshot.declaration.reviewer, req.reviewer);
  owned.record.snapshot.readiness_json = '{}';
  assert.notEqual(readBasSnapshotPlan(plan).record.snapshot.readiness_json, '{}');
  assert.throws(() => readBasSnapshotPlan({ ...plan }), /owned, freshly verified/);
  controller.abort(); assert.throws(() => readBasSnapshotPlan(plan), /abort/i);
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'operator_input', f.io, controller.signal), /abort/i);
  const late = new AbortController();
  await assert.rejects(prepareBasSnapshotApproval(f.payload, req, 'operator_input', { readSource: async () => { late.abort(); return f.bytes; } }, late.signal), /abort/i);
});

test('altered payload, seal, rule and false readiness with fully recomputed hashes cannot verify', async () => {
  const f = await fixture(), owned = readBasSnapshotPlan(await prepareBasSnapshotApproval(f.payload, request(f.scope.event_id), 'operator_input', f.io));
  await assert.rejects(verifyBasSnapshot({ ...f.payload, project_name: 'Changed' }, owned.record, f.io), /hash\/length/);
  const badSeal = structuredClone(owned.record); badSeal.seal.declaration.reason = 'Tampered';
  await assert.rejects(verifyBasSnapshot(f.payload, badSeal, f.io), /identity mismatch/);
  const forged = structuredClone(owned.record), readiness = JSON.parse(forged.snapshot.readiness_json);
  readiness.issues = []; forged.snapshot.readiness_json = canonicalBasJson(readiness);
  await assert.rejects(verifyBasSnapshot(f.payload, await rehash(forged), f.io), /does not replay exactly/);
  const future = { ...owned.record, snapshot: { ...owned.record.snapshot, readiness_rule: 'future_rule' } };
  await assert.rejects(verifyBasSnapshot(f.payload, future, f.io));
  await assert.rejects(verifyBasSnapshot(f.payload, owned.record), /does not replay exactly/);
});

test('composed readiness retains full public source/replay identity gates without repeated history clones', async () => {
  const f = await fixture(), owned = readBasSnapshotPlan(await prepareBasSnapshotApproval(f.payload, request(f.scope.event_id), 'operator_input', f.io));
  const readiness = JSON.parse(owned.record.snapshot.readiness_json);
  assert.deepEqual(readiness.sources.map((s: { source: unknown }) => s.source), (await basSourceInventory(f.workflow)).map(i => i.source));
  assert.deepEqual(await assertBasWorkflowReplayReceipt(f.workflow, readiness.replay), readiness.replay);
  const corrupt = structuredClone(f.workflow); corrupt.captures[0].points.issues.push('Changed original evidence');
  await assert.rejects(basSourceInventory(corrupt), /fingerprint mismatch/);
  await assert.rejects(prepareBasWorkflowReplay(corrupt), /fingerprint mismatch/);
  await assert.rejects(assertBasWorkflowReplayReceipt(corrupt, readiness.replay), /fingerprint mismatch/);
});
