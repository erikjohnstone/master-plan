/** Shared-path readiness gates, not production PDF/engineering accuracy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { scopeRequest } from './helpers/basScopeFixture.ts';
import { revisionBasis } from './helpers/basRevisionFixture.ts';
import { buildBasReadiness } from '../src/lib/basReadiness.ts';
import { applyBasScopeReview, prepareBasScopeReadiness, type BasCoverageAction } from '../src/lib/basScopeReview.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { evaluateBasReadinessIssues } from '../src/lib/basReadinessIssues.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { basEventFingerprint } from '../src/lib/basWorkflow.ts';

test('positive explicit scope with original bytes is ready for human approval, never approved or installed', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), before = canonicalBasJson(r.workflow);
  const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(result.status, 'ready_for_explicit_approval'); assert.deepEqual(result.blockers, []);
  assert.equal(result.approved, false); assert.equal(result.project_complete, false); assert.equal(result.installed_quantity, null);
  assert.equal(result.replay?.calculation_verification, 'no_saved_calculations');
  assert.equal(result.coverage.pages[0].status, 'accounted'); assert.equal(result.sources[0].status, 'verified_original_bytes');
  assert.ok(result.issues.some(i => i.scope === 'outside_included_claims' && i.issue.code === 'responsibility_unknown'));
  assert.ok(result.issues.some(i => i.effects.some(e => e.effect === 'reviewed_source_applicability')));
  assert.equal(canonicalBasJson(r.workflow), before);
  assert.deepEqual(await buildBasReadiness(JSON.parse(before), r.scope.event_id, { readSource: async () => f.bytes }), result);
});

test('original bytes are required; missing/incorrect sources cannot be replaced by a saved hash or name', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow);
  for (const io of [{}, { readSource: async () => null }]) {
    const result = await buildBasReadiness(r.workflow, r.scope.event_id, io);
    assert.equal(result.status, 'blocked'); assert.ok(result.blockers.some(b => b.code === 'original_source_unavailable'));
  }
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => new Uint8Array(1) }), /length mismatch/);
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => new Uint8Array(f.bytes.length) }), /digest mismatch/);
});

test('scope/coverage proposals and withdrawals never become human review', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), a = r.workflow.scope_events!.at(-1)!.action as BasCoverageAction;
  const proposal = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 900, a), 'agent_proposal');
  const result = await buildBasReadiness(proposal.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(result.status, 'blocked'); assert.ok(result.blockers.some(b => b.code === 'source_coverage_not_current_human_review'));
  const removed = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 901, { kind: 'withdraw_coverage', coverage_event_id: r.workflow.scope_events!.at(-1)!.event_id }), 'operator_input');
  assert.ok((await buildBasReadiness(removed.workflow, r.scope.event_id, { readSource: async () => f.bytes })).blockers.some(b => b.code === 'source_coverage_incomplete'));
  const withdrawn = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 902, { kind: 'withdraw_scope', scope_event_id: r.scope.event_id }), 'operator_input');
  await assert.rejects(buildBasReadiness(withdrawn.workflow, r.scope.event_id), /current saved scope/);
  const proposedScope = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 903, { kind: 'save_scope', specification: r.specification, previous_scope_event_id: null }), 'agent_proposal');
  assert.ok((await buildBasReadiness(proposedScope.workflow, proposedScope.event.event_id)).blockers.some(b => b.code === 'scope_requires_human_review'));
});

test('complete span accounting is not a whole-page mapping for a table cell with no narrative span identity', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), last = r.workflow.scope_events!.at(-1)!;
  const removed = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 900, { kind: 'withdraw_coverage', coverage_event_id: last.event_id }), 'operator_input');
  const action = last.action as BasCoverageAction;
  const reviewed = await applyBasScopeReview(removed.workflow, scopeRequest(removed.workflow, 901, { ...action,
    unit: { ...action.unit, span_ids: f.source.pages[0].spans.map(s => s.span_id) } }), 'operator_input');
  const result = await buildBasReadiness(reviewed.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(result.coverage.pages[0].status, 'accounted'); assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some(b => b.code === 'dependency_source_not_mapped'));
  const partial = await applyBasScopeReview(removed.workflow, scopeRequest(removed.workflow, 902, { ...action,
    unit: { ...action.unit, span_ids: [f.source.pages[0].spans[0].span_id] } }), 'operator_input');
  assert.ok((await buildBasReadiness(partial.workflow, r.scope.event_id)).blockers.some(b => b.code === 'source_coverage_incomplete'));
});

test('not-applicable and contradictory coverage cannot substantiate an included source value', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), action = r.workflow.scope_events!.at(-1)!.action as BasCoverageAction;
  const irrelevant = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 900, { ...action, assessment: 'not_applicable', mapped_item_ids: [] }), 'operator_input');
  const result = await buildBasReadiness(irrelevant.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(result.status, 'blocked'); assert.ok(result.blockers.some(b => b.code === 'dependency_source_not_mapped'));
  const conflicting = await applyBasScopeReview(r.workflow, scopeRequest(r.workflow, 901, { ...action, assessment: 'not_applicable', mapped_item_ids: [],
    unit: { ...action.unit, span_ids: [f.source.pages[0].spans[0].span_id] } }), 'operator_input');
  assert.ok((await buildBasReadiness(conflicting.workflow, r.scope.event_id)).blockers.some(b => b.code === 'source_coverage_conflict'));
});

test('unrelated input edits preserve reviewed claims while relevant edits block without rebinding originals', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), equipment = structuredClone(f.equipment);
  equipment.equipment[1].reason = 'Unrelated item reason';
  const changed = await applyBasEquipmentReview(r.workflow, { operation_id: uuid(900), capture_id: r.workflow.current_capture_id,
    expected_head: r.workflow.equipment_events!.at(-1)!.event_id, register: equipment, reason: 'Unrelated change' }, 'operator_input');
  assert.equal((await buildBasReadiness(changed, r.scope.event_id, { readSource: async () => f.bytes })).status, 'ready_for_explicit_approval');
  equipment.scopes[0].building = 'Different building';
  const relevant = await applyBasEquipmentReview(changed, { operation_id: uuid(901), capture_id: changed.current_capture_id,
    expected_head: changed.equipment_events!.at(-1)!.event_id, register: equipment, reason: 'Relevant change' }, 'operator_input');
  const result = await buildBasReadiness(relevant, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(result.status, 'blocked'); assert.ok(result.blockers.some(b => b.code === 'scope_claim_dependencies_changed'));
  assert.ok(result.blockers.some(b => b.code === 'source_coverage_not_current_human_review'));
});

test('unknown findings fail closed and original outside-scope responsibility defects remain unchanged', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow);
  const review = await basProjectReview(r.workflow, r.workflow.current_capture_id!);
  const original = structuredClone(review), unknown = { ...review.issues[0], code: 'FUTURE_UNCLASSIFIED', known_code: false };
  // Direct internal policy test only; the public service never accepts findings.
  const input = await prepareBasScopeReadiness(r.workflow, r.scope.event_id);
  const effects = evaluateBasReadinessIssues(input.current, [{ ...review, issues: [...review.issues, unknown] }], [], true, true);
  assert.ok(effects.find(i => i.issue.code === unknown.code)!.effects.every(e => e.effect === 'blocking'));
  assert.ok(effects.some(i => i.issue.code === 'responsibility_unknown' && i.scope === 'outside_included_claims'));
  assert.deepEqual(review, original);
});

test('forged or mismatched replay receipts and mutated adapter copies do not establish readiness', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), before = canonicalBasJson(r.workflow);
  const reference = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { replayCalculations: async () => ({ ...reference.replay, workflow_sha256: 'f'.repeat(64) }) }), /exact saved workflow/);
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { replayCalculations: async () => ({ verified: true }) }));
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { replayCalculations: async () => { throw new Error('Actual Python failed'); } }), /Actual Python failed/);
  await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async source => { source.sha256 = 'f'.repeat(64); return f.bytes; },
    replayCalculations: async copy => { copy.scope_events = []; return reference.replay; } });
  assert.equal(canonicalBasJson(r.workflow), before);
});

test('corrupt projection replay, cancellation, and foreign event IDs yield no partial readiness', async () => {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), forged = structuredClone(r.workflow);
  const event = forged.scope_events!.at(-1)!; event.result_fingerprint = 'f'.repeat(64);
  const { event_id: _id, ...payload } = event; event.event_id = await basEventFingerprint(payload);
  await assert.rejects(buildBasReadiness(forged, r.scope.event_id), /does not replay/);
  await assert.rejects(buildBasReadiness(r.workflow, 'f'.repeat(64)), /not owned/);
  const controller = new AbortController();
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => { controller.abort(); return f.bytes; } }, controller.signal), /abort/i);
  const before = canonicalBasJson(r.workflow);
  await assert.rejects(buildBasReadiness(r.workflow, r.scope.event_id, {}, controller.signal), /abort/i);
  assert.equal(canonicalBasJson(r.workflow), before);
});

test('a missing assembly calculation and unresolved responsibility cannot pass their own included claims', async () => {
  const f = await readinessFixture();
  for (const claim of ['assembly_components', 'responsibilities'] as const) {
    const r = await reviewReadyScope(f.workflow, [{ claim, capture_id: f.workflow.current_capture_id!, subject_id: uuid(30) }]);
    const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.some(b => claim === 'responsibilities' ? b.code === 'issue:assemblies:responsibility_unknown' : b.code === 'scope_missing_saved_quantity'));
    assert.equal(result.scope.specification.basis.source_set_id, revisionBasis(f.workflow).source_set_id);
  }
});
