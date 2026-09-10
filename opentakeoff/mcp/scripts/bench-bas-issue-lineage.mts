/** Structural bound only, not full 10,000-version finding replay. Serial gate
 * predeclared at 2 s / 256 MiB in ISSUE_DECISION_CONTRACT.md. */
import assert from 'node:assert/strict';
import { cpus } from 'node:os';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { applyBasIssueReview, inspectBasIssueReview } from '../../web/src/lib/basIssueReview.ts';
import { validateBasIssueJournal } from '../../web/src/lib/basIssueReviewHistory.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import type { BasIssueReviewEvent } from '../../web/src/lib/basIssueReviewContract.ts';
const f = await engineeringFixture(), view = await inspectBasIssueReview(f.workflow, f.workflow.current_capture_id!);
const finding = view.project_review.issues[0]; assert.ok(finding);
const saved = await applyBasIssueReview(f.workflow, { operation_id: uuid(950), capture_id: f.workflow.current_capture_id!,
  expected_head: null, expected_basis: view.basis, reviewer: 'Controlled benchmark reviewer', reason: 'Structural test only',
  action: { kind: 'acknowledge', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } }, 'operator_input');
const events: BasIssueReviewEvent[] = [];
for (let i = 0; i < 10000; i++) events.push({ ...saved.event, operation_id: uuid(30000 + i), event_id: i.toString(16).padStart(64, '0'),
  expected_head: events.at(-1)?.event_id ?? null });
const startRss = process.memoryUsage().rss, start = performance.now();
const result = validateBasIssueJournal({ ...f.workflow, issue_events: events }), ms = performance.now() - start;
const incrementalPeak = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
assert.equal(result.seen.size, 10000); assert.equal(result.encoded_bytes, Buffer.byteLength(canonicalBasJson(events)));
assert.equal(result.finding_verification, 'not_replayed');
console.log(JSON.stringify({ benchmark: 'bas_issue_lineage_bound', events: 10000, ms, budget_ms: 2000,
  incremental_peak_rss: incrementalPeak, budget_incremental_rss: 256 * 1024 * 1024, journal_bytes: result.encoded_bytes,
  node: process.version, cpu: cpus()[0].model, hash_verification: false, finding_replay: false, fixture: 'controlled' }));
assert.ok(ms < 2000, `10,000-event lineage exceeded 2 s: ${ms}`);
assert.ok(incrementalPeak < 256 * 1024 * 1024, 'Lineage exceeded 256 MiB incremental peak RSS');
