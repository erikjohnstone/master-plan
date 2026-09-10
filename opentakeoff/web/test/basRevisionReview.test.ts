/** Journal structure and persistence only. Controlled fingerprints here are
 * deliberately NOT Python comparison receipts; actual replay is tested in MCP. */
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { revisionFixture } from './helpers/basRevisionFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { basWorkflowSchema, basEventFingerprint, verifyBasWorkflow, mergeBasWorkflows,
  retainBasWorkflowHistory, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { BAS_WORKFLOW_REVISIONS } from '../src/lib/basWorkflowRevision.ts';
import { BAS_REVISION_REVIEW_RULE, BAS_REVISION_JOURNAL_LIMITS, basRevisionReviewRequestSchema,
  basRevisionJournalSchema, assertBasRevisionJournalSize, type BasRevisionReviewEvent } from '../src/lib/basRevisionReviewContract.ts';
import { assertBasRevisionReviewUpdate } from '../src/lib/basRevisionReview.ts';
import { validateBasRevisionJournal } from '../src/lib/basRevisionReviewHistory.ts';
import { replayBasDrawingHistory } from '../src/lib/basDrawingRevision.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { createLocalStore, ANN_SCHEMA } from '../src/lib/store.js';
import { parseTakeoffImport, mergeTakeoffImport } from '../src/lib/importTakeoff.js';

const date = '2026-09-10T12:00:00.000Z';
async function append(w: BasWorkflow, n = 700) {
  const basis = (await import('../src/lib/basRevisionBasis.ts')).defaultBasRevisionBasis(w, w.drawing_events!.at(-1)!.event_id);
  const request = basRevisionReviewRequestSchema.parse({ operation_id: uuid(n), expected_head: w.revision_events?.at(-1)?.event_id ?? null,
    expected_report_fingerprint: 'f'.repeat(64), name: 'Controlled un-replayed comparison', reviewer: 'Self-declared reviewer',
    reason: 'Structure test only; not a verified comparison', comparison: { before: basis, after: basis,
      matches: [], added: [], removed: [], membership_reviews: [] } });
  const payload = { ...request, created_at: date, origin: 'operator_input' as const, approved: false as const, rule_version: BAS_REVISION_REVIEW_RULE };
  const event = { ...payload, event_id: await basEventFingerprint(payload) };
  const workflow = basWorkflowSchema.parse({ ...w, revision: 'bas_revision_8', revision_events: [...(w.revision_events ?? []), event] });
  return { workflow, event, request };
}
async function resign(e: BasRevisionReviewEvent) {
  const { event_id: _id, ...payload } = e;
  e.event_id = await basEventFingerprint(payload);
}

test('all seven prior revisions remain readable; the journal requires explicit revision 8', async () => {
  for (const revision of BAS_WORKFLOW_REVISIONS.slice(0, -1)) {
    const old = { schema_version: 'bas_workflow_v1', revision, captures: [], current_capture_id: null };
    assert.deepEqual(await verifyBasWorkflow(old), old);
    assert.throws(() => basWorkflowSchema.parse({ ...old, revision_events: [] }), /comparison workflow revision/);
  }
  const f = await revisionFixture(), next = await append(f.workflow);
  assert.equal(next.workflow.revision, 'bas_revision_8');
  assert.deepEqual(await verifyBasWorkflow(next.workflow), next.workflow);
  assert.deepEqual(next.workflow.captures, f.workflow.captures);
  assert.deepEqual(next.workflow.drawing_events, f.workflow.drawing_events);
});

test('journal validation reports only lineage, exact UTF-8 size and selector ownership, not comparison verification', async () => {
  const { workflow } = await append((await revisionFixture()).workflow);
  const sets = replayBasDrawingHistory(workflow.captures, workflow.drawing_events).source_sets;
  const result = validateBasRevisionJournal(workflow, sets);
  assert.equal(result.comparison_verification, 'not_replayed');
  assert.equal(result.head, workflow.revision_events![0].event_id);
  assert.equal(result.entries, 2);
  assert.equal(result.encoded_bytes, Buffer.byteLength(canonicalBasJson(workflow.revision_events)));
  const unicode = structuredClone(workflow); unicode.revision_events![0].reason = 'é→📐';
  await resign(unicode.revision_events![0]);
  assert.equal(validateBasRevisionJournal(unicode, sets).encoded_bytes, Buffer.byteLength(canonicalBasJson(unicode.revision_events)));
});

test('typed selectors reject missing sources, omitted captures, foreign owners and wrong event/calculation kinds', async () => {
  const { workflow } = await append((await revisionFixture()).workflow);
  const mutate: Array<(w: BasWorkflow) => void> = [
    w => { w.revision_events![0].comparison.before.source_set_id = 'e'.repeat(64); },
    w => { w.revision_events![0].comparison.before.captures = []; },
    w => { w.revision_events![0].comparison.before.captures[0].capture_id = 'e'.repeat(64); },
    w => { w.revision_events![0].comparison.before.captures[0].equipment_head = w.review_events![0].event_id; },
    w => { w.revision_events![0].comparison.before.captures[0].assignment_calculation_id = w.equipment_events![0].event_id; },
    w => { w.revision_events![0].comparison.before.captures[0].assembly_calculation_id = 'e'.repeat(64); },
  ];
  for (const change of mutate) {
    const bad = structuredClone(workflow); change(bad); await resign(bad.revision_events![0]);
    await assert.rejects(verifyBasWorkflow(bad), /source set|captures|unowned/);
  }
  assert.deepEqual(await verifyBasWorkflow(workflow), workflow);
});

test('hash tampering, missing/reordered/forked history and cross-journal duplicate identities fail', async () => {
  const first = await append((await revisionFixture()).workflow), second = await append(first.workflow, 701);
  const tampered = structuredClone(first.workflow); tampered.revision_events![0].reason += ' altered';
  await assert.rejects(verifyBasWorkflow(tampered), /fingerprint/);
  assert.throws(() => basWorkflowSchema.parse({ ...second.workflow, revision_events: second.workflow.revision_events!.slice(1) }), /incomplete/);
  assert.throws(() => basWorkflowSchema.parse({ ...second.workflow, revision_events: [...second.workflow.revision_events!].reverse() }), /incomplete/);
  for (const field of ['operation_id', 'event_id'] as const) {
    const duplicate = structuredClone(first.workflow);
    duplicate.revision_events![0][field] = duplicate.drawing_events![0][field];
    assert.throws(() => basWorkflowSchema.parse(duplicate), /Duplicate/);
  }
  const fork = await append(first.workflow, 702);
  assert.throws(() => mergeBasWorkflows(second.workflow, fork.workflow), /incomplete/);
  assert.throws(() => mergeBasWorkflows(first.workflow, tampered), /Conflicting comparison/);
});

test('merge, old snapshot retention, actual IndexedDB reload and JSON import preserve the full journal', async () => {
  const original = (await revisionFixture()).workflow, first = await append(original), second = await append(first.workflow, 701);
  for (const [a, b] of [[original, second.workflow], [second.workflow, original], [first.workflow, second.workflow], [second.workflow, first.workflow]]) {
    assert.deepEqual(mergeBasWorkflows(a, b), second.workflow);
  }
  const selected = { ...original, current_capture_id: null };
  const restored = retainBasWorkflowHistory(selected, first.workflow, second.workflow)!;
  assert.equal(restored.current_capture_id, null); assert.deepEqual(restored.revision_events, second.workflow.revision_events);
  const store = createLocalStore('bas-comparison-journal-test');
  await store.saveAnnotations({ bas_workflow: restored, project_name: 'Keep operator project' });
  const loaded = await store.loadAnnotations(), exported = JSON.stringify({ schema: ANN_SCHEMA, ...loaded });
  const incoming = parseTakeoffImport(exported), current = { schema: ANN_SCHEMA, bas_workflow: original, project_name: 'Local project', shapes: [] };
  const merged = mergeTakeoffImport(current, incoming).payload;
  assert.deepEqual(merged.bas_workflow.revision_events, restored.revision_events);
  assert.equal(merged.project_name, 'Local project');
  assert.deepEqual(await verifyBasWorkflow(loaded.bas_workflow), restored);
  assert.deepEqual(mergeTakeoffImport(merged, incoming).payload, merged);
});

test('response gate rejects altered requests, origins, captures and omitted history while permitting exact retry', async () => {
  const original = (await revisionFixture()).workflow, first = await append(original), second = await append(first.workflow, 701);
  assert.deepEqual(assertBasRevisionReviewUpdate(original, first.workflow, first.event, first.request, 'operator_input'), first.event);
  assert.deepEqual(assertBasRevisionReviewUpdate(second.workflow, second.workflow, first.event, first.request, 'operator_input'), first.event);
  assert.throws(() => assertBasRevisionReviewUpdate(original, first.workflow, first.event, first.request, 'agent_proposal'), /origin/);
  assert.throws(() => assertBasRevisionReviewUpdate(original, first.workflow, first.event, { ...first.request, reason: 'Different reason' }, 'operator_input'), /requested/);
  assert.throws(() => assertBasRevisionReviewUpdate(original, { ...first.workflow, current_capture_id: null }, first.event, first.request, 'operator_input'), /omitted retained/);
  assert.throws(() => assertBasRevisionReviewUpdate(second.workflow, first.workflow, first.event, first.request, 'operator_input'), /omitted retained/);
});

test('journal limits fail explicitly at exact entry/byte/event boundaries, with strict unapproved records', async () => {
  const max = BAS_REVISION_JOURNAL_LIMITS;
  assert.doesNotThrow(() => assertBasRevisionJournalSize(max.entries, max.bytes));
  assert.throws(() => assertBasRevisionJournalSize(max.entries + 1, max.bytes), /250,000/);
  assert.throws(() => assertBasRevisionJournalSize(max.entries, max.bytes + 1), /64 MiB/);
  for (const n of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertBasRevisionJournalSize(n, 2), /Invalid/);
  const { event, request } = await append((await revisionFixture()).workflow);
  // Only the array's size/shape here; repeated IDs would separately fail lineage.
  assert.equal(basRevisionJournalSchema.parse(Array(max.events).fill(event)).length, max.events);
  assert.throws(() => basRevisionJournalSchema.parse(Array(max.events + 1).fill(event)));
  assert.throws(() => basRevisionJournalSchema.parse([{ ...event, approved: true }]));
  assert.throws(() => basRevisionReviewRequestSchema.parse({ ...request, unknown_field: 1 }));
});
