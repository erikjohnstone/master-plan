/** Controlled source declarations, not a real-PDF release assertion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from '../src/lib/basSnapshot.ts';
import { assessBasSnapshotCurrentness, evaluateBasSnapshotLifecycle,
  prepareBasSnapshotLifecycleEvent } from '../src/lib/basSnapshotLifecycle.ts';

async function fixture() {
  const f = await readinessFixture(), ready = await reviewReadyScope(f.workflow);
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: ready.workflow, shapes: [], project_name: 'Lifecycle fixture' };
  const io = { readSource: async () => f.bytes };
  const plan = await prepareBasSnapshotApproval(payload, { operation_id: uuid(950), scope_event_id: ready.scope.event_id,
    reviewer: 'Estimator', reason: 'Controlled scoped approval', declared_at: '2026-09-10T17:00:00.000Z' }, 'operator_input', io);
  return { ...f, ...ready, payload, io, plan, record: readBasSnapshotPlan(plan).record };
}
const request = (head: string, kind: 'revoke' | 'supersede' = 'revoke') => ({ operation_id: uuid(kind === 'revoke' ? 960 : 961),
  expected_head: head, reviewer: 'Estimator', reason: kind === 'revoke' ? 'Drawing issue found' : 'A newer reviewed deliverable replaces this one',
  declared_at: '2026-09-11T17:00:00.000Z', action: kind === 'revoke' ? { kind } as const
    : { kind, successor_snapshot_id: 'a'.repeat(64) } as const });

test('same verified scope is current until an append-only operator lifecycle event terminates it', async () => {
  const f = await fixture(), approved = await evaluateBasSnapshotLifecycle(f.record, []);
  assert.equal(approved.status, 'approved'); assert.equal(approved.head, f.record.seal.event_id);
  const current = await assessBasSnapshotCurrentness(f.plan, f.workflow, [], f.io);
  assert.equal(current.status, 'current_for_reviewed_scope'); assert.equal(current.readiness_status, 'ready_for_explicit_approval');
  assert.equal(current.project_complete, false); assert.equal(current.installed_quantity, null);
  const event = await prepareBasSnapshotLifecycleEvent(f.record, [], request(approved.head), 'operator_input');
  const revoked = await evaluateBasSnapshotLifecycle(f.record, [event]);
  assert.equal(revoked.status, 'revoked'); assert.equal(revoked.terminal_event?.declaration.reason, 'Drawing issue found');
  assert.equal((await assessBasSnapshotCurrentness(f.plan, f.workflow, [event], f.io)).status, 'not_current_lifecycle');
  assert.deepEqual(await prepareBasSnapshotLifecycleEvent(f.record, [event], request(approved.head), 'operator_input'), event,
    'Exact operation retry is idempotent even after the lifecycle becomes terminal');
});

test('supersession retains the successor identity and stale/agent/forged actions refuse', async () => {
  const f = await fixture(), head = f.record.seal.event_id;
  const event = await prepareBasSnapshotLifecycleEvent(f.record, [], request(head, 'supersede'), 'operator_input');
  const state = await evaluateBasSnapshotLifecycle(f.record, [event]);
  assert.equal(state.status, 'superseded'); assert.equal(state.successor_snapshot_id, 'a'.repeat(64));
  await assert.rejects(prepareBasSnapshotLifecycleEvent(f.record, [], request('b'.repeat(64)), 'operator_input'), /changed/);
  await assert.rejects(prepareBasSnapshotLifecycleEvent(f.record, [], request(head), 'agent_proposal'), /explicit operator/);
  await assert.rejects(prepareBasSnapshotLifecycleEvent(f.record, [event], { ...request(head, 'supersede'), reason: 'Reused differently' }, 'operator_input'), /reused/);
  const forged = structuredClone(event); forged.declaration.reason = 'Changed without rehashing';
  await assert.rejects(evaluateBasSnapshotLifecycle(f.record, [forged]), /identity mismatch/);
  await assert.rejects(evaluateBasSnapshotLifecycle(f.record, [event, event]), /chain|Duplicate|terminal/);
});

test('currentness becomes explicitly not-current when the saved scope is absent from today workflow', async () => {
  const f = await fixture();
  const older = structuredClone(f.workflow); older.scope_events = [];
  // Revision is part of schema enforcement, so use another valid workflow that
  // never contained this scope rather than manufacturing a broken history.
  const unrelated = (await readinessFixture()).workflow;
  const result = await assessBasSnapshotCurrentness(f.plan, unrelated, [], f.io);
  assert.equal(result.status, 'not_current_working_scope');
  assert.equal(result.readiness_status, 'not_run');
  assert.deepEqual(result.blocker_codes, ['scope_event_not_retained_current_workspace']);
  assert.ok(older.scope_events?.length === 0);
});
