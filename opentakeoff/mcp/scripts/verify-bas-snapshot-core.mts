/** Core storage-format probe with real retained evidence/original and actual
 * Python. Applicability/approval decisions are CONTROLLED, not a user approval,
 * public-MCP walkthrough, fresh extraction, or independent corpus ground truth. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { reviewReadyScope } from '../../web/test/helpers/basReadinessFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from '../../web/src/lib/basSnapshot.ts';
import { prepareBasSnapshotBundle, openBasSnapshotBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { verifyBasWorkflowCalculations } from '../src/basWorkflowReplay.ts';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import type { BasScopeReviewEvent } from '../../web/src/lib/basScopeReview.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
const originalPath = process.argv[2];
if (!originalPath) throw new Error('Pass the exact original PDF path; no filename-only source substitution');
const raw = await readFile(new URL('../../docs/bas-production/evidence/scope-browser-7/reviewed.takeoff.json', import.meta.url));
const payload = JSON.parse(raw.toString()), workflow: BasWorkflow = payload.bas_workflow;
const original = await readFile(originalPath), original_sha256 = createHash('sha256').update(original).digest('hex');
assert.equal(original_sha256, workflow.captures[0].sources[0].sha256);
const spec = (workflow.scope_events!.filter(e => e.action.kind === 'save_scope').at(-1)!.action as Extract<BasScopeReviewEvent['action'], { kind: 'save_scope' }>).specification;
const included = spec.included.filter(t => t.claim === 'scheduled_equipment');
assert.equal(included.length, 2, 'Retained fixture identity changed; investigate rather than silently narrowing');
const rss = process.memoryUsage().rss, setup = performance.now();
const memory = (stage: string) => console.error(JSON.stringify({ stage, rss: process.memoryUsage().rss,
  heap_used: process.memoryUsage().heapUsed, incremental_peak_rss: Math.max(0, process.resourceUsage().maxRSS * 1024 - rss) }));
// The original retained operator review explicitly leaves these values unknown.
// Do NOT weaken readiness. This positive FORMAT/RUNTIME probe adds controlled
// declarations through the real review service, with no extracted-source claim.
const lastEquipment = workflow.equipment_events!.at(-1)!, register = structuredClone(lastEquipment.register);
for (const scope of register.scopes) {
  scope.building ??= 'CONTROLLED TEST BUILDING'; scope.level ??= 'CONTROLLED TEST LEVEL'; scope.phase ??= 'CONTROLLED TEST PHASE';
  scope.source_span_ids = [];
  scope.reason = 'CONTROLLED operator declarations for archive format/runtime test; these fields are not extracted or user-approved project facts';
}
const declared = await applyBasEquipmentReview(workflow, { operation_id: '00000000-0000-4000-8000-000000009998',
  capture_id: lastEquipment.capture_id, expected_head: lastEquipment.event_id, register,
  reason: 'Controlled scope declarations; preserve original unknown review in history' }, 'operator_input', '2026-09-10T17:00:00.000Z');
const reviewed = await reviewReadyScope(declared, included, 2000);
const setup_ms = performance.now() - setup;
memory('after_controlled_setup');
payload.bas_workflow = reviewed.workflow;
const replayCalculations = (w: BasWorkflow, signal?: AbortSignal) => verifyBasWorkflowCalculations(w, { signal });
const start = performance.now();
const plan = await prepareBasSnapshotApproval(payload, { operation_id: '00000000-0000-4000-8000-000000009999',
  scope_event_id: reviewed.scope.event_id, reviewer: 'CONTROLLED CORE TEST — not a user approval',
  reason: 'Source-backed transport/runtime fixture with controlled applicability, not production scope verification',
  declared_at: '2026-09-10T17:00:00.000Z' }, 'operator_input', { readSource: async () => original, replayCalculations });
const preparation_ms = performance.now() - start, archiveStart = performance.now();
memory('after_preparation');
const prepared = await prepareBasSnapshotBundle(plan), chunks = [];
for await (const chunk of prepared.stream(async () => original)) chunks.push(chunk);
const archive = Buffer.concat(chunks), archive_ms = performance.now() - archiveStart, reopenStart = performance.now();
memory('after_archive');
const reopened = await openBasSnapshotBundle({ size: archive.length, read: async (o, n) => archive.subarray(o, o + n) }, { replayCalculations });
const reopen_ms = performance.now() - reopenStart;
memory('after_reopen');
assert.equal(reopened.plan.snapshot_id, plan.snapshot_id);
assert.deepEqual(await reopened.readSource(workflow.captures[0].sources[0].source_id), new Uint8Array(original));
assert.equal(readBasSnapshotPlan(reopened.plan).payload_json, readBasSnapshotPlan(plan).payload_json);
const incremental_peak_rss = Math.max(0, process.resourceUsage().maxRSS * 1024 - rss);
const readiness = JSON.parse(readBasSnapshotPlan(plan).record.snapshot.readiness_json);
const report = { probe: 'source_backed_snapshot_core', fixture_sha256: createHash('sha256').update(raw).digest('hex'), fixture_bytes: raw.length,
  original_sha256, original_bytes: original.length, archive_bytes: archive.length, snapshot_id: plan.snapshot_id,
  setup_ms, preparation_ms, archive_ms, reopen_ms, stage_budget_ms: 25000, incremental_peak_rss, rss_budget: 512 * 1024 ** 2,
  included_claims: readiness.scope.claims.length, retained_issues: readiness.issues.length,
  checked_records: readiness.replay.checked_records, calculation_verification: readiness.replay.calculation_verification,
  node: process.version, cpu: cpus()[0].model, platform: process.platform, arch: process.arch,
  controlled_review: true, controlled_scope_fields: ['building', 'level', 'phase'], public_ui_mcp_walkthrough: false, project_approved: false, persisted: false };
console.log(JSON.stringify(report));
assert.ok(preparation_ms < report.stage_budget_ms && reopen_ms < report.stage_budget_ms, 'Snapshot stage exceeds predeclared 25 s probe budget');
assert.ok(incremental_peak_rss < report.rss_budget, 'Snapshot core probe exceeds predeclared 512 MiB incremental RSS');
