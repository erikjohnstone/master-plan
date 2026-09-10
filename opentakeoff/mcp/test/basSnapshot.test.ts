/** Actual shared Python verification, controlled source data; not public-MCP/UI proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from '../../web/test/helpers/basReadinessFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { verifyBasWorkflowCalculations } from '../src/basWorkflowReplay.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan, verifyBasSnapshot } from '../../web/src/lib/basSnapshot.ts';
import { prepareBasSnapshotBundle, openBasSnapshotBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';

test('engineering snapshot requires actual Python on creation and archive reopen, preserving exact checked records', async () => {
  const f = await readinessFixture(), checked = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  const r = await reviewReadyScope(checked.workflow, [{ claim: 'engineering_compatibility', capture_id: checked.workflow.current_capture_id!, subject_id: 'signal-check' }]);
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', shapes: [], bas_workflow: r.workflow };
  const request = { operation_id: uuid(997), scope_event_id: r.scope.event_id, reviewer: 'Controlled engineering reviewer',
    reason: 'Only this evidenced declared compatibility constraint', declared_at: '2026-09-10T17:00:00.000Z' };
  let calls = 0;
  const replayCalculations = async (w: BasWorkflow, signal?: AbortSignal) => { calls++; return verifyBasWorkflowCalculations(w, { signal }); };
  await assert.rejects(prepareBasSnapshotApproval(payload, request, 'operator_input', { readSource: async () => f.bytes }), /actual_python_replay_required/);
  const plan = await prepareBasSnapshotApproval(payload, request, 'operator_input', { readSource: async () => f.bytes, replayCalculations });
  assert.equal(calls, 1);
  const owned = readBasSnapshotPlan(plan), readiness = JSON.parse(owned.record.snapshot.readiness_json);
  assert.deepEqual(readiness.replay.checked_records.engineering, [checked.event.event_id]);
  assert.equal(readiness.replay.calculation_verification, 'verified_shared_python_replay');
  const chunks = []; for await (const chunk of (await prepareBasSnapshotBundle(plan)).stream(async () => f.bytes)) chunks.push(chunk);
  const bytes = Buffer.concat(chunks), reader = { size: bytes.length, read: async (o: number, n: number) => bytes.subarray(o, o + n) };
  await assert.rejects(openBasSnapshotBundle(reader), /does not replay exactly/);
  const reopened = await openBasSnapshotBundle(reader, { replayCalculations });
  assert.equal(calls, 2); assert.equal(reopened.plan.snapshot_id, plan.snapshot_id);
  await assert.rejects(verifyBasSnapshot(payload, owned.record, { readSource: async () => f.bytes,
    replayCalculations: async () => { throw new Error('Python unavailable during reopen'); } }), /Python unavailable/);
  await assert.rejects(openBasSnapshotBundle(reader, { replayCalculations: async () => ({ ...readiness.replay, workflow_sha256: 'e'.repeat(64) }) }), /exact saved workflow/);
});
