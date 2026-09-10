import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { recordBasIssueFromUi, currentBasIssueActionContext } from '../src/components/basIssueClient.ts';
import { basReviewNavigation, basSequenceReviewSelection } from '../src/components/basReviewNavigation.ts';
import { inspectBasIssueReview } from '../src/lib/basIssueReview.ts';
import { applyBasReview, basSequenceView } from '../src/lib/basReview.ts';

test('browser adoption binds workflow, nested data, load epoch, source signature, storage and cancellation', async () => {
  const { workflow } = await engineeringFixture(), inspect = await inspectBasIssueReview(workflow, workflow.current_capture_id!);
  const finding = inspect.project_review.issues[0];
  const request = { operation_id: uuid(160), capture_id: workflow.current_capture_id!, expected_head: inspect.head,
    expected_basis: inspect.basis, reviewer: 'Self-declared UI reviewer', reason: 'Controlled UI observation',
    action: { kind: 'acknowledge', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } };
  for (const race of ['none', 'workflow', 'mutation', 'epoch', 'signature', 'adapter', 'cancel']) {
    const context = { workflow: structuredClone(workflow), epoch: 1, signature: 'source-v1', adapter: {} };
    let adoptions = 0; const abort = new AbortController();
    const pending = recordBasIssueFromUi(() => context, w => { adoptions++; context.workflow = w; }, request, { signal: abort.signal });
    if (race === 'workflow') context.workflow = structuredClone(context.workflow);
    if (race === 'mutation') context.workflow.equipment_events![0].reason = 'Mutated during await';
    if (race === 'epoch') context.epoch++;
    if (race === 'signature') context.signature = 'source-v2';
    if (race === 'adapter') context.adapter = {};
    if (race === 'cancel') abort.abort();
    if (race === 'none') { await pending; assert.equal(adoptions, 1); assert.equal(context.workflow.issue_events![0].origin, 'operator_input'); }
    else { await assert.rejects(pending, /stale|abort/i); assert.equal(adoptions, 0); }
  }
});

test('exact correction routes preserve unrelated UI drafts and source selections without changing workflow', async () => {
  const { workflow } = await engineeringFixture({ withSequence: true }), before = structuredClone(workflow);
  const inspect = await inspectBasIssueReview(workflow, workflow.current_capture_id!), base = inspect.project_review.issues[0];
  const previous = { filter: 'Retained point search', coverageCategory: 'blank_span_ids', coverageRowPage: 17, sequenceDraft: { reason: 'Keep source draft' },
    projectReview: { filter: 'Keep finding search' }, equipment: { draft: { reason: 'Keep equipment draft' },
      assembly: { draft: { reason: 'Keep component draft' } }, engineering: { draft: { reason: 'Keep engineering draft' } } } };
  const route = (domain: typeof base.domain, kind: typeof base.subject.kind, id: string, original: unknown = {}) =>
    basReviewNavigation(previous, { ...base, domain, subject: { kind, id, label: 'No label matching' }, original_finding_json: JSON.stringify(original) }, workflow);
  assert.deepEqual(route('equipment', 'scope', uuid(1)).equipment.reviewTarget, { kind: 'scope', id: uuid(1) });
  assert.equal(route('equipment', 'equipment', uuid(11)).equipment.equipmentId, uuid(11));
  assert.equal(route('equipment', 'occurrence', 'exact-row').equipment.sourceOccurrenceId, 'exact-row');
  assert.deepEqual(route('sequences', 'comparison', 'opaque', { assignment_id: 'exact-assignment' }).equipment.reviewTarget, { kind: 'assignment', id: 'exact-assignment' });
  const component = route('assemblies', 'component', 'component:wire', { issue: { component_id: uuid(31) } });
  assert.equal(component.equipment.assembly.componentId, uuid(31)); assert.deepEqual(component.equipment.assembly.draft, previous.equipment.assembly.draft);
  const check = route('engineering', 'constraint', 'check:constraint', { check_id: 'exact-check' });
  assert.equal(check.equipment.engineering.checkId, 'exact-check'); assert.deepEqual(check.equipment.engineering.draft, previous.equipment.engineering.draft);
  assert.equal(route('engineering', 'resource', 'exact-resource').equipment.engineering.resourceId, 'exact-resource');
  assert.equal(route('points', 'matrix', 'controlled-matrix').matrixId, 'controlled-matrix');
  assert.deepEqual(route('sequences', 'clause', 'exact-clause').sequenceReviewTarget,
    { captureId: workflow.current_capture_id, kind: 'clause', id: 'exact-clause' });
  assert.deepEqual(route('sequences', 'comparison', 'opaque-pair').sequenceReviewTarget,
    { captureId: workflow.current_capture_id, kind: 'comparison', id: 'opaque-pair' });
  assert.equal(route('sequences', 'page', 'exact-page').coverageCategory, '');
  assert.equal(route('sequences', 'page', 'exact-page').coverageRowPage, 0);
  assert.deepEqual(route('sequences', 'clause', 'clause').sequenceDraft, previous.sequenceDraft);
  assert.deepEqual(check.equipment.draft, previous.equipment.draft); assert.equal(check.projectReview.filter, 'Keep finding search');
  assert.deepEqual(workflow, before);
});

test('shared sequence findings route to exact clauses, region boundaries, matrix comparisons and page accounting', async () => {
  const fixture = await engineeringFixture({ withSequence: true });
  let workflow = fixture.workflow;
  const initial = await basSequenceView(workflow, workflow.current_capture_id!);
  const region = initial.sequences.regions[0], clause = region.clauses[0];
  workflow = await applyBasReview(workflow, { operation_id: uuid(180), capture_id: workflow.current_capture_id, expected_head: null,
    action: { kind: 'upsert', association: { region_id: region.region_id, matrix_id: 'controlled-matrix', reason: 'Controlled exact navigation target',
      equipment_references: [{ tag: 'AHU-1', span_ids: [fixture.source.pages[0].spans[0].span_id],
        scope: { building: null, level: null, system: null, phase: null } }] } } }, 'operator_input');
  const view = await basSequenceView(workflow, workflow.current_capture_id!);
  const inspect = await inspectBasIssueReview(workflow, workflow.current_capture_id!);
  const clauseIssue = inspect.project_review.issues.find(i => i.subject.id === clause.clause_id)!;
  const comparisonIssue = inspect.project_review.issues.find(i => i.subject.kind === 'comparison')!;
  assert.ok(clauseIssue); assert.ok(comparisonIssue);
  const select = (issue: typeof clauseIssue) => basSequenceReviewSelection(view, basReviewNavigation({}, issue, workflow).sequenceReviewTarget);
  assert.deepEqual(select(clauseIssue), { kind: 'sequence', regionId: region.region_id, clauseId: clause.clause_id, matrixId: null, requirementId: null });
  assert.deepEqual(select(comparisonIssue), { kind: 'sequence', regionId: region.region_id, clauseId: clause.clause_id,
    matrixId: 'controlled-matrix', requirementId: clause.requirements[0].requirement_id });
  const target = { captureId: workflow.current_capture_id!, kind: 'comparison' as const,
    id: JSON.stringify([region.region_id, 'controlled-matrix']) };
  assert.deepEqual(basSequenceReviewSelection(view, target), { kind: 'sequence', regionId: region.region_id, clauseId: null, matrixId: 'controlled-matrix', requirementId: null });
  assert.equal(basSequenceReviewSelection(view, { ...target, id: `${target.id}:wrong-requirement` }), null);
  assert.equal(basSequenceReviewSelection(view, { ...target, id: JSON.stringify([region.region_id, 'different-matrix']) }), null);
  assert.equal(basSequenceReviewSelection(initial, target), null, 'Removed association never selects another comparison');
  assert.deepEqual(basSequenceReviewSelection(view, { ...target, kind: 'clause', id: region.region_id }),
    { kind: 'sequence', regionId: region.region_id, clauseId: null, matrixId: null, requirementId: null });
  assert.deepEqual(basSequenceReviewSelection(view, { ...target, kind: 'page', id: region.page_id }), { kind: 'coverage', pageId: region.page_id });
  assert.equal(basSequenceReviewSelection(view, { ...target, kind: 'page', id: 'foreign-page' }), null);
  const old = basReviewNavigation({ equipment: { draft: 'Keep' }, projectReview: { decisionId: 'Keep history' } }, clauseIssue, workflow, 'b'.repeat(64));
  assert.equal(old.takeoffTab, 'review'); assert.match(old.projectReview.routeNotice, /historical/);
  assert.equal(old.projectReview.decisionId, 'Keep history'); assert.equal(old.equipment.draft, 'Keep');
});

test('historical decision context cannot enable current capture issue actions or draft submission', () => {
  const review = { capture_id: 'a'.repeat(64), source_status: 'active_capture' as const };
  const decision = { decision: { capture_id: review.capture_id }, capture_status: 'active_capture' as const };
  assert.equal(currentBasIssueActionContext(review), true);
  assert.equal(currentBasIssueActionContext(review, decision), true);
  assert.equal(currentBasIssueActionContext({ ...review, source_status: 'historical_capture' }, decision), false);
  assert.equal(currentBasIssueActionContext(review, { ...decision, capture_status: 'historical_capture' }), false);
  assert.equal(currentBasIssueActionContext(review, { ...decision, decision: { capture_id: 'b'.repeat(64) } }), false);
});
