/** Actual Python outcomes + shared production compile, not real-PDF/public-client proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid, explicit } from '../../web/test/helpers/basEngineeringFixture.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { basProjectReview, basProjectReviewSchema } from '../../web/src/lib/basProjectReview.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import type { SheetGraph } from '../../web/src/lib/sheetgraph.ts';
import { compileCorpusTakeoffOutput } from '../src/outputs.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { captureBasEvidence } from '../../web/src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import type { BasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

test('production compile findings match the browser before and after canonical workflow restoration', async () => {
  const f = await engineeringFixture();
  // Header order deliberately differs from dictionary insertion order. This
  // controlled malformed schedule must keep its missing-mark finding visible.
  const table = { ...f.tables[0], headers: ['Z', 'A'], rows: [{ ...f.tables[0].rows[0],
    cells: { A: { text: 'first dictionary key', bbox: [60, 10, 90, 20] },
      Z: { text: 'first printed column', bbox: [10, 10, 50, 20] } } }] };
  const graph = { available: true, tables: [table], sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  const beforeGraph = structuredClone(graph);
  const session = { basWorkflow: f.workflow, basSourcesForPipeline: () => f.source,
    retainBasWorkflow(next: typeof f.workflow) { this.basWorkflow = next; return true; } };
  await compileProductionTakeoff(session, graph, 'bas_points');
  const request = { capture_id: session.basWorkflow.current_capture_id! };
  const before = await compileProductionTakeoff(session, graph, 'bas_points', { bas_project_review: request });
  const ui = await basProjectReview(session.basWorkflow, request.capture_id);
  assert.ok('bas_project_review' in before);
  assert.deepEqual(before.bas_project_review, ui);
  assert.ok(ui.issues.some(i => i.code === 'missing_mark_column'));
  session.basWorkflow = JSON.parse(canonicalBasJson(session.basWorkflow));
  const restored = await compileProductionTakeoff(session, graph, 'bas_points', { bas_project_review: request });
  assert.ok('bas_project_review' in restored);
  assert.deepEqual(restored, before, 'All compile values, history and citations—not just finding count—must match');
  assert.deepEqual(restored.bas_project_review, await basProjectReview(session.basWorkflow, request.capture_id));
  assert.deepEqual(graph, beforeGraph);
});

test('saved failed and excluded engineering constraints keep original inputs/outcomes and source bboxes', async () => {
  const f = await engineeringFixture();
  const register = structuredClone(f.register), check = register.input.checks[0];
  assert.equal(check.kind, 'signal'); if (check.kind !== 'signal') throw new Error('Signal fixture required');
  check.source_mode = explicit('current');
  let saved = await applyBasEngineeringReview(f.workflow, { ...f.request, register }, 'operator_input');
  const view = await basProjectReview(saved.workflow, f.request.capture_id);
  const failure = view.issues.find(i => i.code === 'constraint_fail')!;
  assert.ok(failure); assert.equal(failure.disposition, 'included'); assert.equal(failure.source_event_id, saved.event.event_id);
  const original = JSON.parse(failure.original_finding_json);
  assert.equal(original.constraint.rule_id, 'signal.mode'); assert.deepEqual(original.original_check, check);
  assert.deepEqual(failure.evidence[0].bbox_px, f.source.pages[0].spans[1].bbox_px);
  register.targets[0].disposition = 'excluded'; register.targets[0].exclusion_reason = 'Controlled scope exclusion, not a pass';
  saved = await applyBasEngineeringReview(saved.workflow, { ...f.request, operation_id: uuid(80), expected_head: saved.event.event_id, register }, 'operator_input');
  const excluded = await basProjectReview(saved.workflow, f.request.capture_id);
  const retained = excluded.issues.find(i => i.code === 'constraint_fail')!;
  assert.equal(retained.disposition, 'excluded'); assert.equal(retained.severity, 'blocker');
  assert.equal(JSON.parse(retained.original_finding_json).constraint.status, 'fail');
  assert.ok(excluded.issues.some(i => i.code === 'engineering_check_explicitly_excluded'));
  assert.equal(excluded.readiness, 'not_evaluated');
  assert.equal(saved.workflow.engineering_events!.length, 2);
});

test('opt-in production review equals the UI shared projection and leaves existing compile outputs/history unchanged', async () => {
  const f = await engineeringFixture();
  const graph = { available: true, tables: f.tables, sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  const session = { basWorkflow: f.workflow, basSourcesForPipeline: () => f.source,
    retainBasWorkflow(next: typeof f.workflow) { this.basWorkflow = next; return true; } };
  const baseline = await compileProductionTakeoff(session, graph, 'bas_points');
  assert.equal('bas_project_review' in baseline, false);
  const before = structuredClone(session.basWorkflow), beforeGraph = structuredClone(graph);
  const request = { capture_id: session.basWorkflow.current_capture_id! };
  const read = await compileProductionTakeoff(session, graph, 'bas_points', { bas_project_review: request });
  assert.ok('bas_project_review' in read);
  assert.deepEqual(basProjectReviewSchema.parse(read.bas_project_review), await basProjectReview(before, request.capture_id));
  assert.deepEqual(compileCorpusTakeoffOutput.bas_project_review.parse(read.bas_project_review), read.bas_project_review);
  const { bas_project_review: _view, ...existing } = read;
  assert.deepEqual(existing, baseline); assert.deepEqual(session.basWorkflow, before); assert.deepEqual(graph, beforeGraph);
  await assert.rejects(compileProductionTakeoff(session, graph, 'hvac_equipment', { bas_project_review: request }), /only available/);
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_project_review: { capture_id: '0'.repeat(64) } }), /retained BAS capture/);
  assert.deepEqual(session.basWorkflow, before);
  const replaced = { ...session, retainBasWorkflow() { return false; } };
  await assert.rejects(compileProductionTakeoff(replaced, graph, 'bas_points', { bas_project_review: request }), /drawing set changed/);
});

test('actual assigned-value calculation does not duplicate the original capture coverage finding', async () => {
  const f = await engineeringFixture({ withSequence: true });
  const points = structuredClone(f.capture.points); points.issues.push('SOURCE_DISCOVERY_COVERAGE_UNVERIFIED');
  const initial = await captureBasEvidence(f.source, points, f.capture.equipment_sources);
  const register: BasEquipmentRegister = structuredClone(f.equipment);
  register.assignments.push({ assignment_id: uuid(90), matrix_id: points.matrices[0].matrix_id,
    equipment_ids: [uuid(11)], excluded_equipment_ids: [], source_span_ids: [], sequence_region_ids: [],
    applicability: 'per_equipment', reason: 'Controlled empty-template applicability; no completeness claim' });
  const reviewed = await applyBasEquipmentReview(initial, { operation_id: uuid(91), capture_id: initial.current_capture_id,
    expected_head: null, reason: 'Controlled assignment review', register }, 'operator_input');
  const calculated = await calculateBasAssignments(reviewed, { capture_id: reviewed.current_capture_id!, expected_equipment_head: reviewed.equipment_events!.at(-1)!.event_id });
  const before = structuredClone(calculated.workflow);
  const view = await basProjectReview(before, before.current_capture_id!);
  assert.equal(view.issues.filter(i => i.code === 'SOURCE_DISCOVERY_COVERAGE_UNVERIFIED').length, 1);
  assert.equal(new Set(view.issues.map(i => i.occurrence_id)).size, view.issues.length);
  assert.ok(view.issues.some(i => i.code === 'UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED'));
  assert.ok(view.issues.some(i => i.code === 'FIELD_WIRING_NOT_ESTABLISHED'));
  assert.ok(view.issues.every(i => i.known_code));
  assert.deepEqual(calculated.workflow, before);
});
