import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { recordBasIssueFromUi } from '../src/components/basIssueClient.ts';
import { basReviewNavigation } from '../src/components/basReviewNavigation.ts';
import { inspectBasIssueReview } from '../src/lib/basIssueReview.ts';

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
  const previous = { filter: 'Retained point search', sequenceDraft: { reason: 'Keep source draft' },
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
  assert.deepEqual(route('sequences', 'clause', 'clause').sequenceDraft, previous.sequenceDraft);
  assert.deepEqual(check.equipment.draft, previous.equipment.draft); assert.equal(check.projectReview.filter, 'Keep finding search');
  assert.deepEqual(workflow, before);
});
