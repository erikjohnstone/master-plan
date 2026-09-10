/** Shared-path gate: yes. Durable ownership/history; no extraction changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { scopeFixture, scopeRequest } from './helpers/basScopeFixture.ts';
import { addRevisionSourceSet, revisionBasis } from './helpers/basRevisionFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { applyBasScopeReview, readBasScopeDecision, basScopeJournalSchema, assertBasScopeJournalBytes,
  BAS_SCOPE_JOURNAL_LIMITS, type BasScopeReviewEvent } from '../src/lib/basScopeReview.ts';
import { validateBasScopeJournal } from '../src/lib/basScopeReviewHistory.ts';
import { replayBasDrawingHistory } from '../src/lib/basDrawingRevision.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../src/lib/basAssemblyReview.ts';
import { applyBasReview } from '../src/lib/basReview.ts';
import { applyBasIssueReview } from '../src/lib/basIssueReview.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { currentBasIssueBasis } from '../src/lib/basIssueBasis.ts';
import { basWorkflowSchema, verifyBasWorkflow, mergeBasWorkflows, basEventFingerprint, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { BAS_WORKFLOW_REVISIONS } from '../src/lib/basWorkflowRevision.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { createLocalStore, ANN_SCHEMA } from '../src/lib/store.js';
import { parseTakeoffImport, mergeTakeoffImport } from '../src/lib/importTakeoff.js';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../src/lib/basEvidenceBundle.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';

async function resign(event: BasScopeReviewEvent) {
  const { event_id: _old, ...payload } = event; event.event_id = await basEventFingerprint(payload);
}

test('all nine prior workflow revisions remain readable; coverage explicitly requires revision 10', async () => {
  const older = BAS_WORKFLOW_REVISIONS.slice(0, BAS_WORKFLOW_REVISIONS.indexOf('bas_scope_10'));
  assert.equal(older.length, 9);
  for (const revision of older) {
    const old = { schema_version: 'bas_workflow_v1', revision, captures: [], current_capture_id: null };
    assert.deepEqual(await verifyBasWorkflow(old), old);
    assert.throws(() => basWorkflowSchema.parse({ ...old, scope_events: [] }), /scope workflow revision/);
  }
  const f = await scopeFixture(), journal = validateBasScopeJournal(f.workflow, replayBasDrawingHistory(f.workflow.captures, f.workflow.drawing_events).source_sets);
  assert.equal(journal.replay_verification, 'lineage_only');
  assert.equal(journal.encoded_bytes, Buffer.byteLength(canonicalBasJson(f.workflow.scope_events)));
});

test('ordinary IndexedDB and annotation import/export preserve review and all original evidence', async () => {
  const f = await scopeFixture(), saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const expected = await readBasScopeDecision(saved.workflow, saved.event.event_id);
  const store = createLocalStore('bas-scope-journal-test');
  await store.saveAnnotations({ bas_workflow: saved.workflow, project_name: 'Operator project', shapes: [] });
  const loaded = await store.loadAnnotations();
  const imported = parseTakeoffImport(canonicalBasJson({ schema: ANN_SCHEMA, ...loaded }));
  const merged = mergeTakeoffImport({ schema: ANN_SCHEMA, project_name: 'Keep local name', shapes: [], bas_workflow: f.workflow }, imported).payload;
  assert.equal(merged.project_name, 'Keep local name'); assert.deepEqual(merged.bas_workflow, saved.workflow);
  assert.deepEqual(await readBasScopeDecision(merged.bas_workflow, saved.event.event_id), expected);
  assert.deepEqual(mergeTakeoffImport(merged, imported).payload, merged);
  assert.deepEqual(mergeBasWorkflows(saved.workflow, f.workflow), saved.workflow);
  assert.deepEqual(mergeBasWorkflows(f.workflow, saved.workflow), saved.workflow);
  assert.deepEqual(saved.workflow.captures, f.workflow.captures);
});

test('existing equipment, assembly, SOO, drawing and issue editors retain scope journal without downgrade', async () => {
  const f = await scopeFixture(), original = structuredClone(f.workflow.scope_events);
  let w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(710), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.equipment_events!.at(-1)!.event_id, register: f.equipment, reason: 'Retain reviewed equipment' }, 'operator_input');
  w = await applyBasAssemblyReview(w, { operation_id: uuid(711), capture_id: w.current_capture_id,
    expected_head: w.assembly_events!.at(-1)!.event_id, expected_equipment_head: w.equipment_events!.at(-1)!.event_id,
    register: f.assembly, reason: 'Retain reviewed assembly' }, 'operator_input');
  w = await applyBasReview(w, { operation_id: uuid(712), capture_id: w.current_capture_id,
    expected_head: w.review_events!.at(-1)!.event_id, action: w.review_events![0].action }, 'operator_input');
  w = await addRevisionSourceSet(w, undefined, 713);
  const finding = (await basProjectReview(w, w.current_capture_id!)).issues[0]; assert.ok(finding);
  w = (await applyBasIssueReview(w, { operation_id: uuid(714), capture_id: w.current_capture_id!, expected_head: null,
    expected_basis: currentBasIssueBasis(w, w.current_capture_id!), reviewer: 'Controlled reviewer', reason: 'Acknowledgement only',
    action: { kind: 'acknowledge', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } }, 'operator_input')).workflow;
  assert.equal(w.revision, 'bas_scope_10'); assert.deepEqual(w.scope_events, original);
  assert.deepEqual(w.captures, f.workflow.captures); await verifyBasWorkflow(w);
  assert.equal((await readBasScopeDecision(w, f.event.event_id)).replay_verification, 'shared_scope_projection_replayed');
});

test('divergent branches, missing/reordered ancestors and cross-journal operation reuse fail closed', async () => {
  const f = await scopeFixture(), a = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const b = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 703, { ...f.coverage, assessment: 'unresolved', mapped_item_ids: [] }), 'operator_input');
  assert.throws(() => mergeBasWorkflows(a.workflow, b.workflow), /Divergent or incomplete/);
  for (const events of [a.workflow.scope_events!.slice(1), [...a.workflow.scope_events!].reverse()])
    assert.throws(() => basWorkflowSchema.parse({ ...a.workflow, scope_events: events }), /incomplete/);
  const bad = structuredClone(f.workflow); bad.scope_events![0].operation_id = bad.equipment_events![0].operation_id;
  await resign(bad.scope_events![0]); await assert.rejects(verifyBasWorkflow(bad), /Duplicate/);
  const identity = structuredClone(f.workflow); identity.scope_events![0].reason = 'Same ID different content';
  assert.throws(() => mergeBasWorkflows(f.workflow, identity), /Conflicting scope event identity/);
});

test('typed selectors and exact source-set ownership prevent decision/calculation/capture substitution', async () => {
  const f = await scopeFixture();
  for (const patch of [
    { sequence_head: f.workflow.equipment_events![0].event_id },
    { assignment_calculation_id: f.workflow.equipment_events![0].event_id },
    { assembly_calculation_id: 'f'.repeat(64) }, { capture_id: 'f'.repeat(64) },
  ]) {
    const bad = structuredClone(f.workflow), event = bad.scope_events![0];
    assert.ok(event.action.kind === 'save_scope'); Object.assign(event.action.specification.basis.captures[0], patch);
    await resign(event); await assert.rejects(verifyBasWorkflow(bad), /unowned|source-set captures/);
  }
  const bad = structuredClone(f.workflow), event = bad.scope_events![0]; assert.ok(event.action.kind === 'save_scope');
  event.action.specification.basis.source_set_id = 'f'.repeat(64); await resign(event);
  await assert.rejects(verifyBasWorkflow(bad), /retained complete source set/);
  const saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const foreign = structuredClone(saved.workflow), coverage = foreign.scope_events!.at(-1)!;
  coverage.scope_id = uuid(799); await resign(coverage);
  await assert.rejects(verifyBasWorkflow(foreign), /current owned saved scope/);
});

test('journal budgets count full encoded multibyte bytes and never truncate valid-looking events', async () => {
  const f = await scopeFixture(), saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const events: BasScopeReviewEvent[] = [f.event];
  for (let i = 0; i < 4000; i++) events.push({ ...saved.event, operation_id: uuid(20000 + i), event_id: i.toString(16).padStart(64, '0'),
    expected_head: events.at(-1)!.event_id, reason: '📐'.repeat(2000) });
  assert.equal(basScopeJournalSchema.parse(events).length, 4001);
  assert.ok(Buffer.byteLength(canonicalBasJson(events)) > BAS_SCOPE_JOURNAL_LIMITS.bytes);
  assert.throws(() => validateBasScopeJournal({ ...f.workflow, scope_events: events },
    replayBasDrawingHistory(f.workflow.captures, f.workflow.drawing_events).source_sets), /32 MiB/);
  assert.throws(() => basScopeJournalSchema.parse(Array(10001).fill(f.event)));
  assert.doesNotThrow(() => assertBasScopeJournalBytes(BAS_SCOPE_JOURNAL_LIMITS.bytes));
  for (const n of [-1, 0.5, NaN, Infinity, BAS_SCOPE_JOURNAL_LIMITS.bytes + 1]) assert.throws(() => assertBasScopeJournalBytes(n));
});

test('real retained workflow roundtrip preserves earlier calculations and evidence alongside scope decisions', async () => {
  // Earlier retained source + controlled decisions, not a new extraction or PDF-byte check.
  const raw = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8'));
  const w = await addRevisionSourceSet(raw.bas_workflow as BasWorkflow), capture_id = w.current_capture_id!;
  const saved = await applyBasScopeReview(w, scopeRequest(w, 720, { kind: 'save_scope', previous_scope_event_id: null,
    specification: { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(700), name: 'Retained source backup',
      reason: 'Controlled review; not an approved deliverable', basis: revisionBasis(w), excluded: [],
      included: [{ claim: 'scheduled_equipment', capture_id, subject_id: w.equipment_events!.at(-1)!.register.equipment[0].equipment_id }] } }), 'operator_input');
  const payload = { schema: ANN_SCHEMA, shapes: [], bas_workflow: saved.workflow };
  const imported = parseTakeoffImport(canonicalBasJson(payload));
  const reopened = mergeTakeoffImport({ schema: ANN_SCHEMA, shapes: [], bas_workflow: w }, imported).payload;
  assert.deepEqual(reopened, { ...payload, conditions: [], markups: [], sheets: [] });
  assert.deepEqual(await readBasScopeDecision(reopened.bas_workflow, saved.event.event_id),
    await readBasScopeDecision(saved.workflow, saved.event.event_id));
  for (const field of ['captures', 'review_events', 'equipment_events', 'assembly_events', 'engineering_events',
    'assignment_calculations', 'assembly_calculations', 'drawing_events'] as const) assert.deepEqual(saved.workflow[field], w[field]);
});

test('portable evidence bundle preserves scope review and checked source bytes without claiming approval', async () => {
  // Controlled bytes exercise integrity and persistence, not PDF rendering or extraction.
  const bytes = new TextEncoder().encode('%PDF-controlled-scope-backup');
  const f = await scopeFixture({ sha256: await sha256Hex(bytes), byte_length: bytes.length });
  const saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 702, f.coverage), 'operator_input');
  const source = f.workflow.captures[0].sources[0], payload = { schema: ANN_SCHEMA, shapes: [], bas_workflow: saved.workflow };
  const prepared = await prepareBasEvidenceBundle(payload), chunks: Uint8Array[] = [];
  for await (const chunk of prepared.stream(async entry => { assert.equal(entry.source.source_id, source.source_id); return bytes; })) chunks.push(chunk);
  const archive = Buffer.concat(chunks), opened = await openBasEvidenceBundle({ size: archive.length,
    async read(offset, length) { return archive.subarray(offset, offset + length); } });
  await opened.verifyOriginals(); assert.deepEqual(await opened.readSource(source.source_id), bytes);
  assert.deepEqual(opened.payload, payload); assert.equal(opened.manifest.purpose, 'unapproved_evidence_backup');
  assert.deepEqual(await readBasScopeDecision(opened.payload.bas_workflow, saved.event.event_id),
    await readBasScopeDecision(saved.workflow, saved.event.event_id));
});
