// Controlled journal stress case, not a PDF/revision accuracy benchmark.
import assert from 'node:assert/strict';
import { replayBasDrawingHistory, basDrawingCapturePages, basDrawingDependencyFingerprint,
  suggestBasDrawingRevision } from '../src/lib/basDrawingRevision.ts';
import { BAS_DRAWING_RULE, type BasDrawingEvent } from '../src/lib/basDrawingContract.ts';
import { basEventFingerprint } from '../src/lib/basWorkflow.ts';

const initial_rss = process.memoryUsage().rss;
const capture = { capture_id: 'a'.repeat(64), sources: [{ source_id: `sha256:${'b'.repeat(64)}`,
  sha256: 'b'.repeat(64), byte_length: 1000, page_count: 1000, names: ['controlled-journal.pdf'] }] };
const events: BasDrawingEvent[] = [];
const pages = basDrawingCapturePages(capture);
for (let i = 0; i <= 100; i++) {
  const last = events.at(-1);
  const action = !last ? { kind: 'create_source_set' as const, name: 'Controlled baseline', pages }
    : suggestBasDrawingRevision({ source_set_id: last.event_id, name: last.action.name, pages,
      origin: 'operator_input' }, capture, 'replacement_set', `Controlled repeated revision ${i}`);
  const payload = { operation_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    expected_head: last?.event_id ?? null, expected_dependencies: await basDrawingDependencyFingerprint(action),
    reviewer: 'Controlled benchmark identity', reason: 'Journal validation benchmark, not a real revision',
    action, rule_version: BAS_DRAWING_RULE, origin: 'operator_input' as const, created_at: '2026-09-10T10:00:00.000Z' };
  events.push({ ...payload, event_id: await basEventFingerprint(payload) });
}
const elapsed_ms: number[] = [], observed_rss_bytes: number[] = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now(), result = replayBasDrawingHistory([capture], events);
  elapsed_ms.push(performance.now() - start);
  observed_rss_bytes.push(process.memoryUsage().rss);
  assert.equal(result.source_sets.size, 101);
  assert.deepEqual(result.source_sets.get(events.at(-1)!.event_id)!.pages, pages);
  assert.ok(result.revisions.every(r => r.unresolved_pages === 0 && r.source_set_id !== null));
}
const peak_rss_bytes = process.resourceUsage().maxRSS * 1024;
const budget_ms = 2000, budget_incremental_rss_bytes = 256 * 1024 ** 2;
console.log(JSON.stringify({ benchmark: 'bas_drawing_history', fixture: 'controlled_1000_pages_100_revisions',
  accounting_entries: 201000, node: process.version, elapsed_ms, budget_ms,
  initial_rss, observed_rss_bytes, peak_rss_bytes, peak_incremental_rss_bytes: peak_rss_bytes - initial_rss,
  budget_incremental_rss_bytes, scope: 'synchronous_journal_validation_not_extraction_or_approval' }));
assert.ok(elapsed_ms.every(ms => ms < budget_ms), 'Drawing history replay exceeded its predeclared 2 s budget');
assert.ok(peak_rss_bytes - initial_rss < budget_incremental_rss_bytes, 'Drawing history exceeded its predeclared incremental 256 MiB budget');
