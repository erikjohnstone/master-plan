// Shared journal performance and optional real-original backup integrity.
// Retained Fort Sam source + controlled earlier engineering declarations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { addRevisionSourceSet, revisionBasis } from '../test/helpers/basRevisionFixture.ts';
import { uuid } from '../test/helpers/basEngineeringFixture.ts';
import { scopeRequest } from '../test/helpers/basScopeFixture.ts';
import { applyBasScopeReview, readBasScopeDecision, type BasCoverageAction } from '../src/lib/basScopeReview.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../src/lib/basEvidenceBundle.ts';
import type { BasDeliverableScopeSpec } from '../src/lib/basDeliverableScope.ts';
import { ANN_SCHEMA } from '../src/lib/store.js';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const w = await addRevisionSourceSet(JSON.parse(raw.toString()).bas_workflow), capture_id = w.current_capture_id!;
const spec: BasDeliverableScopeSpec = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(700),
  name: 'Retained-source scope benchmark', reason: 'Performance probe, not approval', basis: revisionBasis(w), excluded: [],
  included: [
    ...w.equipment_events!.at(-1)!.register.equipment.map(e => ({ claim: 'scheduled_equipment' as const, capture_id, subject_id: e.equipment_id })),
    ...w.equipment_events!.at(-1)!.register.assignments.map(a => ({ claim: 'assigned_points' as const, capture_id, subject_id: a.assignment_id })),
    ...w.assembly_events!.at(-1)!.register.components.flatMap(c => [
      { claim: 'assembly_components' as const, capture_id, subject_id: c.component_id },
      { claim: 'responsibilities' as const, capture_id, subject_id: c.component_id }]),
    ...w.engineering_events!.at(-1)!.register.input.checks.map(c => ({ claim: 'engineering_compatibility' as const, capture_id, subject_id: c.check_id })),
  ] };
const startRss = process.memoryUsage().rss, times: Record<string, number[]> = { save: [], coverage: [], read_after_unrelated_edit: [] };
const budget_ms = 5000, rss_budget = 512 * 1024 * 1024;
let last = w;
for (let n = 0; n < 3; n++) {
  let start = performance.now();
  const saved = await applyBasScopeReview(w, scopeRequest(w, 701, { kind: 'save_scope', specification: spec, previous_scope_event_id: null }), 'operator_input');
  times.save.push(performance.now() - start);
  const action: BasCoverageAction = { kind: 'record_coverage', scope_event_id: saved.event.event_id, basis: spec.basis,
    claim: spec.included[0], unit: { capture_id, page_id: w.captures[0].narrative_sources!.pages[0].page_id, span_ids: null },
    assessment: 'unresolved', mapped_item_ids: [], inspected_source: true };
  start = performance.now();
  const reviewed = await applyBasScopeReview(saved.workflow, scopeRequest(saved.workflow, 702, action), 'operator_input');
  times.coverage.push(performance.now() - start);
  const equipment = structuredClone(w.equipment_events!.at(-1)!.register); assert.ok(equipment.equipment.length > 1);
  equipment.equipment[1].reason = 'Controlled unrelated-equipment edit';
  const edited = await applyBasEquipmentReview(reviewed.workflow, { operation_id: uuid(703), capture_id,
    expected_head: w.equipment_events!.at(-1)!.event_id, register: equipment, reason: 'Benchmark unrelated change' }, 'operator_input');
  start = performance.now();
  const read = await readBasScopeDecision(edited, reviewed.event.event_id);
  times.read_after_unrelated_edit.push(performance.now() - start);
  assert.equal(read.state, 'current_dependencies'); assert.equal(read.approved, false); last = reviewed.workflow;
}
const incremental_peak_rss = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
console.log(JSON.stringify({ benchmark: 'bas_scope_review', fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed_ms: times, budget_ms, incremental_peak_rss, rss_budget,
  claims: spec.included.length, source_bytes_checked: false, python_replay: false }));
assert.ok(Object.values(times).flat().every(t => t < budget_ms), 'Scope journal exceeds the predeclared 5 s operation budget');
assert.ok(incremental_peak_rss < rss_budget, 'Scope journal exceeds the predeclared 512 MiB incremental RSS budget');

// Optional local real-PDF path, explicit and required when invoking this proof.
// CI's portable unit gate uses independently hashed controlled bytes instead.
if (process.argv[2]) {
  const bytes = readFileSync(process.argv[2]), source = last.captures[0].sources[0];
  assert.equal(last.captures.length, 1); assert.equal(last.captures[0].sources.length, 1);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const payload = { schema: ANN_SCHEMA, shapes: [], bas_workflow: last }, chunks: Uint8Array[] = [];
  const prepared = await prepareBasEvidenceBundle(payload);
  for await (const chunk of prepared.stream(async entry => { assert.equal(entry.source.source_id, source.source_id); return bytes; })) chunks.push(chunk);
  const archive = Buffer.concat(chunks), opened = await openBasEvidenceBundle({ size: archive.length,
    async read(offset, length) { return archive.subarray(offset, offset + length); } });
  await opened.verifyOriginals(); assert.deepEqual(Buffer.from(await opened.readSource(source.source_id)), bytes);
  assert.deepEqual(opened.payload, payload); assert.equal(opened.manifest.purpose, 'unapproved_evidence_backup');
  assert.deepEqual(await readBasScopeDecision(opened.payload.bas_workflow, last.scope_events!.at(-1)!.event_id),
    await readBasScopeDecision(last, last.scope_events!.at(-1)!.event_id));
  console.log(JSON.stringify({ proof: 'bas_scope_real_original_backup', original_sha256: source.sha256,
    original_bytes: bytes.length, archive_bytes: archive.length, source_bytes_checked: true, approved: false,
    extraction_rerun: false, public_ui_mcp_walkthrough: false }));
}
