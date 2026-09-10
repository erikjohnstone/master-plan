/** Shared-path gate: yes. Review correctness, not extraction or installed GT. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeFixture, scopeRequest } from './helpers/basScopeFixture.ts';
import { revisionBasis } from './helpers/basRevisionFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { applyBasScopeReview, readBasScopeDecision, inspectBasScopeHistory, basScopeReviewRequestSchema,
  type BasScopeReviewEvent, type BasCoverageAction } from '../src/lib/basScopeReview.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { verifyBasWorkflow, basEventFingerprint } from '../src/lib/basWorkflow.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';

async function resign(event: BasScopeReviewEvent) {
  const { event_id: _old, ...payload } = event; event.event_id = await basEventFingerprint(payload);
}

test('save and coverage replay exact original text, bboxes and owned mappings without approving anything', async () => {
  const f = await scopeFixture(), before = canonicalBasJson(f.workflow);
  const result = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  assert.equal(canonicalBasJson(f.workflow), before);
  assert.equal(result.workflow.revision, 'bas_scope_10'); assert.equal(result.event.approved, false);
  const saved = await readBasScopeDecision(result.workflow, f.event.event_id);
  assert.equal(saved.state, 'current_dependencies'); assert.equal(saved.decision_state, 'latest');
  const read = await readBasScopeDecision(result.workflow, result.event.event_id);
  assert.equal(read.state, 'current_dependencies'); assert.equal(read.decision_state, 'latest');
  assert.equal(read.approved, false); assert.equal(read.project_complete, false);
  assert.equal(read.acceptance, 'self_declared_human_review'); assert.equal(read.reviewer_identity, 'self_declared');
  assert.equal(read.replay_verification, 'shared_scope_projection_replayed');
  assert.ok('source' in read.original.value);
  assert.deepEqual(read.original.value.source.spans, f.source.pages[0].spans);
  assert.deepEqual(read.original.value.source.frame, { width_px: 1800, height_px: 1000, rotation: 0 });
  assert.equal(read.original.value.source.scope, 'whole_original_page');
  assert.equal(read.original.value.mappings[0].item_id, f.preview.claims[0].root_item_id);
  assert.equal(read.original.value.source_availability, 'not_byte_verified');
  assert.equal(read.original.value.calculation_verification, 'saved_results_not_python_replayed');
  const restored = JSON.parse(canonicalBasJson(result.workflow));
  assert.deepEqual(await readBasScopeDecision(restored, result.event.event_id), read);
});

test('unrelated edits keep coverage current, related edits invalidate it, and original review never rebinds', async () => {
  const f = await scopeFixture();
  const saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const original = (await readBasScopeDecision(saved.workflow, saved.event.event_id)).original;
  const equipment = structuredClone(f.equipment); equipment.equipment[1].reason = 'Unrelated equipment decision';
  let w = await applyBasEquipmentReview(saved.workflow, { operation_id: uuid(703), capture_id: saved.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: equipment, reason: 'Unrelated edit' }, 'operator_input');
  let read = await readBasScopeDecision(w, saved.event.event_id);
  assert.equal(read.state, 'current_dependencies'); assert.deepEqual(read.original, original);
  // Save a renamed scope at the current heads without forcing unchanged review work.
  const renamed = await applyBasScopeReview(w, scopeRequest(w, 704, { kind: 'save_scope',
    specification: { ...f.specification, basis: revisionBasis(w), name: 'Renamed only' }, previous_scope_event_id: f.event.event_id }), 'operator_input');
  w = renamed.workflow; read = await readBasScopeDecision(w, saved.event.event_id);
  assert.equal(read.state, 'current_dependencies'); assert.equal(read.decision_state, 'latest');
  equipment.scopes[0].building = 'Changed actual equipment scope';
  w = await applyBasEquipmentReview(w, { operation_id: uuid(705), capture_id: w.current_capture_id,
    expected_head: w.equipment_events!.at(-1)!.event_id, register: equipment, reason: 'Relevant edit' }, 'operator_input');
  read = await readBasScopeDecision(w, saved.event.event_id);
  assert.equal(read.state, 'changed_dependencies'); assert.deepEqual(read.original, original);
  const removed = await applyBasScopeReview(w, scopeRequest(w, 706, { kind: 'save_scope',
    specification: { ...f.specification, basis: revisionBasis(w), included: [{ ...f.coverage.claim, subject_id: uuid(12) }] },
    previous_scope_event_id: renamed.event.event_id }), 'operator_input');
  read = await readBasScopeDecision(removed.workflow, saved.event.event_id);
  assert.equal(read.state, 'unavailable_current_inputs'); assert.match(read.current_error!, /no longer included/);
  assert.deepEqual(read.original, original);
});

test('exact retries are idempotent, conflicting operations and stale heads/bases are rejected', async () => {
  const f = await scopeFixture(), request = scopeRequest(f.workflow, 702, f.coverage);
  const saved = await applyBasScopeReview(f.workflow, request, 'operator_input');
  const retry = await applyBasScopeReview(saved.workflow, request, 'operator_input', { createdAt: '2026-09-11T00:00:00.000Z' });
  assert.deepEqual(retry, saved);
  for (const changed of [{ ...request, reason: 'Different' }, { ...request, reviewer: 'Other' }])
    await assert.rejects(applyBasScopeReview(saved.workflow, changed, 'operator_input'), /reused/);
  await assert.rejects(applyBasScopeReview(saved.workflow, request, 'agent_proposal'), /reused/);
  await assert.rejects(applyBasScopeReview(saved.workflow, { ...request, operation_id: uuid(703) }, 'operator_input'), /history changed/);
  await assert.rejects(applyBasScopeReview(saved.workflow, scopeRequest(saved.workflow, 703, { ...f.coverage,
    basis: { ...f.coverage.basis, captures: [{ ...f.coverage.basis.captures[0], equipment_head: null }] } }), 'operator_input'), /inputs changed/);
  await assert.rejects(applyBasScopeReview(saved.workflow, scopeRequest(saved.workflow, 703, { ...f.request.action,
    kind: 'save_scope', specification: f.specification, previous_scope_event_id: null }), 'operator_input'), /predecessor changed/);
});

test('coverage replacement and withdrawal preserve history without resurrecting earlier review', async () => {
  const f = await scopeFixture();
  const first = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const second = await applyBasScopeReview(first.workflow, scopeRequest(first.workflow, 703, { ...f.coverage,
    assessment: 'unresolved', mapped_item_ids: [] }), 'operator_input');
  assert.equal((await readBasScopeDecision(second.workflow, first.event.event_id)).decision_state, 'superseded');
  await assert.rejects(applyBasScopeReview(second.workflow, scopeRequest(second.workflow, 704, {
    kind: 'withdraw_coverage', coverage_event_id: first.event.event_id }), 'operator_input'), /changed or was withdrawn/);
  const request = scopeRequest(second.workflow, 704, { kind: 'withdraw_coverage', coverage_event_id: second.event.event_id });
  const removed = await applyBasScopeReview(second.workflow, request, 'operator_input');
  assert.deepEqual(await applyBasScopeReview(removed.workflow, request, 'operator_input'), removed);
  for (const id of [first.event.event_id, second.event.event_id, removed.event.event_id])
    assert.equal((await readBasScopeDecision(removed.workflow, id)).decision_state, 'withdrawn');
  const scopeRemoved = await applyBasScopeReview(removed.workflow, scopeRequest(removed.workflow, 705, {
    kind: 'withdraw_scope', scope_event_id: f.event.event_id }), 'operator_input');
  const read = await readBasScopeDecision(scopeRemoved.workflow, first.event.event_id);
  assert.equal(read.state, 'scope_withdrawn'); assert.equal(read.current, null);
  const history = await inspectBasScopeHistory(scopeRemoved.workflow);
  assert.equal(history.scopes[0].state, 'withdrawn'); assert.equal(history.replay_verification, 'lineage_only');
  await assert.rejects(applyBasScopeReview(scopeRemoved.workflow, scopeRequest(scopeRemoved.workflow, 706, f.coverage), 'operator_input'), /changed or was withdrawn/);
  const restored = await applyBasScopeReview(scopeRemoved.workflow, scopeRequest(scopeRemoved.workflow, 706, {
    kind: 'save_scope', specification: f.specification, previous_scope_event_id: scopeRemoved.event.event_id }), 'operator_input');
  assert.equal((await readBasScopeDecision(restored.workflow, second.event.event_id)).decision_state, 'withdrawn');
});

test('overlapping contradictory page/span assessments are explicit; disjoint subsets do not conflict', async () => {
  const f = await scopeFixture(), ids = f.source.pages[0].spans.map(s => s.span_id);
  assert.ok(ids.length > 2);
  const first = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, { ...f.coverage,
    unit: { ...f.coverage.unit, span_ids: [ids[1], ids[0]] } }), 'operator_input');
  const second = await applyBasScopeReview(first.workflow, scopeRequest(first.workflow, 703, { ...f.coverage,
    assessment: 'not_applicable', mapped_item_ids: [], unit: { ...f.coverage.unit, span_ids: [ids[2]] } }), 'operator_input');
  assert.deepEqual((await readBasScopeDecision(second.workflow, first.event.event_id)).potential_conflict_event_ids, []);
  const third = await applyBasScopeReview(second.workflow, scopeRequest(second.workflow, 704, { ...f.coverage,
    assessment: 'unresolved', mapped_item_ids: [] }), 'operator_input');
  const read = await readBasScopeDecision(third.workflow, first.event.event_id);
  assert.deepEqual(read.potential_conflict_event_ids, [third.event.event_id]);
  assert.ok('source' in read.original.value);
  assert.deepEqual(read.original.value.source.unit.span_ids, [ids[0], ids[1]].sort());
  assert.deepEqual(read.original.value.source.spans.map(s => s.span_id), [ids[0], ids[1]].sort());
});

test('strict source/claim/mapping ownership refuses invented pages, spans, IDs and supplied quotes', async () => {
  const f = await scopeFixture(), outside = f.preview.inventory.items.find(i => !f.preview.claims[0].dependency_item_ids.includes(i.item_id))!;
  const invalid: BasCoverageAction[] = [
    { ...f.coverage, unit: { ...f.coverage.unit, page_id: 'wrong' } },
    { ...f.coverage, unit: { ...f.coverage.unit, span_ids: ['wrong'] } },
    { ...f.coverage, unit: { ...f.coverage.unit, page_id: f.source.pages[1].page_id, span_ids: [f.source.pages[0].spans[0].span_id] } },
    { ...f.coverage, claim: { ...f.coverage.claim, subject_id: uuid(12) } },
    { ...f.coverage, mapped_item_ids: ['f'.repeat(64)] },
    { ...f.coverage, mapped_item_ids: [outside.item_id] },
  ];
  for (const action of invalid) await assert.rejects(applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, action), 'operator_input'));
  for (const action of [
    { ...f.coverage, unit: { ...f.coverage.unit, capture_id: 'f'.repeat(64) } },
    { ...f.coverage, inspected_source: false }, { ...f.coverage, quote: 'Invented text' },
    { ...f.coverage, assessment: 'not_applicable' }, { ...f.coverage, mapped_item_ids: [] },
    { ...f.coverage, mapped_item_ids: [...f.coverage.mapped_item_ids, ...f.coverage.mapped_item_ids] },
    { ...f.coverage, unit: { ...f.coverage.unit, span_ids: [] } },
    { ...f.coverage, unit: { ...f.coverage.unit, span_ids: ['same', 'same'] } },
  ]) assert.throws(() => basScopeReviewRequestSchema.parse({ ...scopeRequest(f.workflow, 702, f.coverage), action }));
});

test('semantic replay rejects a re-signed false digest even when lineage-only load succeeds', async () => {
  const f = await scopeFixture(), request = scopeRequest(f.workflow, 702, f.coverage);
  const saved = await applyBasScopeReview(f.workflow, request, 'operator_input');
  for (const original of [f.workflow, saved.workflow]) {
    const bad = structuredClone(original), event = bad.scope_events!.at(-1)!;
    event.result_fingerprint = 'f'.repeat(64); await resign(event);
    await verifyBasWorkflow(bad);
    assert.equal((await inspectBasScopeHistory(bad)).replay_verification, 'lineage_only');
    await assert.rejects(readBasScopeDecision(bad, event.event_id), /does not replay/);
    await assert.rejects(applyBasScopeReview(bad, original === f.workflow ? f.request : request, 'operator_input'), /does not replay/);
    event.reason = 'Tamper without re-signing';
    await assert.rejects(verifyBasWorkflow(bad), /fingerprint/);
  }
});

test('agent review is a proposal; applicability and acknowledgements cannot waive existing project findings', async () => {
  const f = await scopeFixture(), before = await basProjectReview(f.workflow, f.workflow.current_capture_id!);
  const saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, { ...f.coverage,
    assessment: 'not_applicable', mapped_item_ids: [] }), 'agent_proposal');
  const read = await readBasScopeDecision(saved.workflow, saved.event.event_id);
  assert.equal(read.acceptance, 'agent_proposal'); assert.equal(read.approved, false);
  assert.deepEqual(await basProjectReview(saved.workflow, saved.workflow.current_capture_id!), before);
});

test('requests and workflow are owned before awaits; cancellation returns no partial journal', async () => {
  const f = await scopeFixture(), before = structuredClone(f.workflow), request = scopeRequest(f.workflow, 702, f.coverage);
  const pending = applyBasScopeReview(f.workflow, request, 'operator_input');
  request.reason = 'Caller changed request'; request.action = { kind: 'withdraw_scope', scope_event_id: f.event.event_id };
  f.workflow.scope_events![0].reason = 'Caller changed original';
  const saved = await pending;
  assert.equal(saved.event.action.kind, 'record_coverage'); assert.notEqual(saved.event.reason, request.reason);
  assert.deepEqual(saved.workflow.scope_events![0], before.scope_events![0]);
  const abort = new AbortController(); abort.abort(new Error('Controlled cancellation'));
  await assert.rejects(applyBasScopeReview(before, scopeRequest(before, 703, f.coverage), 'operator_input', { signal: abort.signal }), /Controlled cancellation/);
  const later = new AbortController();
  const aborted = applyBasScopeReview(before, scopeRequest(before, 703, f.coverage), 'operator_input', { signal: later.signal });
  later.abort(new Error('Controlled late cancellation'));
  await assert.rejects(aborted, /Controlled late cancellation/);
  await assert.rejects(readBasScopeDecision(before, f.event.event_id, { signal: abort.signal }), /Controlled cancellation/);
});
