/** Actual shared Python comparison-journal integration. Controlled revisions,
 * not public transport, real issued addenda or installed-quantity ground truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonFixture } from '../../web/test/helpers/basRevisionComparisonFixture.ts';
import { revisionFixture, addRevisionSourceSet } from '../../web/test/helpers/basRevisionFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { prepareBasRevisionReview, recordBasRevisionReview, readBasRevisionReview } from '../src/basRevisionReview.ts';
import { basEventFingerprint, verifyBasWorkflow, type BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import type { BasRevisionReviewRequest, BasRevisionReviewEvent } from '../../web/src/lib/basRevisionReviewContract.ts';
import { prepareBasRevisionComparison, basRevisionReportFingerprint } from '../../web/src/lib/basRevisionComparison.ts';
import { applyBasReview } from '../../web/src/lib/basReview.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

const date = '2026-09-10T12:00:00.000Z';
type Preview = Awaited<ReturnType<typeof prepareBasRevisionReview>>;
const request = (preview: Preview, n = 700): BasRevisionReviewRequest => ({ comparison: preview.comparison,
  expected_head: preview.expected_head, expected_report_fingerprint: preview.expected_report_fingerprint,
  operation_id: uuid(n), name: 'Controlled drawing revision', reviewer: 'Self-declared test reviewer',
  reason: 'Explicit correspondence, not a takeoff approval' });
async function resign(event: BasRevisionReviewEvent) {
  const { event_id: _id, ...payload } = event;
  event.event_id = await basEventFingerprint(payload);
}

test('canonical JSON property reordering cannot change the replayed comparison or any source reference', async () => {
  const f = await comparisonFixture({ ai: 4 }), preview = await prepareBasRevisionReview(f.workflow, f.request);
  const saved = await recordBasRevisionReview(f.workflow, request(preview, 790), 'operator_input');
  const canonical = JSON.parse(canonicalBasJson(saved.workflow));
  assert.deepEqual(canonical, saved.workflow, 'Only object property order changes');
  const replayed = await readBasRevisionReview(canonical, saved.event.event_id);
  assert.equal(replayed.report_verification, 'matches_saved_report');
  assert.deepEqual(replayed.report, preview.report, 'Every source text, bbox, quantity, identity and report field remains exact');
});

test('prepare, record, JSON reopen and actual Python replay preserve changed counts, SOO, evidence and unresolveds', async () => {
  const f = await comparisonFixture({ ai: 4, variable: 'RETURN AIR TEMPERATURE' }), original = structuredClone(f.workflow);
  const preview = await prepareBasRevisionReview(f.workflow, f.request);
  assert.equal(preview.recorded, false); assert.equal(preview.approved, false);
  const saved = await recordBasRevisionReview(f.workflow, request(preview), 'operator_input', { createdAt: date });
  assert.equal(saved.workflow.revision, 'bas_revision_8'); assert.equal(saved.event.approved, false);
  assert.equal(saved.event.expected_report_fingerprint, preview.expected_report_fingerprint);
  assert.deepEqual(saved.workflow.captures, original.captures); assert.deepEqual(f.workflow, original);
  const opened = await readBasRevisionReview(JSON.parse(JSON.stringify(saved.workflow)), saved.event.event_id);
  assert.equal(opened.report_verification, 'matches_saved_report'); assert.deepEqual(opened.report, preview.report);
  const row = opened.report.rows.find(r => r.before?.kind === 'point_row')!;
  const ai = row.quantities.find(q => q.before?.dimension === 'declared_io:AI')!;
  assert.deepEqual([ai.before!.value, ai.after!.value, ai.delta], [2, 4, 2]);
  assert.equal(row.quantities.find(q => q.before?.dimension === 'declared_io:DI')!.delta, null);
  assert.ok(opened.report.rows.some(r => r.before?.kind === 'sequence_requirement' && r.declared_fields_equal === false));
  assert.equal(opened.report.installed_quantity, null);
  const unresolved = await prepareBasRevisionReview(saved.workflow, { ...f.request, matches: [] });
  assert.ok(unresolved.report.rows.some(r => r.disposition === 'unresolved_before'));
  const second = await recordBasRevisionReview(saved.workflow, request(unresolved, 701), 'agent_proposal');
  assert.equal(second.event.origin, 'agent_proposal'); assert.equal(second.event.approved, false);
  const retry = await recordBasRevisionReview(second.workflow, request(preview), 'operator_input');
  assert.deepEqual(retry.workflow, second.workflow); assert.deepEqual(retry.event, saved.event);
});

test('changed head, preview, request, origin and foreign correspondence fail without changing history', async () => {
  const f = await comparisonFixture(), preview = await prepareBasRevisionReview(f.workflow, f.request), r = request(preview);
  const saved = await recordBasRevisionReview(f.workflow, r, 'operator_input'), before = structuredClone(saved.workflow);
  await assert.rejects(recordBasRevisionReview(saved.workflow, { ...r, operation_id: uuid(701) }, 'operator_input'), /changed since/);
  await assert.rejects(recordBasRevisionReview(f.workflow, { ...r, expected_report_fingerprint: 'e'.repeat(64) }, 'operator_input'), /preview changed/);
  await assert.rejects(recordBasRevisionReview(saved.workflow, { ...r, reason: 'Different purpose' }, 'operator_input'), /reused/);
  await assert.rejects(recordBasRevisionReview(saved.workflow, r, 'agent_proposal'), /reused/);
  await assert.rejects(recordBasRevisionReview(f.workflow, { ...r, operation_id: f.workflow.drawing_events![0].operation_id }, 'operator_input'), /Duplicate/);
  const foreign = structuredClone(r); foreign.comparison.matches[0].before_item_id = 'e'.repeat(64);
  await assert.rejects(recordBasRevisionReview(f.workflow, foreign, 'operator_input'), /outside|owned|inventory|Unknown|foreign/i);
  assert.deepEqual(saved.workflow, before);
});

test('a re-signed fabricated report binding is explicitly mismatched; foreign items cannot replay', async () => {
  const f = await comparisonFixture(), preview = await prepareBasRevisionReview(f.workflow, f.request);
  const saved = await recordBasRevisionReview(f.workflow, request(preview), 'operator_input');
  const fabricated = structuredClone(saved.workflow), event = fabricated.revision_events![0];
  event.expected_report_fingerprint = 'e'.repeat(64); await resign(event);
  await verifyBasWorkflow(fabricated); // Lineage alone deliberately does not prove a report.
  const reopened = await readBasRevisionReview(fabricated, event.event_id);
  assert.equal(reopened.report_verification, 'different_from_saved_report'); assert.equal(reopened.approved, false);
  event.comparison.matches[0].before_item_id = 'e'.repeat(64); await resign(event);
  await verifyBasWorkflow(fabricated);
  await assert.rejects(readBasRevisionReview(fabricated, event.event_id), /outside|owned|inventory|Unknown|foreign/i);
  const pending = await prepareBasRevisionComparison(f.workflow, f.request);
  await assert.rejects(basRevisionReportFingerprint(pending.report), /pending comparison/);
});

test('every existing decision/calculation write preserves the journal and old pinned replay after relevant edits', async () => {
  const f = await revisionFixture(), comparison = { before: f.basis, after: f.basis, matches: [], added: [], removed: [], membership_reviews: [] };
  const preview = await prepareBasRevisionReview(f.workflow, comparison), saved = await recordBasRevisionReview(f.workflow, request(preview), 'operator_input');
  const capture_id = f.workflow.current_capture_id!;
  let w = saved.workflow;
  const preserved = async (next: BasWorkflow) => {
    assert.equal(next.revision, 'bas_revision_8'); assert.deepEqual(next.revision_events, saved.workflow.revision_events);
    await verifyBasWorkflow(next); w = next;
  };
  await preserved(await applyBasReview(w, { capture_id, operation_id: uuid(710), expected_head: f.basis.captures[0].sequence_head,
    action: { ...w.review_events![0].action } }, 'operator_input'));
  const equipment = structuredClone(f.equipment); equipment.assignments[0].excluded_equipment_ids = [uuid(12)];
  await preserved(await applyBasEquipmentReview(w, { capture_id, operation_id: uuid(711), expected_head: f.basis.captures[0].equipment_head,
    register: equipment, reason: 'Controlled applicability exception' }, 'operator_input'));
  const equipmentHead = w.equipment_events!.at(-1)!.event_id;
  await preserved(await applyBasAssemblyReview(w, { capture_id, operation_id: uuid(712), expected_head: f.basis.captures[0].assembly_head,
    expected_equipment_head: equipmentHead, register: f.assembly, reason: 'Review against changed applicability' }, 'operator_input'));
  await preserved((await calculateBasAssignments(w, { capture_id, expected_equipment_head: equipmentHead })).workflow);
  await preserved((await calculateBasAssemblies(w, { capture_id, expected_equipment_head: equipmentHead,
    expected_assembly_head: w.assembly_events!.at(-1)!.event_id })).workflow);
  await preserved((await applyBasEngineeringReview(w, { capture_id, operation_id: uuid(713), expected_head: null,
    expected_equipment_head: equipmentHead, expected_assembly_head: w.assembly_events!.at(-1)!.event_id,
    expected_sequence_head: w.review_events!.at(-1)!.event_id, register: f.engineering, reason: 'Controlled engineering inputs' }, 'operator_input')).workflow);
  await preserved(await addRevisionSourceSet(w, undefined, 714));
  const reopened = await readBasRevisionReview({ ...w, current_capture_id: null }, saved.event.event_id);
  assert.equal(reopened.report_verification, 'matches_saved_report'); assert.deepEqual(reopened.report, preview.report);
});

test('missing runtime, cancellation and deadlines leave callers unchanged; nested raw metadata is owned before await', async () => {
  const f = await comparisonFixture(), original = structuredClone(f.workflow);
  await assert.rejects(prepareBasRevisionReview(f.workflow, f.request, { python: '/nonexistent-bas-test-python' }), /ENOENT|Python|spawn/i);
  const cancelled = AbortSignal.abort(new Error('Controlled user cancellation'));
  await assert.rejects(prepareBasRevisionReview(f.workflow, f.request, { signal: cancelled }), /Controlled user cancellation/);
  await assert.rejects(prepareBasRevisionReview(f.workflow, f.request, { timeoutMs: 0 }), /timed out/);
  for (const timeoutMs of [-1, 1.5, NaN, Infinity]) await assert.rejects(prepareBasRevisionReview(f.workflow, f.request, { timeoutMs }), /finite nonnegative/);
  assert.deepEqual(f.workflow, original);
  const expected = await prepareBasRevisionReview(original, f.request), inFlight = prepareBasRevisionReview(f.workflow, f.request);
  const table = f.workflow.captures[0].equipment_sources!.tables[0] as Record<string, unknown>;
  (table.retained_extra_metadata as { values: unknown[] }).values.push('Mutation after service entry');
  const result = await inFlight;
  assert.deepEqual(result, expected);
});

test('request ordering is canonical and pending caller mutations cannot change a recorded review', async () => {
  const f = await comparisonFixture(), preview = await prepareBasRevisionReview(f.workflow, f.request), r = request(preview);
  const owned = structuredClone(r), pending = recordBasRevisionReview(f.workflow, r, 'operator_input');
  r.comparison.matches[0].reason = 'Mutated after entry'; r.reason = 'Mutated purpose';
  const saved = await pending;
  assert.equal(saved.event.reason, owned.reason);
  assert.deepEqual(saved.event.comparison, owned.comparison);
  const reordered = structuredClone(owned); reordered.comparison.matches.reverse();
  const retry = await recordBasRevisionReview(saved.workflow, reordered, 'operator_input');
  assert.deepEqual(retry.workflow, saved.workflow); assert.deepEqual(retry.event, saved.event);
});

test('record and reopen cancellation, zero deadlines and absent runtime never mutate retained state', async () => {
  const f = await comparisonFixture(), preview = await prepareBasRevisionReview(f.workflow, f.request), r = request(preview);
  const saved = await recordBasRevisionReview(f.workflow, r, 'operator_input'), before = structuredClone(saved.workflow);
  for (const options of [{ signal: AbortSignal.abort(new Error('Controlled cancellation')) }, { timeoutMs: 0 }, { python: '/nonexistent-bas-test-python' }]) {
    await assert.rejects(recordBasRevisionReview(saved.workflow, r, 'operator_input', options), /cancellation|timed out|Python|spawn|ENOENT/i);
    await assert.rejects(readBasRevisionReview(saved.workflow, saved.event.event_id, options), /cancellation|timed out|Python|spawn|ENOENT/i);
  }
  const controller = new AbortController();
  const pending = readBasRevisionReview(saved.workflow, saved.event.event_id, { signal: controller.signal });
  controller.abort(new Error('Cancelled during replay'));
  await assert.rejects(pending, /Cancelled during replay/);
  await assert.rejects(readBasRevisionReview(saved.workflow, 'f'.repeat(64)), /not retained/);
  assert.deepEqual(saved.workflow, before);
});
