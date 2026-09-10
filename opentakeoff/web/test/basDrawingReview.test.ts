import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { captureBasEvidence, captureBasPoints, basWorkflowSchema, basEventFingerprint,
  mergeBasWorkflows, retainBasWorkflowHistory, verifyBasWorkflow, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { applyBasDrawingReview } from '../src/lib/basDrawingReview.ts';
import { BAS_DRAWING_RULE, basDrawingRequestSchema, type BasDrawingAction, type BasDrawingEvent } from '../src/lib/basDrawingContract.ts';
import { basDrawingCapturePages, basDrawingDependencyFingerprint, compareBasDrawingPages,
  replayBasDrawingHistory, suggestBasDrawingRevision } from '../src/lib/basDrawingRevision.ts';
import { BAS_WORKFLOW_REVISIONS } from '../src/lib/basWorkflowRevision.ts';
import { createLocalStore } from '../src/lib/store.js';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../src/lib/basAssemblyReview.ts';
import { prepareBasWorkflowReplay } from '../src/lib/basWorkflowReplay.ts';

const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
const date = '2026-09-10T10:00:00.000Z';
// Controlled text-shaped versions; not actual PDF revisions or installed truth.
async function fixture(hash = 'a', texts = ['M-101 AHU-1', 'M-102 AHU-2'], name = 'controlled.pdf') {
  const source = buildBasSourceContext([{ sha256: hash.repeat(64), byte_length: 100, name, page_count: texts.length,
    pages: texts.map((str, i) => ({ page_number: i + 1, sheet_key: `${name}#${i + 1}`, width_px: 1000, height_px: 800,
      rotation: 0, spans: str ? [{ str, x0: 10, y0: 10, x1: 200, y1: 30 }] : [] })) }]);
  return captureBasEvidence(source, points);
}
const request = async (w: BasWorkflow, action: BasDrawingAction, n = 1) => ({ operation_id: uuid(n),
  expected_head: w.drawing_events?.at(-1)?.event_id ?? null, expected_dependencies: await basDrawingDependencyFingerprint(action),
  reviewer: 'Controlled reviewer (self-declared)', reason: 'Controlled page-accounting decision; no approval', action });
const apply = async (w: BasWorkflow, action: BasDrawingAction, n = 1) => applyBasDrawingReview(w, await request(w, action, n), 'operator_input', date);
async function initial(w: BasWorkflow) { return apply(w, { kind: 'create_source_set', name: 'Baseline', pages: basDrawingCapturePages(w.captures[0]) }); }
const replay = (w: BasWorkflow) => replayBasDrawingHistory(w.captures, w.drawing_events);
const firstSet = (w: BasWorkflow) => [...replay(w).source_sets.values()][0];

test('initial source set preserves every capture and source frame, selection order and history-only navigation', async () => {
  const w = await fixture(), before = structuredClone(w);
  const action: BasDrawingAction = { kind: 'create_source_set', name: 'Explicit source order', pages: basDrawingCapturePages(w.captures[0]).reverse() };
  const next = await apply({ ...w, current_capture_id: null }, action);
  assert.equal(next.current_capture_id, null); assert.equal(next.revision, 'bas_review_7');
  assert.deepEqual(next.captures, before.captures); assert.deepEqual(firstSet(next).pages, action.pages);
  assert.equal(firstSet(next).source_set_id, next.drawing_events![0].event_id);
  assert.deepEqual(await verifyBasWorkflow(next), next); assert.deepEqual(w, before);
});

test('same-byte rename is redundant, does not duplicate source pages or rebind interpretation', async () => {
  const w = await initial(await fixture()), renamed = await fixture('a', undefined, 'renamed.pdf');
  assert.equal(renamed.current_capture_id, w.current_capture_id);
  const action = suggestBasDrawingRevision(firstSet(w), renamed.captures[0], 'replacement_set', 'Duplicate delivery');
  assert.deepEqual(action.baseline.map(b => b.disposition), ['retained', 'retained']);
  assert.deepEqual(action.incoming.map(b => b.disposition), ['redundant', 'redundant']);
  const next = await apply(w, action, 2);
  assert.deepEqual([...replay(next).source_sets.values()].at(-1)!.pages, firstSet(w).pages);
  const changedPoints = structuredClone(points); changedPoints.issues.push('CONTROLLED_NEW_ANALYSIS');
  const newer = await captureBasEvidence(w.captures[0].narrative_sources!, changedPoints);
  const merged = mergeBasWorkflows(w, newer, true)!;
  const retained = await apply(merged, suggestBasDrawingRevision(firstSet(w), newer.captures[0], 'replacement_set', 'New analysis of same bytes'), 3);
  assert.deepEqual([...replay(retained).source_sets.values()].at(-1)!.pages, firstSet(w).pages);
  assert.notEqual(retained.current_capture_id, firstSet(w).pages[0].capture_id);
});

test('partial addendum omissions propose retention, replacement omissions stay unresolved, no suggested event writes', async () => {
  const w = await initial(await fixture()), incoming = await fixture('b', ['M-103 ADDITION']);
  const merged = mergeBasWorkflows(w, incoming, true)!, before = structuredClone(merged);
  const action = suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'partial_addendum', 'Addendum');
  assert.deepEqual(action.baseline.map(b => b.disposition), ['retained', 'retained']);
  assert.equal(action.incoming[0].disposition, 'unresolved'); assert.deepEqual(merged, before);
  assert.ok(suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'replacement_set', 'Replacement').baseline.every(b => b.disposition === 'unresolved'));
  const pending = await apply(merged, action, 2);
  assert.equal(replay(pending).source_sets.size, 1); assert.equal(replay(pending).revisions[0].source_set_id, null);
  action.incoming[0].disposition = 'addition'; action.incoming[0].reason = 'Explicit controlled addition';
  const resolved = await apply(pending, action, 3), sets = [...replay(resolved).source_sets.values()];
  assert.equal(sets[1].pages.length, 3); assert.deepEqual(sets[1].pages.slice(0, 2), sets[0].pages);
  assert.equal(resolved.drawing_events!.length, 3); assert.equal(replay(resolved).revisions[0].source_set_id, null);
});

test('explicit reciprocal replacement supports reordered/renumbered pages without transfer of old bboxes', async () => {
  const w = await initial(await fixture()), incoming = await fixture('b', ['M-202 AHU-2', 'M-201 AHU-1']);
  const merged = mergeBasWorkflows(w, incoming, true)!;
  const action = suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'replacement_set', 'Reordered controlled set');
  action.baseline.forEach((b, i) => { b.disposition = 'replaced'; b.incoming_page_id = action.incoming[1 - i].page_id; });
  action.incoming.forEach((p, i) => { p.disposition = 'replacement'; p.baseline_page_id = action.baseline[1 - i].page.page_id; });
  const next = await apply(merged, action, 2), set = [...replay(next).source_sets.values()].at(-1)!;
  assert.deepEqual(set.pages.map(p => p.page_id), [action.incoming[1].page_id, action.incoming[0].page_id]);
  assert.ok(set.pages.every(p => p.capture_id === incoming.current_capture_id));
  assert.deepEqual(next.captures, merged.captures);
});

test('explicit removals and additions record split pages without pretending item or quantity matching', async () => {
  const w = await initial(await fixture('a', ['COMBINED PAGE'])), incoming = await fixture('b', ['SPLIT A', 'SPLIT B']);
  const merged = mergeBasWorkflows(w, incoming)!;
  const action = suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'replacement_set', 'Explicit split');
  action.baseline[0].disposition = 'removed'; action.incoming.forEach(p => { p.disposition = 'addition'; });
  const next = await apply(merged, action, 2);
  assert.deepEqual([...replay(next).source_sets.values()].at(-1)!.pages, basDrawingCapturePages(incoming.captures[0]));
  const comparison = compareBasDrawingPages(merged.captures, firstSet(w).pages[0], basDrawingCapturePages(incoming.captures[0])[0]);
  assert.equal(comparison.quantity_changes, 'not_assessed'); assert.equal(comparison.approval_impact, 'not_assessed');
});

test('foreign, duplicate, missing and many-to-one page accounting is rejected', async () => {
  const w = await initial(await fixture()), incoming = await fixture('b');
  const merged = mergeBasWorkflows(w, incoming)!;
  const fresh = () => suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'replacement_set', 'Invalid accounting control');
  const cases = [
    (a: ReturnType<typeof fresh>) => { a.baseline.pop(); },
    (a: ReturnType<typeof fresh>) => { a.incoming.pop(); },
    (a: ReturnType<typeof fresh>) => { a.baseline[1] = structuredClone(a.baseline[0]); },
    (a: ReturnType<typeof fresh>) => { a.incoming[1] = structuredClone(a.incoming[0]); },
    (a: ReturnType<typeof fresh>) => { a.baseline[0].page.capture_id = incoming.current_capture_id!; },
    (a: ReturnType<typeof fresh>) => { a.incoming[0].page_id = `sha256:${'f'.repeat(64)}:p1`; },
    (a: ReturnType<typeof fresh>) => { a.incoming_capture_id = 'f'.repeat(64); },
    (a: ReturnType<typeof fresh>) => { a.baseline_source_set_id = 'f'.repeat(64); },
    (a: ReturnType<typeof fresh>) => { a.baseline[0].incoming_page_id = a.incoming[0].page_id; },
    (a: ReturnType<typeof fresh>) => { a.incoming[0].baseline_page_id = a.baseline[0].page.page_id; },
    (a: ReturnType<typeof fresh>) => {
      a.baseline.forEach(b => { b.disposition = 'replaced'; b.incoming_page_id = a.incoming[0].page_id; });
      a.incoming[0].disposition = 'replacement'; a.incoming[0].baseline_page_id = a.baseline[0].page.page_id;
    },
    (a: ReturnType<typeof fresh>) => { a.baseline[0].disposition = 'retained'; a.incoming[0].disposition = 'redundant'; a.incoming[0].baseline_page_id = a.baseline[0].page.page_id; },
  ];
  for (const change of cases) { const a = fresh(); change(a); await assert.rejects(apply(merged, a, 2)); }
  assert.equal(w.drawing_events!.length, 1);
});

test('unresolved revision cannot serve as a complete source-set baseline', async () => {
  const w = await initial(await fixture()), incoming = await fixture('b');
  const merged = mergeBasWorkflows(w, incoming)!;
  const action = suggestBasDrawingRevision(firstSet(w), incoming.captures[0], 'replacement_set', 'Pending');
  const next = await apply(merged, action, 2);
  action.baseline_source_set_id = next.drawing_events!.at(-1)!.event_id;
  await assert.rejects(apply(next, action, 3), /preceding complete source set/);
});

test('source set cannot duplicate physical pages across different interpretation captures', async () => {
  const w = await fixture(), changed = structuredClone(points); changed.issues.push('CONTROLLED_ANALYSIS');
  const newer = await captureBasEvidence(w.captures[0].narrative_sources!, changed);
  const merged = mergeBasWorkflows(w, newer)!;
  await assert.rejects(apply(merged, { kind: 'create_source_set', name: 'Duplicate',
    pages: [basDrawingCapturePages(w.captures[0])[0], basDrawingCapturePages(newer.captures[0])[0]] }), /same physical page twice/);
  await assert.rejects(apply(w, { kind: 'create_source_set', name: 'Foreign', pages: [{ capture_id: w.current_capture_id!, page_id: `sha256:${'a'.repeat(64)}:p99` }] }), /not owned/);
});

test('same sheet numbers in different originals stay distinct and re-exports are not byte-identical or quantity deltas', async () => {
  const w = await fixture(), reexport = await fixture('b'), merged = mergeBasWorkflows(w, reexport)!;
  const before = basDrawingCapturePages(w.captures[0])[0], after = basDrawingCapturePages(reexport.captures[0])[0];
  const next = await apply(merged, { kind: 'create_source_set', name: 'Distinct originals', pages: [before, after] });
  assert.equal(firstSet(next).pages.length, 2);
  const comparison = compareBasDrawingPages(merged.captures, before, after);
  assert.equal(comparison.source_identity, 'different_original_page'); assert.equal(comparison.retained_text_geometry, 'equal');
  assert.equal(comparison.quantity_changes, 'not_assessed'); assert.equal(comparison.source_bytes, 'not_verified');
});

test('text, frame, order changes and absent narrative evidence remain honest independent comparison dimensions', async () => {
  const w = await fixture(), changed = await fixture('b', ['M-101 AHU-9', 'M-102 AHU-2']);
  const blank = await fixture('c', ['', '']), legacy = await captureBasPoints(w.captures[0].sources, points);
  const first = basDrawingCapturePages(w.captures[0])[0];
  assert.equal(compareBasDrawingPages([...w.captures, ...changed.captures], first, basDrawingCapturePages(changed.captures[0])[0]).retained_text_geometry, 'changed');
  const framed = structuredClone(w.captures[0].narrative_sources!); framed.pages[0].width_px += 1;
  const frame = await captureBasEvidence(framed, points);
  assert.equal(compareBasDrawingPages([...w.captures, ...frame.captures], first, basDrawingCapturePages(frame.captures[0])[0]).retained_text_geometry, 'changed');
  assert.equal(compareBasDrawingPages(blank.captures, basDrawingCapturePages(blank.captures[0])[0], basDrawingCapturePages(blank.captures[0])[0]).retained_text_geometry, 'unavailable');
  assert.equal(compareBasDrawingPages([...w.captures, ...legacy.captures], first, basDrawingCapturePages(legacy.captures[0])[0]).retained_text_geometry, 'unavailable');
  assert.throws(() => compareBasDrawingPages(w.captures, first, basDrawingCapturePages(changed.captures[0])[0]), /not owned/);
});

test('exact retries, owned pending request, stale heads and changed operations are guarded', async () => {
  const w = await fixture(), action: BasDrawingAction = { kind: 'create_source_set', name: 'Original request', pages: basDrawingCapturePages(w.captures[0]) };
  const r = await request(w, action), savedRequest = structuredClone(r);
  const pending = applyBasDrawingReview(w, r, 'operator_input', date);
  r.action.name = 'Mutated after start';
  const next = await pending;
  assert.equal(firstSet(next).name, 'Original request');
  assert.deepEqual(await applyBasDrawingReview(next, savedRequest, 'operator_input', '2026-09-11T00:00:00.000Z'), next);
  await assert.rejects(applyBasDrawingReview(next, r, 'operator_input', date), /reused/);
  await assert.rejects(applyBasDrawingReview(next, savedRequest, 'agent_proposal', date), /reused/);
  await assert.rejects(applyBasDrawingReview(next, { ...savedRequest, operation_id: uuid(2) }, 'operator_input', date), /changed since/);
  await assert.rejects(applyBasDrawingReview(w, { ...savedRequest, expected_dependencies: '0'.repeat(64) }, 'operator_input', date), /dependencies changed/);
});

test('workflow verification rejects changed event digests/dependencies and all journal operation collisions', async () => {
  const w = await initial(await fixture());
  const bad = structuredClone(w); bad.drawing_events![0].reviewer = 'Altered person';
  await assert.rejects(verifyBasWorkflow(bad), /event fingerprint/);
  const dep = structuredClone(w); dep.drawing_events![0].expected_dependencies = '0'.repeat(64);
  const { event_id: _id, ...payload } = dep.drawing_events![0]; dep.drawing_events![0].event_id = await basEventFingerprint(payload);
  await assert.rejects(verifyBasWorkflow(dep), /dependency fingerprint/);
  const f = await engineeringFixture();
  const a: BasDrawingAction = { kind: 'create_source_set', name: 'Collision', pages: basDrawingCapturePages(f.capture) };
  const r = await request(f.workflow, a); r.operation_id = f.workflow.equipment_events![0].operation_id;
  await assert.rejects(applyBasDrawingReview(f.workflow, r, 'operator_input', date), /Duplicate BAS review/);
});

test('all six prior revisions upgrade without rewriting prior values and imports preserve or reject competing history', async () => {
  const w = await fixture(), legacy = await captureBasPoints(w.captures[0].sources, points);
  for (const revision of BAS_WORKFLOW_REVISIONS.slice(0, BAS_WORKFLOW_REVISIONS.indexOf('bas_review_7'))) {
    const old = { ...(revision === 'point_captures_1' ? legacy : w), revision };
    const next = await initial(old);
    assert.deepEqual(next.captures, old.captures); assert.deepEqual(await verifyBasWorkflow(next), next);
    assert.deepEqual(mergeBasWorkflows(old, next), next); assert.deepEqual(mergeBasWorkflows(next, old), next);
    assert.deepEqual(retainBasWorkflowHistory(old, next), next);
    assert.throws(() => basWorkflowSchema.parse({ ...next, revision }), /requires/);
  }
  const a = await initial(w), b = await apply(w, { kind: 'create_source_set', name: 'Competing decision', pages: basDrawingCapturePages(w.captures[0]) }, 2);
  assert.throws(() => mergeBasWorkflows(a, b), /Divergent/);
  assert.throws(() => basDrawingRequestSchema.parse({ ...{}, future_field: true }));
  assert.throws(() => basWorkflowSchema.parse({ ...a, revision: 'future_8' }));
});

test('existing equipment and assembly edit paths preserve newer drawing journals and revision', async () => {
  const f = await engineeringFixture(), w = await initial(f.workflow);
  const equipment = await applyBasEquipmentReview(w, { operation_id: uuid(301), capture_id: w.current_capture_id,
    expected_head: w.equipment_events!.at(-1)!.event_id, reason: 'Existing edit path after drawing review', register: f.equipment }, 'operator_input');
  const assembly = await applyBasAssemblyReview(equipment, { operation_id: uuid(302), capture_id: w.current_capture_id,
    expected_head: w.assembly_events!.at(-1)!.event_id, expected_equipment_head: equipment.equipment_events!.at(-1)!.event_id,
    reason: 'Existing assembly path after drawing review', register: f.assembly }, 'operator_input');
  assert.equal(assembly.revision, 'bas_review_7'); assert.deepEqual(assembly.drawing_events, w.drawing_events);
});

test('strict requests reject unknown fields, invalid modes and empty reviews rather than dropping intent', async () => {
  const w = await fixture(), r = await request(w, { kind: 'create_source_set', name: 'Strict request', pages: basDrawingCapturePages(w.captures[0]) });
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, ignored_approval: true }), /Unrecognized/);
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, reviewer: '   ' }));
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, action: { ...r.action, pages: [] } }));
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, action: { ...r.action, unknown_meaning: true } }), /Unrecognized/);
  const initialSet = await initial(w), suggestion = suggestBasDrawingRevision(firstSet(initialSet), w.captures[0], 'partial_addendum', 'Strict mode');
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, action: { ...suggestion, mode: 'guess_revision' } }));
});

test('large inventories and cumulative page accounting refuse explicitly at their declared limits', async () => {
  const w = await fixture(), c = { ...w.captures[0], sources: [{ ...w.captures[0].sources[0], page_count: 25001 }] };
  assert.throws(() => basDrawingCapturePages(c), /25,000-page/);
  const r = await request(w, { kind: 'create_source_set', name: 'Oversize', pages: basDrawingCapturePages(w.captures[0]) });
  assert.throws(() => basDrawingRequestSchema.parse({ ...r, action: { ...r.action, pages: Array(25001).fill(basDrawingCapturePages(w.captures[0])[0]) } }));
  // Structural replay only: fake but distinct event digests isolate the aggregate
  // bound. This is not cryptographic workflow or source verification.
  const capture = { capture_id: 'a'.repeat(64), sources: [{ ...c.sources[0], page_count: 1000 }] };
  const pages = basDrawingCapturePages(capture), events: BasDrawingEvent[] = [];
  for (let i = 0; i <= 125; i++) {
    const previous = events.at(-1);
    const action = !previous ? { kind: 'create_source_set' as const, name: 'Bounded history', pages }
      : suggestBasDrawingRevision({ source_set_id: previous.event_id, name: 'Prior', pages, origin: 'operator_input' }, capture, 'replacement_set', 'Repeated controlled pages');
    events.push({ ...r, action, operation_id: uuid(i), event_id: i.toString(16).padStart(64, '0'),
      expected_head: previous?.event_id ?? null, rule_version: BAS_DRAWING_RULE, created_at: date, origin: 'operator_input' });
  }
  assert.equal(replayBasDrawingHistory([capture], events.slice(0, -1)).source_sets.size, 125);
  assert.throws(() => replayBasDrawingHistory([capture], events), /250,000 page-accounting-entry/);
});

test('real retained PDF history, IDB reload, JSON export and replay receipts preserve source correspondence', async () => {
  const real = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8')).bas_workflow;
  const w = await initial(real), store = createLocalStore('controlled-bas-drawing-history');
  await store.saveAnnotations({ bas_workflow: w });
  const loaded = JSON.parse(JSON.stringify((await store.loadAnnotations()).bas_workflow));
  assert.deepEqual(await verifyBasWorkflow(loaded), w);
  assert.deepEqual(loaded.captures, real.captures); assert.deepEqual(loaded.engineering_events, real.engineering_events);
  const before = await prepareBasWorkflowReplay(real), after = await prepareBasWorkflowReplay(loaded);
  assert.notEqual(before.workflow_sha256, after.workflow_sha256);
  assert.deepEqual(before.checked_records, after.checked_records);
  assert.equal(firstSet(loaded).pages.length, 9);
});
