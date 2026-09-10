/** Shared journal with actual Python-backed old writers. Controlled fixtures,
 * not public transport or automatic equipment/source interpretation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionFixture, addRevisionSourceSet } from '../../web/test/helpers/basRevisionFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { inspectBasIssueReview, applyBasIssueReview, readBasIssueDecision } from '../../web/src/lib/basIssueReview.ts';
import { verifyBasWorkflow, basEventFingerprint, type BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { applyBasReview } from '../../web/src/lib/basReview.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { prepareBasRevisionReview, recordBasRevisionReview } from '../src/basRevisionReview.ts';
import { defaultBasRevisionBasis } from '../../web/src/lib/basRevisionBasis.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

test('every previous decision/calculation writer retains revision 9 and exact issue observation replay', async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!;
  const view = await inspectBasIssueReview(f.workflow, capture_id);
  const finding = view.project_review.issues.find(i => i.domain === 'assemblies'); assert.ok(finding);
  const saved = await applyBasIssueReview(f.workflow, { operation_id: uuid(960), capture_id, expected_head: view.head,
    expected_basis: view.basis, reviewer: 'Controlled reviewer', reason: 'Observe before exercising all older writers',
    action: { kind: 'begin_correction', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } }, 'operator_input');
  let w = saved.workflow;
  const preserved = async (next: BasWorkflow) => {
    assert.equal(next.revision, 'bas_issues_9'); assert.deepEqual(next.issue_events, saved.workflow.issue_events);
    assert.deepEqual(next.captures, saved.workflow.captures);
    await verifyBasWorkflow(next); w = next;
  };
  await preserved(await applyBasReview(w, { capture_id, operation_id: uuid(961), expected_head: w.review_events!.at(-1)!.event_id,
    action: { ...w.review_events![0].action } }, 'operator_input'));
  const equipment = structuredClone(f.equipment); equipment.assignments[0].excluded_equipment_ids = [uuid(12)];
  await preserved(await applyBasEquipmentReview(w, { capture_id, operation_id: uuid(962), expected_head: w.equipment_events!.at(-1)!.event_id,
    register: equipment, reason: 'Controlled assignment correction' }, 'operator_input'));
  const equipmentHead = w.equipment_events!.at(-1)!.event_id;
  await preserved(await applyBasAssemblyReview(w, { capture_id, operation_id: uuid(963), expected_head: w.assembly_events!.at(-1)!.event_id,
    expected_equipment_head: equipmentHead, register: f.assembly, reason: 'Review controlled changed applicability' }, 'operator_input'));
  await preserved((await calculateBasAssignments(w, { capture_id, expected_equipment_head: equipmentHead })).workflow);
  await preserved((await calculateBasAssemblies(w, { capture_id, expected_equipment_head: equipmentHead,
    expected_assembly_head: w.assembly_events!.at(-1)!.event_id })).workflow);
  await preserved((await applyBasEngineeringReview(w, { capture_id, operation_id: uuid(964), expected_head: null,
    expected_equipment_head: equipmentHead, expected_assembly_head: w.assembly_events!.at(-1)!.event_id,
    expected_sequence_head: w.review_events!.at(-1)!.event_id, register: f.engineering, reason: 'Controlled engineering input replay' }, 'operator_input')).workflow);
  await preserved(await addRevisionSourceSet(w, undefined, 965));
  const basis = defaultBasRevisionBasis(w, w.drawing_events!.at(-1)!.event_id);
  const preview = await prepareBasRevisionReview(w, { before: basis, after: basis, matches: [], added: [], removed: [], membership_reviews: [] });
  await preserved((await recordBasRevisionReview(w, { operation_id: uuid(966), expected_head: preview.expected_head,
    expected_report_fingerprint: preview.expected_report_fingerprint, comparison: preview.comparison,
    name: 'Controlled pinned revision', reason: 'Verify comparison write preserves the issue journal', reviewer: 'Controlled reviewer' }, 'operator_input')).workflow);
  const old = await readBasIssueDecision(JSON.parse(canonicalBasJson(w)), saved.event.event_id);
  assert.deepEqual(old.original_finding, finding); assert.equal(old.finding_verification, 'shared_projection_replayed');
  assert.equal(old.approved, false); assert.equal(old.project_complete, false);
});

test('reused pinned engineering inputs still validate each later register and reject re-signed foreign evidence', async () => {
  const f = await revisionFixture(), w = f.workflow;
  const first = await applyBasEngineeringReview(w, { operation_id: uuid(970), capture_id: w.current_capture_id!, expected_head: null,
    expected_equipment_head: w.equipment_events!.at(-1)!.event_id, expected_assembly_head: w.assembly_events!.at(-1)!.event_id,
    expected_sequence_head: w.review_events!.at(-1)!.event_id, register: f.engineering, reason: 'Controlled valid initial check' }, 'operator_input');
  await verifyBasWorkflow(first.workflow);
  for (const kind of ['source', 'member'] as const) {
    const bad = structuredClone(first.event); bad.operation_id = uuid(kind === 'source' ? 971 : 972);
    bad.expected_head = first.event.event_id;
    if (kind === 'source') bad.register.targets[0].source_span_ids = ['foreign-span'];
    else bad.register.resources[0].equipment_id = uuid(999);
    const { event_id: _id, ...payload } = bad; bad.event_id = await basEventFingerprint(payload);
    await assert.rejects(verifyBasWorkflow({ ...first.workflow, engineering_events: [...first.workflow.engineering_events!, bad] }),
      /foreign source span|registered equipment/);
  }
  assert.deepEqual(await verifyBasWorkflow(first.workflow), first.workflow, 'Failure cannot poison a later operation');
});
