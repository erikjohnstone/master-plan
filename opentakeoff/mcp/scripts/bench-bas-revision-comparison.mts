/** Complete serial retained-input comparison regression gate, declared after
 * measuring the initial baseline and before later candidate evaluation.
 * This is not PDF extraction, a public walkthrough or an issued-addendum proof. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { addRevisionSourceSet, revisionBasis } from '../../web/test/helpers/basRevisionFixture.ts';
import { compareBasRevisions } from '../src/basRevisionComparison.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const workflow = await addRevisionSourceSet(JSON.parse(raw.toString()).bas_workflow), basis = revisionBasis(workflow);
const request = { before: basis, after: basis, matches: [], added: [], removed: [], membership_reviews: [] };
const times: number[] = [], startRss = process.memoryUsage().rss;
let rows = 0, calculated = 0, saved_records = 0, checked_matrices = 0, encoded_bytes = 0;
for (let i = 0; i < 3; i++) {
  const start = performance.now(), result = await compareBasRevisions(workflow, request);
  times.push(performance.now() - start); rows = result.rows.length;
  assert.ok(times.at(-1)! < 6000, `Complete retained comparison exceeded the predeclared 6 s budget: ${times.at(-1)} ms`);
  calculated = result.rows.flatMap(r => r.quantities).filter(q => q.status === 'calculated').length;
  assert.ok(result.rows.every(r => r.quantities.every(q => q.delta === null || q.delta === 0)));
  assert.equal(result.approved, false); saved_records = result.checked_saved_records.length;
  checked_matrices = result.checked_point_matrices.length; encoded_bytes = Buffer.byteLength(JSON.stringify(result));
}
const incrementalPeak = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
assert.ok(incrementalPeak < 512 * 1024 * 1024, 'Comparison exceeded 512 MiB incremental peak RSS');
console.log(JSON.stringify({ benchmark: 'complete_bas_revision_comparison', budget_ms: 6000, budget_incremental_rss: 512 * 1024 * 1024, fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed_ms: times, initial_rss: startRss,
  incremental_peak_rss: incrementalPeak, rows, calculated,
  selected_saved_records_replayed_in_python: saved_records, point_matrices_checked_in_python: checked_matrices,
  encoded_bytes, source_bytes_verified: false, pdf_extraction: false, public_walkthrough: false }));
