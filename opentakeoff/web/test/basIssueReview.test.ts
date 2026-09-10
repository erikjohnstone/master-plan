/** Shared deterministic issue history. Controlled decisions, not installed GT. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { applyBasIssueReview, inspectBasIssueReview, readBasIssueDecision, basIssueHead } from '../src/lib/basIssueReview.ts';
import { currentBasIssueBasis, selectBasIssueWorkflow } from '../src/lib/basIssueBasis.ts';
import { basIssueReviewRequestSchema, basIssueReviewEventSchema, assertBasIssueJournalBytes } from '../src/lib/basIssueReviewContract.ts';
import { basWorkflowSchema, verifyBasWorkflow, basEventFingerprint, mergeBasWorkflows, retainBasWorkflowHistory, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import type { BasEquipmentRegister } from '../src/lib/basEquipmentRegister.ts';
import { revisionFixture } from './helpers/basRevisionFixture.ts';

const at = { createdAt: '2026-09-10T12:00:00.000Z' };
const request = (w: BasWorkflow, n: number, action: unknown) => ({ operation_id: uuid(n), capture_id: w.current_capture_id!,
  expected_head: basIssueHead(w, w.current_capture_id!), expected_basis: currentBasIssueBasis(w, w.current_capture_id!),
  reviewer: 'Controlled self-declared reviewer', reason: 'Controlled issue review, not a waiver', action });
async function unknownScope() {
  const f = await engineeringFixture();
  const register: BasEquipmentRegister = structuredClone(f.equipment); register.scopes[0].building = null;
  const workflow = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(100), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.equipment_events!.at(-1)!.event_id, reason: 'Controlled unknown scope', register }, 'operator_input');
  const finding = (await basProjectReview(workflow, workflow.current_capture_id!)).issues.find(i => i.code === 'scope_partly_unknown')!;
  assert.ok(finding); return { ...f, workflow, register, finding };
}
async function changeScope(w: BasWorkflow, n: number, patch: { building?: string | null; system?: string }) {
  const register = structuredClone(w.equipment_events!.at(-1)!.register); Object.assign(register.scopes[0], patch);
  return applyBasEquipmentReview(w, { operation_id: uuid(n), capture_id: w.current_capture_id,
    expected_head: w.equipment_events!.at(-1)!.event_id, register, reason: 'Controlled actual scope edit' }, 'operator_input');
}
const observe = (kind: 'acknowledge' | 'begin_correction', i: { issue_key: string; occurrence_id: string }) =>
  ({ kind, issue_key: i.issue_key, occurrence_id: i.occurrence_id });

test('acknowledgement is append-only awareness; all findings, blockers and source values remain unchanged', async () => {
  const f = await unknownScope(), original = structuredClone(f.workflow);
  const before = await basProjectReview(f.workflow, f.workflow.current_capture_id!);
  const saved = await applyBasIssueReview(f.workflow, request(f.workflow, 101, observe('acknowledge', f.finding)), 'operator_input', at);
  assert.equal(saved.workflow.revision, 'bas_issues_9'); assert.equal(saved.event.approved, false);
  assert.equal(saved.event.reviewer_identity, 'self_declared');
  const inspect = await inspectBasIssueReview(saved.workflow, saved.workflow.current_capture_id!);
  assert.deepEqual(inspect.project_review, before); assert.equal(inspect.approved, false);
  assert.equal(inspect.decisions[0].state, 'acknowledged_current_occurrence');
  assert.equal(inspect.history_verification, 'lineage_only');
  const read = await readBasIssueDecision(saved.workflow, saved.event.event_id);
  assert.deepEqual(read.original_finding, f.finding); assert.deepEqual(read.current_findings, [f.finding]);
  assert.equal(read.current_state, 'same_occurrence'); assert.equal(read.reviewed_change, null);
  assert.equal(read.source_availability, 'not_byte_verified'); assert.equal(read.project_complete, false);
  assert.deepEqual(f.workflow, original); assert.deepEqual(saved.workflow.captures, original.captures);
});

test('actual correction, confirmed absence, historic replay and reappearance retain both versions and never approve', async () => {
  const f = await unknownScope();
  const start = await applyBasIssueReview(f.workflow, request(f.workflow, 102, observe('begin_correction', f.finding)), 'operator_input', at);
  const corrected = await changeScope(start.workflow, 103, { building: 'A' });
  const preview = await inspectBasIssueReview(corrected, corrected.current_capture_id!);
  assert.equal(preview.decisions[0].state, 'not_reported_needs_review');
  const saved = await applyBasIssueReview(corrected, request(corrected, 104, { kind: 'record_not_reported', observation_id: start.event.event_id }), 'operator_input', at);
  const read = await readBasIssueDecision(saved.workflow, saved.event.event_id);
  assert.deepEqual(read.original_finding, f.finding); assert.equal(read.current_state, 'not_reported');
  assert.deepEqual(read.reviewed_change!.changed_records, [{ selector: 'equipment_head',
    before: start.event.expected_basis.equipment_head, after: corrected.equipment_events!.at(-1)!.event_id }]);
  assert.equal(read.approved, false); assert.ok((await basProjectReview(saved.workflow, saved.workflow.current_capture_id!)).issues.length > 0);
  const restored = await verifyBasWorkflow(JSON.parse(canonicalBasJson(saved.workflow)));
  assert.deepEqual(await readBasIssueDecision(restored, saved.event.event_id), read);
  const reappeared = await changeScope(restored, 105, { building: null });
  assert.equal((await inspectBasIssueReview(reappeared, reappeared.current_capture_id!)).decisions[0].state, 'reopened');
  const again = await readBasIssueDecision(reappeared, saved.event.event_id);
  assert.equal(again.current_state, 'same_occurrence'); assert.ok(again.reviewed_change, 'Historical absence remains true for its old inputs, not the current ones');
  assert.deepEqual(reappeared.issue_events, saved.workflow.issue_events);
});

test('unchanged or changed-but-still-reported findings cannot be confirmed away', async () => {
  const f = await unknownScope(), saved = await applyBasIssueReview(f.workflow, request(f.workflow, 106, observe('acknowledge', f.finding)), 'operator_input', at);
  await assert.rejects(applyBasIssueReview(saved.workflow, request(saved.workflow, 107, { kind: 'record_not_reported', observation_id: saved.event.event_id }), 'operator_input'), /changed retained inputs/);
  const changed = await changeScope(saved.workflow, 108, { system: 'Changed, but building still unknown' });
  assert.equal((await inspectBasIssueReview(changed, changed.current_capture_id!)).decisions[0].state, 'changed_occurrence');
  await assert.rejects(applyBasIssueReview(changed, request(changed, 109, { kind: 'record_not_reported', observation_id: saved.event.event_id }), 'operator_input'), /still reported/);
  assert.equal(changed.issue_events!.length, 1);
});

test('withdrawal does not revive an older acknowledgement; exact retry preserves later state', async () => {
  const f = await unknownScope(), firstRequest = request(f.workflow, 110, observe('acknowledge', f.finding));
  const first = await applyBasIssueReview(f.workflow, firstRequest, 'agent_proposal', at);
  const second = await applyBasIssueReview(first.workflow, request(first.workflow, 111, observe('begin_correction', f.finding)), 'operator_input', at);
  await assert.rejects(applyBasIssueReview(second.workflow, request(second.workflow, 112, { kind: 'withdraw', decision_id: first.event.event_id }), 'operator_input'), /current owned decision/);
  const withdrawn = await applyBasIssueReview(second.workflow, request(second.workflow, 113, { kind: 'withdraw', decision_id: second.event.event_id }), 'operator_input', at);
  const view = await inspectBasIssueReview(withdrawn.workflow, withdrawn.workflow.current_capture_id!);
  assert.equal(view.decisions[0].state, 'withdrawn'); assert.ok(view.project_review.issues.some(i => i.issue_key === f.finding.issue_key && i.severity === 'blocker'));
  assert.equal((await readBasIssueDecision(withdrawn.workflow, first.event.event_id)).is_latest_decision, false);
  assert.equal((await readBasIssueDecision(withdrawn.workflow, withdrawn.event.event_id)).current_state, 'same_occurrence');
  const retry = await applyBasIssueReview(withdrawn.workflow, firstRequest, 'agent_proposal');
  assert.deepEqual(retry.workflow, withdrawn.workflow); assert.deepEqual(retry.event, first.event);
  await assert.rejects(applyBasIssueReview(withdrawn.workflow, { ...firstRequest, reason: 'Different' }, 'agent_proposal'), /reused/);
  await assert.rejects(applyBasIssueReview(withdrawn.workflow, firstRequest, 'operator_input'), /reused/);
});

test('stale basis/head, forged IDs, cross-journal operations, future fields and mismatched ancestry refuse', async () => {
  const f = await unknownScope(), req = request(f.workflow, 114, observe('acknowledge', f.finding));
  const saved = await applyBasIssueReview(f.workflow, req, 'operator_input', at);
  await assert.rejects(applyBasIssueReview(saved.workflow, { ...req, operation_id: uuid(115) }, 'operator_input'), /history changed/);
  const changed = await changeScope(saved.workflow, 116, { system: 'Different system' });
  await assert.rejects(applyBasIssueReview(changed, { ...request(changed, 117, observe('acknowledge', f.finding)), expected_basis: req.expected_basis }, 'operator_input'), /inputs changed/);
  await assert.rejects(applyBasIssueReview(f.workflow, { ...req, action: { ...req.action as object, occurrence_id: '0'.repeat(64) } }, 'operator_input'), /not currently reported/);
  await assert.rejects(applyBasIssueReview(f.workflow, { ...req, operation_id: f.workflow.equipment_events![0].operation_id }, 'operator_input'), /Duplicate BAS review/);
  for (const patch of [{ approved: true }, { origin: 'operator_input' }, { reviewer: ' ' }, { reason: ' ' }, { expected_basis: { ...req.expected_basis, finding_rule: 'future' } }])
    assert.equal(basIssueReviewRequestSchema.safeParse({ ...req, ...patch }).success, false);
  assert.equal(basWorkflowSchema.safeParse({ ...saved.workflow, revision: 'bas_revision_8' }).success, false);
  assert.throws(() => selectBasIssueWorkflow(f.workflow, f.workflow.current_capture_id!, { ...req.expected_basis, equipment_head: null }), /retained equipment decision/);
});

test('re-signed fabricated occurrence and absence remain lineage-only and fail shared replay', async () => {
  const f = await unknownScope(), saved = await applyBasIssueReview(f.workflow, request(f.workflow, 118, observe('acknowledge', f.finding)), 'operator_input', at);
  const fake = structuredClone(saved.workflow), event = fake.issue_events![0];
  event.issue_key = '8'.repeat(64); event.occurrence_id = '9'.repeat(64);
  assert.ok(event.action.kind === 'acknowledge'); event.action.issue_key = event.issue_key; event.action.occurrence_id = event.occurrence_id;
  const { event_id: _id, ...payload } = event; event.event_id = await basEventFingerprint(payload);
  await verifyBasWorkflow(fake);
  await assert.rejects(readBasIssueDecision(fake, event.event_id), /does not replay/);
  const changed = await changeScope(saved.workflow, 119, { system: 'Still unknown building' });
  const p = { ...saved.event, ...request(changed, 120, { kind: 'record_not_reported', observation_id: saved.event.event_id }) };
  const { event_id: _old, ...unsigned } = p;
  const lie = basIssueReviewEventSchema.parse({ ...unsigned, event_id: await basEventFingerprint(unsigned as Parameters<typeof basEventFingerprint>[0]) });
  const forged = { ...changed, issue_events: [...changed.issue_events!, lie] };
  await verifyBasWorkflow(forged);
  await assert.rejects(readBasIssueDecision(forged, lie.event_id), /absence confirmation does not replay/);
});

test('ordinary merge/restore keeps issue history; divergent branches and tampering do not win', async () => {
  const f = await unknownScope(), req = request(f.workflow, 121, observe('acknowledge', f.finding));
  const a = await applyBasIssueReview(f.workflow, req, 'operator_input', at);
  assert.deepEqual(mergeBasWorkflows(a.workflow, f.workflow)!.issue_events, a.workflow.issue_events);
  assert.deepEqual(retainBasWorkflowHistory(f.workflow, a.workflow)!.issue_events, a.workflow.issue_events);
  const b = await applyBasIssueReview(f.workflow, { ...req, operation_id: uuid(122), reason: 'Competing branch' }, 'operator_input', at);
  assert.throws(() => mergeBasWorkflows(a.workflow, b.workflow), /Divergent/);
  const corrupt = structuredClone(a.workflow); corrupt.issue_events![0].reason = 'Altered saved reason';
  await assert.rejects(verifyBasWorkflow(corrupt), /fingerprint mismatch/);
  for (const value of [-1, Infinity, 16 * 1024 * 1024 + 1]) assert.throws(() => assertBasIssueJournalBytes(value));
  assert.doesNotThrow(() => assertBasIssueJournalBytes(16 * 1024 * 1024));
});

test('request ownership and cancellation cannot produce a partial decision', async () => {
  const f = await unknownScope(), req = request(f.workflow, 123, observe('acknowledge', f.finding)), before = structuredClone(f.workflow);
  const pending = applyBasIssueReview(f.workflow, req, 'operator_input', at); req.reason = 'Caller changed during await';
  assert.equal((await pending).event.reason, 'Controlled issue review, not a waiver');
  const controller = new AbortController(), stopped = applyBasIssueReview(f.workflow, request(f.workflow, 124, observe('acknowledge', f.finding)), 'operator_input', { signal: controller.signal });
  controller.abort(); await assert.rejects(stopped, /abort/i); assert.deepEqual(f.workflow, before);
  await assert.rejects(readBasIssueDecision(f.workflow, '0'.repeat(64), { signal: controller.signal }), /abort/i);
});

test('nested retained metadata is owned before await for inspection, recording and historical replay', async () => {
  for (const operation of ['verify', 'inspect', 'record', 'read'] as const) {
    const f = await revisionFixture(), w = f.workflow;
    const finding = (await basProjectReview(w, w.current_capture_id!)).issues[0];
    const initial = await applyBasIssueReview(w, request(w, 126, observe('acknowledge', finding)), 'operator_input', at);
    const snapshot = structuredClone(initial.workflow);
    const pending = operation === 'verify' ? verifyBasWorkflow(initial.workflow)
      : operation === 'inspect' ? inspectBasIssueReview(initial.workflow, initial.workflow.current_capture_id!)
      : operation === 'read' ? readBasIssueDecision(initial.workflow, initial.event.event_id)
      : applyBasIssueReview(initial.workflow, request(initial.workflow, 127, observe('acknowledge', finding)), 'operator_input', at);
    const table = initial.workflow.captures[0].equipment_sources!.tables[0];
    (table.retained_extra_metadata as { values: string[] }).values[0] = 'Caller changed while the service was awaiting';
    const result = await pending;
    if (operation === 'verify') assert.deepEqual(result, snapshot);
    else if (operation === 'record') {
      assert.ok('workflow' in result); assert.deepEqual(result.workflow.captures, snapshot.captures);
      await verifyBasWorkflow(result.workflow);
    } else if (operation === 'read') assert.deepEqual(result, await readBasIssueDecision(snapshot, initial.event.event_id));
    else assert.deepEqual(result, await inspectBasIssueReview(snapshot, snapshot.current_capture_id!));
  }
});
