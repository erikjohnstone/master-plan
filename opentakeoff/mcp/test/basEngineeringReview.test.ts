/** Controlled source-shaped histories through the actual Python service and
 * browser store. These do not replace real-PDF/public UI/MCP acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { applyBasEngineeringReview, inspectBasEngineering, verifyBasEngineeringHistory, assertBasEngineeringUpdate } from '../src/basEngineeringReview.ts';
import { basEngineeringHeads, basEngineeringView } from '../../web/src/lib/basEngineeringReview.ts';
import { basEventFingerprint, captureBasEvidence, mergeBasWorkflows, verifyBasWorkflow, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { applyBasReview, basReviewHead, basSequenceCandidates } from '../../web/src/lib/basReview.ts';
import { createLocalStore } from '../../web/src/lib/store.js';
import { parseTakeoffImport, mergeTakeoffImport } from '../../web/src/lib/importTakeoff.js';
createRequire(new URL('../../web/package.json', import.meta.url))('fake-indexeddb/auto');

test('actual Python review retains original sources, current dependency identities and idempotent operation history', async () => {
  const { workflow, request } = await engineeringFixture(), before = structuredClone(workflow);
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input', { createdAt: '2026-09-09T12:00:00.000Z' });
  assert.deepEqual(workflow, before);
  assert.equal(saved.workflow.revision, 'bas_engineering_6');
  assert.equal(saved.event.result.status, 'pass');
  assert.equal(saved.event.result.project_complete, false);
  assert.deepEqual(saved.event.result.original, request.register.input);
  assert.deepEqual(saved.workflow.captures, before.captures);
  assert.deepEqual(saved.workflow.equipment_events, before.equipment_events);
  assert.deepEqual(saved.workflow.assembly_events, before.assembly_events);
  const browser = await basEngineeringView(await verifyBasWorkflow(saved.workflow), request.capture_id);
  assert.equal(browser.dependency_status, 'current_dependencies');
  assert.equal(browser.calculation_verification, 'requires_python_replay');
  const server = await inspectBasEngineering(saved.workflow, request.capture_id);
  assert.equal(server.view.calculation_verification, 'verified_shared_python_replay');
  assert.deepEqual(server.workflow, saved.workflow);
  assert.deepEqual(await applyBasEngineeringReview(saved.workflow, request, 'operator_input'), saved);
  await assert.rejects(applyBasEngineeringReview(saved.workflow, { ...request, reason: 'Different decision' }, 'operator_input'), /reused/);
  await assert.rejects(applyBasEngineeringReview(saved.workflow, request, 'agent_proposal'), /reused/);
});

test('equipment withdrawal preserves historical sources/results but invalidates freshness and new saves', async () => {
  const { workflow, request } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const withdrawn = await applyBasEquipmentReview(saved.workflow, { operation_id: uuid(60), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Controlled withdrawal', register: emptyBasEquipmentRegister() }, 'operator_input');
  assert.equal(withdrawn.revision, 'bas_engineering_6');
  assert.deepEqual(withdrawn.engineering_events, saved.workflow.engineering_events);
  const view = (await inspectBasEngineering(withdrawn, request.capture_id)).view;
  assert.equal(view.dependency_status, 'stale_dependencies');
  assert.deepEqual(view.event, saved.event);
  const retry = await applyBasEngineeringReview(withdrawn, request, 'operator_input');
  assert.deepEqual(retry.workflow, withdrawn);
  assert.deepEqual(retry.event, saved.event);
  await assert.rejects(applyBasEngineeringReview(withdrawn, { ...request, operation_id: uuid(61) }, 'operator_input'), /changed/);
  const heads = basEngineeringHeads(withdrawn, request.capture_id);
  await assert.rejects(applyBasEngineeringReview(withdrawn, { ...request, operation_id: uuid(61), expected_head: heads.engineering,
    expected_equipment_head: heads.equipment }, 'operator_input'), /Assembly applicability is stale/);
});

test('assembly exclusions stale old results; recomputation retains failed and missing constraints even when excluded', async () => {
  const { workflow, request, assembly } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const changed = structuredClone(assembly);
  changed.components[1].disposition = 'excluded'; changed.components[1].exclusion_reason = 'Controlled excluded device';
  const revised = await applyBasAssemblyReview(saved.workflow, { operation_id: uuid(62), capture_id: request.capture_id,
    expected_head: request.expected_assembly_head, expected_equipment_head: request.expected_equipment_head,
    reason: 'Controlled assembly scope revision', register: changed }, 'operator_input');
  assert.equal((await basEngineeringView(revised, request.capture_id)).dependency_status, 'stale_dependencies');
  const next = structuredClone(request);
  next.operation_id = uuid(63); next.expected_head = saved.event.event_id;
  next.expected_assembly_head = basEngineeringHeads(revised, request.capture_id).assembly;
  next.register.targets[0].disposition = 'excluded'; next.register.targets[0].exclusion_reason = 'Keep excluded failure for review';
  const check = next.register.input.checks[0];
  if (check.kind !== 'signal') throw new Error('Controlled fixture must be signal');
  check.source_mode = null; check.sink_direction!.value = 'output';
  const second = await applyBasEngineeringReview(revised, next, 'operator_input');
  assert.equal(second.event.result.status, 'fail');
  assert.ok(second.event.result.checks[0].constraints.some(c => c.status === 'not_evaluable'));
  const view = (await inspectBasEngineering(second.workflow, request.capture_id)).view;
  assert.equal(view.dependency_status, 'current_dependencies');
  assert.ok(view.issues.some(i => i.code === 'engineering_component_excluded'));
  assert.ok(view.issues.some(i => i.code === 'engineering_check_explicitly_excluded'));
  assert.deepEqual(second.workflow.engineering_events![0], saved.event);
  assert.deepEqual(await verifyBasEngineeringHistory(mergeBasWorkflows(saved.workflow, second.workflow)), second.workflow);
});

test('capture switching cannot silently reactivate an old passing result', async () => {
  const { workflow, request, source, capture } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const other = await captureBasEvidence(source, capture.points);
  const switched = mergeBasWorkflows(saved.workflow, other, true)!;
  const view = (await inspectBasEngineering(switched, request.capture_id)).view;
  assert.equal(view.source_status, 'historical_capture');
  assert.equal(view.dependency_status, 'stale_dependencies');
  await assert.rejects(applyBasEngineeringReview(switched, { ...request, operation_id: uuid(64), expected_head: saved.event.event_id }, 'operator_input'), /changed/);
  const forgedSource = structuredClone(saved.workflow);
  forgedSource.captures[0].narrative_sources!.pages[0].spans[1].text = 'Unowned replacement';
  await assert.rejects(verifyBasEngineeringHistory(forgedSource), /fingerprint/);
});

test('forked, incomplete, downgraded and cross-workflow histories reject instead of silently merging', async () => {
  const { workflow, request } = await engineeringFixture();
  const left = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const right = await applyBasEngineeringReview(workflow, { ...request, operation_id: uuid(65), reason: 'Conflicting independent decision' }, 'operator_input');
  assert.throws(() => mergeBasWorkflows(left.workflow, right.workflow), /Divergent/);
  assert.throws(() => basWorkflowSchema.parse({ ...left.workflow, equipment_events: [] }), /equipment decision/);
  assert.throws(() => basWorkflowSchema.parse({ ...left.workflow, revision: 'bas_assembly_5' }), /engineering workflow revision/);
  await assert.rejects(applyBasEngineeringReview(workflow, { ...request, operation_id: workflow.equipment_events![0].operation_id }, 'operator_input'), /already owned/);
  await assert.rejects(applyBasEngineeringReview(workflow, { ...request, result: left.event.result }, 'operator_input'), /Unrecognized key/);
  assert.throws(() => assertBasEngineeringUpdate(workflow, { ...left.workflow, assembly_events: [] }, left.event, request, 'operator_input'), /changed or omitted/);
  assert.deepEqual(await verifyBasEngineeringHistory(mergeBasWorkflows(left.workflow, workflow)), left.workflow);
});

test('locally rehashed calculations still require exact Python replay before being accepted as current', async () => {
  const { workflow, request } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  for (const field of ['normalized', 'message'] as const) {
    const forged = structuredClone(saved.workflow), event = forged.engineering_events![0];
    if (field === 'normalized') event.result.checks[0].constraints[0].normalized = { invented: '0' };
    else event.result.checks[0].constraints[0].message = 'Unverified claim';
    const { event_id: _id, ...payload } = event;
    event.event_id = await basEventFingerprint(payload);
    // Deliberately demonstrate the boundary: hash/source checking is not math.
    assert.deepEqual(await verifyBasWorkflow(forged), forged);
    assert.equal((await basEngineeringView(forged, request.capture_id)).calculation_verification, 'requires_python_replay');
    await assert.rejects(inspectBasEngineering(forged, request.capture_id), /does not match shared Python replay/);
    await assert.rejects(applyBasEngineeringReview(forged, request, 'operator_input'), /does not match shared Python replay/);
  }
});

test('ordinary IndexedDB save/load and portable import preserve complete engineering histories and legacy annotations', async () => {
  const { workflow, request } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const store = createLocalStore('controlled-bas-engineering-history');
  const payload = { project_name: 'Controlled engineering history', shapes: [], conditions: [], bas_workflow: saved.workflow };
  await store.saveAnnotations(payload);
  const loaded = await store.loadAnnotations();
  assert.deepEqual(await verifyBasEngineeringHistory(loaded.bas_workflow), saved.workflow);
  const imported = parseTakeoffImport(JSON.stringify(loaded));
  const merged = mergeTakeoffImport({ ...payload, bas_workflow: workflow }, imported);
  assert.deepEqual(await verifyBasEngineeringHistory(merged.payload.bas_workflow), saved.workflow);
  assert.deepEqual(mergeTakeoffImport(merged.payload, imported).payload.bas_workflow, saved.workflow);
  await store.saveAnnotations(merged.payload);
  assert.deepEqual((await store.loadAnnotations()).bas_workflow, saved.workflow);
  assert.deepEqual(loaded.shapes, payload.shapes);
});

test('source validation, runtime failure and cancellation never append a partial review', async () => {
  const { workflow, request } = await engineeringFixture(), before = structuredClone(workflow);
  const altered = structuredClone(request), check = altered.register.input.checks[0];
  if (check.kind !== 'signal') throw new Error('Controlled fixture must be signal');
  check.sink_modes!.basis.original_text = 'Changed source wording';
  await assert.rejects(applyBasEngineeringReview(workflow, altered, 'operator_input', { python: '/not-a-runtime' }), /original wording/);
  await assert.rejects(applyBasEngineeringReview(workflow, request, 'operator_input', { python: '/not-a-runtime' }));
  await assert.rejects(applyBasEngineeringReview(workflow, request, 'operator_input', { timeoutMs: 1 }), /timed out/);
  const abort = new AbortController(); abort.abort(new Error('Controlled cancellation'));
  await assert.rejects(applyBasEngineeringReview(workflow, request, 'operator_input', { signal: abort.signal }), /cancellation/);
  assert.deepEqual(workflow, before);
});

test('opening an unreviewed engineering workspace after equipment withdrawal must not crash on the stale assembly', async () => {
  const { workflow, request } = await engineeringFixture();
  const withdrawn = await applyBasEquipmentReview(workflow, { operation_id: uuid(66), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Controlled withdrawal before engineering', register: emptyBasEquipmentRegister() }, 'operator_input');
  const view = await basEngineeringView(withdrawn, request.capture_id);
  assert.equal(view.dependency_status, 'not_reviewed');
  assert.equal(view.calculation_verification, 'not_calculated');
  assert.equal(view.assembly_dependency_status, 'stale_dependencies');
  assert.deepEqual(view.register.input.checks, []);
});

test('SOO association creation, correction and removal invalidate engineering without rewriting old reviews', async () => {
  const { workflow, request, source } = await engineeringFixture({ withSequence: true });
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const region = basSequenceCandidates(saved.workflow, request.capture_id)!.regions[0];
  assert.ok(region);
  const association = { region_id: region.region_id, matrix_id: 'controlled-matrix',
    reason: 'Controlled history association only; empty matrix does not prove coverage', equipment_references: [{
      tag: 'AHU-1 THRU AHU-2', span_ids: [source.pages[0].spans[0].span_id],
      scope: { building: null, level: null, system: null, phase: null },
    }] };
  const associated = await applyBasReview(saved.workflow, { operation_id: uuid(70), capture_id: request.capture_id,
    expected_head: null, action: { kind: 'upsert', association } }, 'operator_input');
  assert.equal(associated.revision, 'bas_engineering_6');
  assert.deepEqual(associated.engineering_events, saved.workflow.engineering_events);
  assert.equal((await basEngineeringView(associated, request.capture_id)).dependency_status, 'stale_dependencies');
  await assert.rejects(applyBasEngineeringReview(associated, { ...request, operation_id: uuid(71), expected_head: saved.event.event_id }, 'operator_input'), /changed/);
  const next = await applyBasEngineeringReview(associated, { ...request, operation_id: uuid(71), expected_head: saved.event.event_id,
    expected_sequence_head: basReviewHead(associated, request.capture_id) }, 'operator_input');
  assert.equal((await basEngineeringView(next.workflow, request.capture_id)).dependency_status, 'current_dependencies');
  const corrected = await applyBasReview(next.workflow, { operation_id: uuid(72), capture_id: request.capture_id,
    expected_head: basReviewHead(next.workflow, request.capture_id), action: { kind: 'upsert',
      association: { ...association, reason: 'Explicit corrected association decision' } } }, 'operator_input');
  assert.equal((await basEngineeringView(corrected, request.capture_id)).dependency_status, 'stale_dependencies');
  const removed = await applyBasReview(corrected, { operation_id: uuid(73), capture_id: request.capture_id,
    expected_head: basReviewHead(corrected, request.capture_id), action: { kind: 'remove', region_id: region.region_id,
      matrix_id: association.matrix_id, reason: 'Controlled withdrawal of association' } }, 'operator_input');
  assert.deepEqual(removed.engineering_events, next.workflow.engineering_events);
  assert.deepEqual(await verifyBasEngineeringHistory(removed), removed);
  assert.equal((await basEngineeringView(removed, request.capture_id)).dependency_status, 'stale_dependencies');
  const foreign = structuredClone(next.workflow);
  foreign.engineering_events![1].expected_sequence_head = 'f'.repeat(64);
  assert.throws(() => basWorkflowSchema.parse(foreign), /matching SOO review/);
});

test('response acceptance binds the returned event to the exact submitted request', async () => {
  const { workflow, request } = await engineeringFixture();
  const saved = await applyBasEngineeringReview(workflow, request, 'operator_input');
  assert.doesNotThrow(() => assertBasEngineeringUpdate(workflow, saved.workflow, saved.event, request, 'operator_input'));
  assert.throws(() => assertBasEngineeringUpdate(workflow, saved.workflow, saved.event, request, 'agent_proposal'), /different.*origin/);
  for (const changed of [{ ...request, reason: 'Another submission' }, { ...request, operation_id: uuid(80) },
    { ...request, expected_sequence_head: 'f'.repeat(64) }]) {
    assert.throws(() => assertBasEngineeringUpdate(workflow, saved.workflow, saved.event, changed, 'operator_input'), /different.*request/);
  }
});

test('1001 saved decisions replay across the batch boundary, and corruption in the final batch rejects the entire history', async t => {
  const { workflow, request } = await engineeringFixture();
  const first = await applyBasEngineeringReview(workflow, request, 'operator_input');
  const events = [first.event];
  for (let i = 1; i <= 1000; i++) {
    const { event_id: _id, ...payload } = structuredClone(first.event);
    payload.operation_id = uuid(1000 + i); payload.expected_head = events.at(-1)!.event_id;
    events.push({ ...payload, event_id: await basEventFingerprint(payload) });
  }
  const history = { ...first.workflow, engineering_events: events };
  const start = performance.now();
  assert.deepEqual(await verifyBasEngineeringHistory(history), history);
  t.diagnostic(`1001 controlled events replayed in ${(performance.now() - start).toFixed(1)} ms; ${Buffer.byteLength(JSON.stringify(history))} serialized bytes`);
  const forged = structuredClone(history), last = forged.engineering_events.at(-1)!;
  last.result.checks[0].constraints[0].message = 'Forged final-batch result';
  const { event_id: _id, ...payload } = last; last.event_id = await basEventFingerprint(payload);
  await assert.rejects(verifyBasEngineeringHistory(forged), /does not match shared Python replay/);
});
