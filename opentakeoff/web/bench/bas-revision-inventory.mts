// Serial predeclared <5 s and <512 MiB incremental peak RSS gates. This reads
// retained real-PDF + explicit hardware decisions, not PDF extraction or full
// semantic/quantity comparison, and never claims fresh Python replay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { addRevisionSourceSet, revisionBasis } from '../test/helpers/basRevisionFixture.ts';
import { buildBasRevisionInventory } from '../src/lib/basRevisionInventory.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const w = await addRevisionSourceSet(JSON.parse(raw.toString()).bas_workflow), basis = revisionBasis(w);
const times: number[] = [], budget_ms = 5000, rss_budget = 512 * 1024 * 1024;
const startRss = process.memoryUsage().rss;
let itemCount = 0, reportBytes = 0;
for (let i = 0; i < 3; i++) {
  const started = performance.now(), result = await buildBasRevisionInventory(w, basis);
  times.push(performance.now() - started); itemCount = result.items.length;
  reportBytes = Buffer.byteLength(JSON.stringify(result));
  assert.equal(result.approved, false); assert.equal(result.calculation_verification, 'saved_results_not_python_replayed');
}
const incremental_peak_rss = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
console.log(JSON.stringify({ benchmark: 'bas_revision_inventory', fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed_ms: times, budget_ms, incremental_peak_rss, rss_budget,
  items: itemCount, encoded_report_bytes: reportBytes, source_bytes_checked: false, python_replay: false }));
assert.ok(times.every(t => t < budget_ms), 'Revision inventory exceeds the predeclared 5 s budget');
assert.ok(incremental_peak_rss < rss_budget, 'Revision inventory exceeds the predeclared 512 MiB incremental RSS budget');
