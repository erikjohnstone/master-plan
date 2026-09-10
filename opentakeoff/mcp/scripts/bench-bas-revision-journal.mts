/** Serial, complete shared-service baseline on retained real-source evidence.
 * Same pinned basis on both sides: not an issued addendum or public walkthrough.
 * First-run measurements precede this gate: each operation 4.01–4.25 seconds,
 * 251,494,400-byte incremental peak RSS. Subsequent candidates must keep each
 * operation below 6 seconds (~41% headroom) and incremental peak below 512 MiB.
 * Existing history/inventory/comparison gates remain unchanged. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { addRevisionSourceSet, revisionBasis } from '../../web/test/helpers/basRevisionFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { prepareBasRevisionReview, recordBasRevisionReview, readBasRevisionReview } from '../src/basRevisionReview.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const workflow = await addRevisionSourceSet(JSON.parse(raw.toString()).bas_workflow), basis = revisionBasis(workflow);
const comparison = { before: basis, after: basis, matches: [], added: [], removed: [], membership_reviews: [] };
const times: Array<{ prepare_ms: number; record_ms: number; reopen_ms: number; journal_bytes: number }> = [];
const startRss = process.memoryUsage().rss;
let retained = workflow, rows = 0, saved_records = 0, checked_matrices = 0;
for (let i = 0; i < 3; i++) {
  const start = performance.now(), preview = await prepareBasRevisionReview(retained, comparison), prepared = performance.now();
  const saved = await recordBasRevisionReview(retained, { comparison: preview.comparison, expected_head: preview.expected_head,
    expected_report_fingerprint: preview.expected_report_fingerprint, operation_id: uuid(800 + i), name: 'Retained same-basis comparison',
    reviewer: 'Controlled self-declared benchmark reviewer', reason: 'Performance baseline, not an approval or issued addendum' }, 'operator_input',
    { createdAt: '2026-09-10T12:00:00.000Z' });
  const recorded = performance.now();
  const reopened = await readBasRevisionReview(JSON.parse(JSON.stringify(saved.workflow)), saved.event.event_id), finished = performance.now();
  assert.equal(reopened.report_verification, 'matches_saved_report');
  assert.equal(reopened.actual_report_fingerprint, preview.expected_report_fingerprint);
  assert.equal(saved.event.approved, false); assert.equal(saved.workflow.revision_events!.length, i + 1);
  assert.ok(reopened.report.rows.every(r => r.quantities.every(q => q.delta === null || q.delta === 0)));
  rows = reopened.report.rows.length; saved_records = reopened.report.checked_saved_records.length;
  checked_matrices = reopened.report.checked_point_matrices.length;
  times.push({ prepare_ms: prepared - start, record_ms: recorded - prepared, reopen_ms: finished - recorded,
    journal_bytes: Buffer.byteLength(JSON.stringify(saved.workflow.revision_events)) });
  for (const elapsed of [prepared - start, recorded - prepared, finished - recorded])
    assert.ok(elapsed < 6000, `Complete retained comparison-journal operation exceeded 6 s: ${elapsed} ms`);
  retained = saved.workflow;
}
const incrementalPeak = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
assert.ok(incrementalPeak < 512 * 1024 * 1024, 'Comparison journal exceeded 512 MiB incremental peak RSS');
console.log(JSON.stringify({ benchmark: 'complete_bas_revision_journal', budget_per_operation_ms: 6000,
  budget_incremental_rss: 512 * 1024 * 1024, fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed: times, initial_rss: startRss,
  incremental_peak_rss: incrementalPeak, rows,
  selected_saved_records_replayed_in_python: saved_records, point_matrices_checked_in_python: checked_matrices,
  source_bytes_verified: false, pdf_extraction: false, public_walkthrough: false }));
