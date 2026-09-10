/** Shared-path gate: yes. Controlled catalog/ownership checks, not PDF truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogBasScope, prepareBasScopeCoverage } from '../src/lib/basScopeCatalog.ts';
import { buildBasDeliverableScope, basDeliverableTargetKey } from '../src/lib/basDeliverableScope.ts';
import { applyBasScopeReview, readBasScopeDecision } from '../src/lib/basScopeReview.ts';
import { scopeFixture, scopeRequest, scopeSpec } from './helpers/basScopeFixture.ts';
import { revisionFixture, addRevisionSourceSet } from './helpers/basRevisionFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { captureBasEvidence, mergeBasWorkflows } from '../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';

test('catalog populates every retained equipment, assignment and assembly root without selecting or approving it', async () => {
  const f = await scopeFixture(), before = structuredClone(f.workflow);
  const unselected = await catalogBasScope(f.workflow);
  assert.equal(unselected.basis, null); assert.deepEqual(unselected.targets, []); assert.deepEqual(unselected.pages, []);
  assert.equal(unselected.source_sets.length, 1); assert.equal(unselected.approved, false);
  const catalog = await catalogBasScope(f.workflow, { source_set_id: f.basis.source_set_id });
  assert.deepEqual(catalog.basis, f.basis); assert.deepEqual(catalog.history, f.workflow.scope_events);
  assert.equal(catalog.history_verification, 'lineage_only'); assert.equal(catalog.source_bytes, 'not_verified');
  assert.deepEqual(catalog.targets.map(t => t.target.claim).sort(), [
    'scheduled_equipment', 'scheduled_equipment', 'assigned_points',
    'assembly_components', 'assembly_components', 'responsibilities', 'responsibilities',
  ].sort());
  const all = await buildBasDeliverableScope(f.workflow, { ...f.specification, included: catalog.targets.map(t => t.target) });
  assert.equal(all.claims.length, catalog.targets.length);
  for (const target of catalog.targets) {
    const claim = all.claims.find(c => basDeliverableTargetKey(c.target) === basDeliverableTargetKey(target.target))!;
    assert.equal(claim.root_item_id, target.item_id);
    assert.deepEqual(target.source_refs, all.inventory.items.find(i => i.item_id === target.item_id)!.source_refs);
  }
  assert.equal(catalog.pages.length, 2);
  assert.deepEqual(catalog.pages.map(p => p.retained_span_count), f.source.pages.map(p => p.spans.length));
  assert.deepEqual(f.workflow, before);
});

test('source-set boundaries retain outside roots and refuse unavailable sets or coverage on omitted pages', async () => {
  const f = await revisionFixture(), w = await addRevisionSourceSet(f.workflow, [1], 710);
  const source_set_id = w.drawing_events!.at(-1)!.event_id;
  const catalog = await catalogBasScope(w, { source_set_id });
  assert.equal(catalog.pages.length, 1); assert.equal(catalog.pages[0].page_id, f.source.pages[1].page_id);
  assert.ok(catalog.targets.some(t => t.source_scope === 'outside'));
  assert.equal(catalog.targets.length, 7, 'outside evidence must not disappear from available choices');
  await assert.rejects(catalogBasScope(w, { source_set_id: 'f'.repeat(64) }), /owned complete source set/);
  const spec = { ...scopeSpec(w), basis: catalog.basis! };
  await assert.rejects(prepareBasScopeCoverage(w, { specification: spec, claim: spec.included[0],
    unit: { capture_id: w.current_capture_id, page_id: f.source.pages[0].page_id, span_ids: null } }), /outside the selected source set/);
});

test('repeated labels and subject IDs across retained captures remain separate source-owned catalog choices', async () => {
  const f = await revisionFixture(), points = structuredClone(f.workflow.captures[0].points);
  points.issues.push('Controlled different capture, same original source and equipment labels');
  const fresh = await captureBasEvidence(f.source, points, f.workflow.captures[0].equipment_sources);
  let workflow = mergeBasWorkflows(f.workflow, fresh, true)!;
  workflow = await applyBasEquipmentReview(workflow, { operation_id: uuid(712), capture_id: fresh.current_capture_id,
    expected_head: null, register: f.equipment, reason: 'Independent retained register with repeated labels' }, 'operator_input');
  workflow = await addRevisionSourceSet(workflow, [0, 3], 713);
  const catalog = await catalogBasScope(workflow, { source_set_id: workflow.drawing_events!.at(-1)!.event_id });
  const repeated = catalog.targets.filter(t => t.target.claim === 'scheduled_equipment' && t.target.subject_id === uuid(11));
  assert.equal(repeated.length, 2); assert.equal(repeated[0].label, repeated[1].label);
  assert.equal(repeated[0].capture_label, repeated[1].capture_label, 'A repeated filename is not source identity');
  assert.notEqual(repeated[0].target.capture_id, repeated[1].target.capture_id);
  assert.notEqual(repeated[0].item_id, repeated[1].item_id);
  assert.equal(new Set(catalog.targets.map(t => basDeliverableTargetKey(t.target))).size, catalog.targets.length);
  assert.equal(catalog.pages.length, 2); assert.equal(new Set(catalog.pages.map(p => p.capture_id)).size, 2);
  for (const target of repeated) {
    const specification = { ...scopeSpec(workflow), basis: catalog.basis!, included: [target.target] };
    const page = catalog.pages.find(p => p.capture_id === target.target.capture_id)!;
    const prepared = await prepareBasScopeCoverage(workflow, { specification, claim: target.target,
      unit: { capture_id: page.capture_id, page_id: page.page_id, span_ids: null } });
    assert.equal(prepared.claim.target.capture_id, target.target.capture_id);
    assert.equal(prepared.source.unit.capture_id, target.target.capture_id);
  }
});

test('coverage preparation preserves all original spans and suggests exact source-reference intersections only', async () => {
  const f = await scopeFixture();
  const request = { specification: f.specification, claim: f.coverage.claim, unit: f.coverage.unit };
  const full = await prepareBasScopeCoverage(f.workflow, request);
  assert.deepEqual(full.source.spans, f.source.pages[0].spans);
  assert.equal(full.assessment, null); assert.equal(full.inspected_source, false); assert.equal(full.approved, false);
  assert.equal(full.project_complete, false); assert.equal(full.source_bytes, 'not_verified');
  assert.deepEqual(full.mappings.map(m => m.item_id).sort(), [...full.claim.dependency_item_ids].sort());
  for (const item of full.mappings) assert.equal(item.suggestion,
    item.source_refs.some(r => r.page_id === request.unit.page_id) ? 'same_original_page' : null);
  const span = f.source.pages[0].spans[0];
  const subset = await prepareBasScopeCoverage(f.workflow, { ...request, unit: { ...request.unit, span_ids: [span.span_id] } });
  assert.deepEqual(subset.source.spans, [span]);
  for (const item of subset.mappings) assert.equal(item.suggestion,
    item.source_refs.some(r => r.page_id === request.unit.page_id && r.span_id === span.span_id) ? 'same_original_span' : null);
  assert.equal(subset.mappings.length, full.mappings.length, 'non-suggested owned dependencies remain selectable');
  const saved = await applyBasScopeReview(f.workflow, scopeRequest(f.workflow, 711, f.coverage), 'operator_input');
  const read = await readBasScopeDecision(saved.workflow, saved.event.event_id);
  assert.ok('source' in read.original.value); assert.deepEqual(read.original.value.source, full.source);
});

test('preparation rejects foreign claims/pages/spans and untrusted extra evidence', async () => {
  const f = await scopeFixture(), request = { specification: f.specification, claim: f.coverage.claim, unit: f.coverage.unit };
  for (const bad of [
    { ...request, claim: { ...request.claim, subject_id: uuid(12) } },
    { ...request, unit: { ...request.unit, capture_id: 'f'.repeat(64) } },
    { ...request, unit: { ...request.unit, page_id: 'foreign' } },
    { ...request, unit: { ...request.unit, span_ids: ['foreign'] } },
    { ...request, unit: { ...request.unit, page_id: f.source.pages[1].page_id, span_ids: [f.source.pages[0].spans[0].span_id] } },
    { ...request, source_text: 'Caller supplied quote' },
    { ...request, unit: { ...request.unit, span_ids: [] } },
  ]) await assert.rejects(prepareBasScopeCoverage(f.workflow, bad));
  await assert.rejects(catalogBasScope(f.workflow, { source_set_id: f.basis.source_set_id, approved: true }));
});

test('catalog and preparation own caller inputs before awaits and support cancellation without mutation', async () => {
  const f = await scopeFixture(), original = structuredClone(f.workflow);
  const options = { source_set_id: f.basis.source_set_id }, request = { specification: structuredClone(f.specification),
    claim: structuredClone(f.coverage.claim), unit: structuredClone(f.coverage.unit) };
  const pending = catalogBasScope(f.workflow, options);
  options.source_set_id = 'f'.repeat(64); f.workflow.scope_events![0].reason = 'Caller mutation';
  const catalog = await pending;
  assert.equal(catalog.basis!.source_set_id, f.basis.source_set_id); assert.deepEqual(catalog.history, original.scope_events);
  const prepared = prepareBasScopeCoverage(original, request);
  request.specification.name = 'Changed while running'; request.unit.page_id = 'foreign';
  assert.equal((await prepared).specification.name, f.specification.name);
  for (const operation of [
    (signal: AbortSignal) => catalogBasScope(original, {}, signal),
    (signal: AbortSignal) => prepareBasScopeCoverage(original, { specification: f.specification, claim: f.coverage.claim, unit: f.coverage.unit }, signal),
  ]) {
    const abort = new AbortController(), pending = operation(abort.signal); abort.abort(new Error('Controlled cancellation'));
    await assert.rejects(pending, /Controlled cancellation/);
  }
});
