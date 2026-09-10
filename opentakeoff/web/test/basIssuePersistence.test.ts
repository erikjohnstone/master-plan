/** Shared-path gate: yes. Journal persistence/ownership only; not installed GT. */
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { applyBasIssueReview, inspectBasIssueReview, readBasIssueDecision } from '../src/lib/basIssueReview.ts';
import { currentBasIssueBasis } from '../src/lib/basIssueBasis.ts';
import { validateBasIssueJournal } from '../src/lib/basIssueReviewHistory.ts';
import { basIssueJournalSchema, type BasIssueReviewEvent } from '../src/lib/basIssueReviewContract.ts';
import { captureBasPoints, basWorkflowSchema, verifyBasWorkflow, mergeBasWorkflows, basEventFingerprint } from '../src/lib/basWorkflow.ts';
import { BAS_WORKFLOW_REVISIONS } from '../src/lib/basWorkflowRevision.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { createLocalStore, ANN_SCHEMA } from '../src/lib/store.js';
import { parseTakeoffImport, mergeTakeoffImport } from '../src/lib/importTakeoff.js';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../src/lib/basEvidenceBundle.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';

async function savedFixture() {
  const f = await engineeringFixture();
  const view = await basProjectReview(f.workflow, f.workflow.current_capture_id!);
  const finding = view.issues[0]; assert.ok(finding);
  const request = { operation_id: uuid(950), capture_id: f.workflow.current_capture_id!, expected_head: null,
    expected_basis: currentBasIssueBasis(f.workflow, f.workflow.current_capture_id!), reviewer: 'Self-declared test reviewer',
    reason: 'Awareness only: é→📐', action: { kind: 'acknowledge' as const, issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } };
  return { ...f, ...(await applyBasIssueReview(f.workflow, request, 'operator_input')), request, finding };
}
async function resign(event: BasIssueReviewEvent) {
  const { event_id: _old, ...payload } = event; event.event_id = await basEventFingerprint(payload);
}

test('all eight older revisions remain readable and require explicit revision 9 for issue events', async () => {
  for (const revision of BAS_WORKFLOW_REVISIONS.slice(0, BAS_WORKFLOW_REVISIONS.indexOf('bas_issues_9'))) {
    const old = { schema_version: 'bas_workflow_v1', revision, captures: [], current_capture_id: null };
    assert.deepEqual(await verifyBasWorkflow(old), old);
    assert.throws(() => basWorkflowSchema.parse({ ...old, issue_events: [] }), /issue workflow revision/);
  }
  const { workflow } = await savedFixture();
  assert.equal(workflow.revision, 'bas_issues_9');
  const journal = validateBasIssueJournal(workflow);
  assert.equal(journal.finding_verification, 'not_replayed');
  assert.equal(journal.encoded_bytes, Buffer.byteLength(canonicalBasJson(workflow.issue_events)));
});

test('ordinary IndexedDB save/reopen and import/export preserve exact decisions, sources and replay', async () => {
  const { workflow, event } = await savedFixture();
  const expected = await readBasIssueDecision(workflow, event.event_id);
  const store = createLocalStore('bas-issue-journal-test');
  await store.saveAnnotations({ bas_workflow: workflow, project_name: 'Operator project', shapes: [] });
  const loaded = await store.loadAnnotations();
  const imported = parseTakeoffImport(canonicalBasJson({ schema: ANN_SCHEMA, ...loaded }));
  const merged = mergeTakeoffImport({ schema: ANN_SCHEMA, project_name: 'Keep local name', shapes: [],
    bas_workflow: { ...workflow, issue_events: [] } }, imported).payload;
  assert.equal(merged.project_name, 'Keep local name');
  assert.deepEqual(merged.bas_workflow, workflow);
  assert.deepEqual(await readBasIssueDecision(merged.bas_workflow, event.event_id), expected);
  assert.deepEqual(mergeTakeoffImport(merged, imported).payload, merged);
});

test('changing active capture retains history but disallows new decisions against historical capture', async () => {
  const f = await savedFixture();
  const other = await captureBasPoints([{ source_id: `sha256:${'b'.repeat(64)}`, sha256: 'b'.repeat(64), byte_length: 100,
    page_count: 1, names: ['another-controlled.pdf'] }], { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
    scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  const merged = mergeBasWorkflows(f.workflow, other, true)!;
  const read = await readBasIssueDecision(merged, f.event.event_id);
  assert.equal(read.capture_status, 'historical_capture'); assert.deepEqual(read.original_finding, f.finding);
  await assert.rejects(applyBasIssueReview(merged, { ...f.request, operation_id: uuid(951), expected_head: f.event.event_id }, 'operator_input'), /active BAS capture changed/);
  const retry = await applyBasIssueReview(merged, f.request, 'operator_input');
  assert.deepEqual(retry.workflow, merged); assert.deepEqual(retry.event, f.event);
  const foreign = structuredClone(merged), e = foreign.issue_events![0];
  e.capture_id = other.current_capture_id!; await resign(e);
  assert.throws(() => basWorkflowSchema.parse(foreign), /unowned decision/);
});

test('typed ownership rejects decision/calculation confusion and missing journal ancestry', async () => {
  const f = await savedFixture();
  for (const patch of [
    { sequence_head: f.workflow.equipment_events![0].event_id },
    { assignment_calculation_id: f.workflow.equipment_events![0].event_id },
    { assembly_calculation_id: 'd'.repeat(64) },
  ]) {
    const bad = structuredClone(f.workflow); Object.assign(bad.issue_events![0].expected_basis, patch);
    await resign(bad.issue_events![0]); await assert.rejects(verifyBasWorkflow(bad), /unowned/);
  }
  const next = await applyBasIssueReview(f.workflow, { ...f.request, operation_id: uuid(952), expected_head: f.event.event_id }, 'operator_input');
  for (const events of [next.workflow.issue_events!.slice(1), [...next.workflow.issue_events!].reverse()])
    assert.throws(() => basWorkflowSchema.parse({ ...next.workflow, issue_events: events }), /incomplete/);
});

test('the full encoded-byte cap is enforced, not just event count or string length', async () => {
  const f = await savedFixture(), events: BasIssueReviewEvent[] = [];
  for (let i = 0; i < 2000; i++) events.push({ ...f.event, operation_id: uuid(20000 + i), event_id: i.toString(16).padStart(64, '0'),
    expected_head: events.at(-1)?.event_id ?? null, reason: '📐'.repeat(2000) });
  assert.equal(basIssueJournalSchema.parse(events).length, 2000, 'Every individual field is within the wire limits');
  assert.ok(Buffer.byteLength(canonicalBasJson(events)) > 16 * 1024 * 1024);
  assert.throws(() => validateBasIssueJournal({ ...f.workflow, issue_events: events }), /16 MiB/);
  assert.throws(() => basIssueJournalSchema.parse(Array(10001).fill(f.event)));
});

test('portable evidence bundle preserves issue history and source bytes without claiming approval', async () => {
  // Controlled bytes are intentionally not called a rendered PDF walkthrough.
  const bytes = new TextEncoder().encode('%PDF-controlled-issue-backup'), sha = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha}`, sha256: sha, byte_length: bytes.length, page_count: 1, names: ['controlled.pdf'] };
  const w = await captureBasPoints([source], { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
    scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  const view = await inspectBasIssueReview(w, w.current_capture_id!); const finding = view.project_review.issues[0]; assert.ok(finding);
  const saved = await applyBasIssueReview(w, { operation_id: uuid(953), capture_id: w.current_capture_id!, expected_head: view.head,
    expected_basis: view.basis, reviewer: 'Controlled reviewer', reason: 'Read source availability warning; no waiver',
    action: { kind: 'acknowledge', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } }, 'operator_input');
  const payload = { schema: ANN_SCHEMA, bas_workflow: saved.workflow, shapes: [] };
  const prepared = await prepareBasEvidenceBundle(payload), chunks: Uint8Array[] = [];
  for await (const chunk of prepared.stream(async () => bytes)) chunks.push(chunk);
  const archive = Buffer.concat(chunks), opened = await openBasEvidenceBundle({ size: archive.length,
    async read(offset, length) { return archive.subarray(offset, offset + length); } });
  await opened.verifyOriginals(); assert.deepEqual(await opened.readSource(source.source_id), bytes);
  assert.deepEqual(opened.payload, payload); assert.equal(opened.manifest.purpose, 'unapproved_evidence_backup');
  assert.deepEqual(await readBasIssueDecision(opened.payload.bas_workflow, saved.event.event_id),
    await readBasIssueDecision(saved.workflow, saved.event.event_id));
});
