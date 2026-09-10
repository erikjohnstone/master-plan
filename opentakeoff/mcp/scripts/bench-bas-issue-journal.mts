/** Shared-path gate: yes, measure the shared issue service. No PDF/extraction
 * or physical design validation. Real retained source; controlled scope edits.
 * Budgets predeclared in ISSUE_DECISION_CONTRACT.md before this experiment. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { applyBasIssueReview, inspectBasIssueReview, readBasIssueDecision, basIssueHead } from '../../web/src/lib/basIssueReview.ts';
import { currentBasIssueBasis } from '../../web/src/lib/basIssueBasis.ts';
import type { BasIssueReviewRequest } from '../../web/src/lib/basIssueReviewContract.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';

const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
let workflow: BasWorkflow = JSON.parse(raw.toString()).bas_workflow;
const original = canonicalBasJson(workflow.captures), startRss = process.memoryUsage().rss;
const elapsed: Array<{ operation: string; ms: number; budget_ms: number; rss: number; heap_used: number; incremental_peak_rss: number }> = [];
async function measure<T>(operation: string, budget_ms: number, run: () => Promise<T>) {
  const start = performance.now(), result = await run(), ms = performance.now() - start;
  elapsed.push({ operation, ms, budget_ms, rss: process.memoryUsage().rss, heap_used: process.memoryUsage().heapUsed,
    incremental_peak_rss: Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss) }); return result;
}
const request = (n: number, action: BasIssueReviewRequest['action']): BasIssueReviewRequest => ({
  operation_id: uuid(n), capture_id: workflow.current_capture_id!, expected_head: basIssueHead(workflow, workflow.current_capture_id!),
  expected_basis: currentBasIssueBasis(workflow, workflow.current_capture_id!), reviewer: 'Controlled benchmark reviewer',
  reason: 'Performance proof with controlled inputs, not an issued design or approval', action });
const view = await measure('inspect', 6000, () => inspectBasIssueReview(workflow, workflow.current_capture_id!));
const finding = view.project_review.issues.find(i => i.code === 'scope_partly_unknown'); assert.ok(finding);
const start = await measure('begin_correction', 6000, () => applyBasIssueReview(workflow,
  request(900, { kind: 'begin_correction', issue_key: finding.issue_key, occurrence_id: finding.occurrence_id }), 'operator_input'));
workflow = start.workflow;
await measure('replay_current_observation', 8000, () => readBasIssueDecision(workflow, start.event.event_id));
const register = structuredClone(workflow.equipment_events!.at(-1)!.register);
for (const scope of register.scopes) Object.assign(scope, { building: 'Controlled building', level: 'Controlled level', phase: 'Controlled phase',
  reason: 'Explicit benchmark-only scope inputs. Not values read from the PDF.' });
workflow = await applyBasEquipmentReview(workflow, { operation_id: uuid(901), capture_id: workflow.current_capture_id!,
  expected_head: workflow.equipment_events!.at(-1)!.event_id, register,
  reason: 'Controlled correction to exercise historical replay; no source claim' }, 'operator_input');
const after = await measure('inspect_corrected', 6000, () => inspectBasIssueReview(workflow, workflow.current_capture_id!));
assert.ok(!after.project_review.issues.some(i => i.issue_key === finding.issue_key));
const confirm = await measure('record_not_reported', 6000, () => applyBasIssueReview(workflow,
  request(902, { kind: 'record_not_reported', observation_id: start.event.event_id }), 'operator_input'));
workflow = confirm.workflow;
const reopened = await measure('replay_after_canonical_backup', 8000, () => readBasIssueDecision(JSON.parse(canonicalBasJson(workflow)), confirm.event.event_id));
assert.deepEqual(reopened.original_finding, finding); assert.equal(reopened.current_state, 'not_reported');
assert.equal(reopened.approved, false); assert.equal(reopened.project_complete, false);
assert.equal(canonicalBasJson(workflow.captures), original);
const incrementalPeak = Math.max(0, process.resourceUsage().maxRSS * 1024 - startRss);
const result = { benchmark: 'shared_bas_issue_journal', fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform,
  arch: process.arch, cpu: cpus()[0].model, elapsed, initial_rss: startRss, incremental_peak_rss: incrementalPeak,
  budget_incremental_rss: 512 * 1024 * 1024, findings_before: view.project_review.issues.length,
  findings_after: after.project_review.issues.length, original_finding_replayed: true, original_capture_unchanged: true,
  journal_bytes: Buffer.byteLength(canonicalBasJson(workflow.issue_events)),
  source_bytes_verified: false, pdf_extraction: false, python_replay: false, public_walkthrough: false };
console.log(JSON.stringify(result));
for (const sample of elapsed) assert.ok(sample.ms < sample.budget_ms, `${sample.operation} exceeded ${sample.budget_ms} ms: ${sample.ms}`);
assert.ok(incrementalPeak < result.budget_incremental_rss, 'Issue journal exceeded 512 MiB incremental peak RSS');
