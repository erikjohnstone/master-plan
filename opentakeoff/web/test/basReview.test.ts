import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { buildBasSourceContext, basSourceContextSchema } from '../src/lib/basSources.ts';
import { captureBasEvidence, captureBasPoints, mergeBasWorkflows, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { applyBasReview, basActiveAssociations, basReviewHead, basSequenceView } from '../src/lib/basReview.ts';
import { interpretBasSequences } from '../src/lib/basSequenceReconciliation.ts';
import { createLocalStore } from '../src/lib/store.js';
import type { BasReviewRequest } from '../src/lib/basReviewContract.ts';

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const raw = read('../../docs/bas-production/evidence/baseline/fort-sam-text.json');
const old = read('../../docs/bas-production/evidence/point-workspace-compile.json');
const truth = read('./fixtures/bas-soo-monitor-cases.json');
const sources = buildBasSourceContext([{ name: 'reviewed.pdf', sha256: raw.sha256, byte_length: 924578,
  page_count: raw.pages.length, pages: raw.pages.map((p: any) => ({ page_number: p.page,
    sheet_key: `reviewed.pdf#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans })) }]);
const points = old.bas_point_lists;
const initial = await captureBasEvidence(sources, points);
const analysis = interpretBasSequences(sources);
const association = { region_id: analysis.regions.find(r => r.page_id.endsWith(':p8') && r.title === truth.title)!.region_id,
  matrix_id: points.matrices.find((m: any) => m.page_id.endsWith(':p8'))!.matrix_id,
  reason: 'Source-reviewed test association, not an actual human-approved takeoff.',
  equipment_references: [{ tag: 'DOAS 1 OR 2', span_ids: [`sha256:${raw.sha256}:p8:s61`],
    scope: { building: null, level: null, system: null, phase: null } }] };
const request = (n: number): BasReviewRequest => ({ operation_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  capture_id: initial.current_capture_id!, expected_head: null, action: { kind: 'upsert', association } });
const date = '2026-09-09T16:00:00.000Z';

test('retained SOO capture preserves every source and point, while old fingerprints remain exact', async () => {
  assert.deepEqual(basSourceContextSchema.parse(sources), sources);
  assert.deepEqual(initial.captures[0].narrative_sources, sources);
  assert.deepEqual(initial.captures[0].points, points);
  assert.deepEqual(await verifyBasWorkflow(initial), initial);
  assert.deepEqual(await captureBasEvidence(sources, points), initial);
  const legacy = await captureBasPoints(sources.documents, points);
  assert.equal(legacy.current_capture_id, old.bas_workflow.current_capture_id);
  assert.deepEqual(await verifyBasWorkflow(old.bas_workflow), old.bas_workflow);
  const renamed = structuredClone(sources);
  renamed.documents[0].names = ['renamed.pdf'];
  renamed.pages.forEach((p, i) => { p.sheet_keys = [`renamed.pdf#${i + 1}`]; });
  assert.equal((await captureBasEvidence(renamed, points)).current_capture_id, initial.current_capture_id);
  assert.equal(mergeBasWorkflows(legacy, initial)!.revision, 'bas_evidence_2');
});

test('source validation rejects omitted pages, misleading status, foreign IDs and broken geometry', () => {
  const changes = [
    (s: typeof sources) => { s.pages.pop(); },
    (s: typeof sources) => { s.pages[0].spans[0].span_id = 'invented'; },
    (s: typeof sources) => { s.pages[0].text_status = 'no_text'; },
    (s: typeof sources) => { s.pages[0].spans[0].bbox_px = [10, 10, 2, 2]; },
    (s: typeof sources) => { s.documents[0].sha256 = '0'.repeat(64); },
  ];
  for (const change of changes) { const s = structuredClone(sources); change(s); assert.throws(() => basSourceContextSchema.parse(s)); }
});

test('shared review records a source-preserving association and exact retries are idempotent', async () => {
  const before = structuredClone(initial);
  const next = await applyBasReview(initial, request(1), 'operator_input', date);
  assert.equal(next.review_events!.length, 1);
  assert.equal(next.review_events![0].origin, 'operator_input');
  assert.deepEqual(next.captures, before.captures);
  assert.deepEqual(await verifyBasWorkflow(next), next);
  assert.deepEqual(await applyBasReview(next, request(1), 'operator_input', '2026-09-10T01:00:00.000Z'), next);
  const view = await basSequenceView(next, next.current_capture_id!);
  assert.deepEqual(view.comparisons[0].requirements.map(r => r.status), ['listed', 'listed', 'not_listed_in_selected_matrix']);
  assert.deepEqual(initial, before);
  const changed = request(1); changed.action = { kind: 'upsert', association: { ...association, reason: 'Different operation' } };
  await assert.rejects(applyBasReview(next, changed, 'operator_input', date), /reused/);
  await assert.rejects(applyBasReview(next, request(2), 'operator_input', date), /changed since/);
  await assert.rejects(applyBasReview(next, request(1), 'agent_proposal', date), /reused/);
});

test('upsert and removal replay retain prior decisions without rewriting source evidence', async () => {
  const a = await applyBasReview(initial, request(1), 'agent_proposal', date);
  const r = request(2); r.expected_head = basReviewHead(a, r.capture_id);
  r.action = { kind: 'upsert', association: { ...association, reason: 'Reviewed revised association reason' } };
  const b = await applyBasReview(a, r, 'operator_input', date);
  assert.equal(basActiveAssociations(b, r.capture_id)[0].review_origin, 'operator_input');
  const removed = await applyBasReview(b, { ...request(3), expected_head: basReviewHead(b, r.capture_id),
    action: { kind: 'remove', region_id: association.region_id, matrix_id: association.matrix_id, reason: 'Withdraw this controlled test association' } }, 'operator_input', date);
  assert.equal(removed.review_events!.length, 3);
  assert.deepEqual(basActiveAssociations(removed, r.capture_id), []);
  assert.deepEqual(removed.captures, initial.captures);
  assert.deepEqual(await verifyBasWorkflow(removed), removed);
});

test('compatible imports merge, divergent review histories and changed evidence fail closed', async () => {
  const a = await applyBasReview(initial, request(1), 'operator_input', date);
  const b = await applyBasReview(initial, request(2), 'agent_proposal', date);
  assert.deepEqual(mergeBasWorkflows(a, a), a);
  assert.deepEqual(mergeBasWorkflows(initial, a), a);
  assert.throws(() => mergeBasWorkflows(a, b), /Divergent/);
  const changed = structuredClone(a); changed.review_events![0].created_at = '2026-09-10T00:00:00.000Z';
  await assert.rejects(verifyBasWorkflow(changed), /event fingerprint/);
  const changedSource = structuredClone(a); changedSource.captures[0].narrative_sources!.pages[0].spans[0].text += ' altered';
  await assert.rejects(verifyBasWorkflow(changedSource), /capture fingerprint/);
});

test('new captures do not inherit associations and old events cannot edit the new active evidence', async () => {
  const a = await applyBasReview(initial, request(1), 'operator_input', date);
  const changedPoints = structuredClone(points); changedPoints.issues.push('CONTROLLED_CHANGED_ANALYSIS');
  const b = await captureBasEvidence(sources, changedPoints);
  const merged = mergeBasWorkflows(a, b, true)!;
  assert.deepEqual(await verifyBasWorkflow(merged), merged);
  assert.deepEqual(basActiveAssociations(merged, b.current_capture_id!), []);
  await assert.rejects(applyBasReview(merged, { ...request(2), expected_head: basReviewHead(a, request(2).capture_id) }, 'operator_input', date), /active BAS capture changed/);
});

test('IndexedDB and JSON replay retain original SOO evidence, decisions and comparison', async () => {
  const reviewed = await applyBasReview(initial, request(1), 'operator_input', date);
  const store = createLocalStore('bas-sequence-review-persistence');
  await store.saveAnnotations({ bas_workflow: reviewed });
  const restored = await verifyBasWorkflow(JSON.parse(JSON.stringify((await store.loadAnnotations()).bas_workflow)));
  assert.deepEqual(restored, reviewed);
  assert.deepEqual(await basSequenceView(restored, restored.current_capture_id!), await basSequenceView(reviewed, reviewed.current_capture_id!));
});
