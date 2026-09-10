// Shared internal scope preview over real retained source + controlled decisions.
// No PDF extraction, source-byte check, public transport or fresh Python replay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { addRevisionSourceSet, revisionBasis } from '../test/helpers/basRevisionFixture.ts';
import { uuid } from '../test/helpers/basEngineeringFixture.ts';
import { buildBasDeliverableScope, type BasDeliverableScopeSpec } from '../src/lib/basDeliverableScope.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const w = await addRevisionSourceSet(JSON.parse(raw.toString()).bas_workflow), capture_id = w.current_capture_id!;
const spec: BasDeliverableScopeSpec = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(300),
  name: 'Retained-source scope benchmark', reason: 'Performance probe, not approval', basis: revisionBasis(w), excluded: [],
  included: [
    ...w.equipment_events!.at(-1)!.register.equipment.map(e => ({ claim: 'scheduled_equipment' as const, capture_id, subject_id: e.equipment_id })),
    ...w.equipment_events!.at(-1)!.register.assignments.map(a => ({ claim: 'assigned_points' as const, capture_id, subject_id: a.assignment_id })),
    ...w.assembly_events!.at(-1)!.register.components.flatMap(c => [
      { claim: 'assembly_components' as const, capture_id, subject_id: c.component_id },
      { claim: 'responsibilities' as const, capture_id, subject_id: c.component_id }]),
    ...w.engineering_events!.at(-1)!.register.input.checks.map(c => ({ claim: 'engineering_compatibility' as const, capture_id, subject_id: c.check_id })),
  ] };
const startRss = process.memoryUsage().rss, times: number[] = [], budget_ms = 5000, rss_budget = 512 * 1024 * 1024;
let items = 0, dependencies = 0, projection_bytes = 0;
for (let n = 0; n < 3; n++) {
  const start = performance.now(), result = await buildBasDeliverableScope(w, spec);
  times.push(performance.now() - start); items = result.inventory.items.length;
  dependencies = result.claims.reduce((sum, c) => sum + c.dependency_item_ids.length, 0);
  const { inventory: _inventory, ...projection } = result;
  projection_bytes = Buffer.byteLength(JSON.stringify(projection));
  assert.equal(result.approved, false); assert.equal(result.coverage_verification, 'not_reviewed');
}
const incremental_peak_rss = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
console.log(JSON.stringify({ benchmark: 'bas_deliverable_scope', fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed_ms: times, budget_ms, incremental_peak_rss, rss_budget,
  items, claims: spec.included.length, dependencies, projection_bytes, source_bytes_checked: false, python_replay: false }));
assert.ok(times.every(t => t < budget_ms), 'Scope preview exceeds the predeclared 5 s budget');
assert.ok(incremental_peak_rss < rss_budget, 'Scope preview exceeds the predeclared 512 MiB incremental RSS budget');
