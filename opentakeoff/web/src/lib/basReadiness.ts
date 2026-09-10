/** SHOULD THIS BE ON THE SHARED PATH? Yes. One computed prerequisite for UI/MCP
 * explicit scoped approval. No extraction, math, persistence or approval here. */
import { prepareBasScopeReadiness } from './basScopeReview.ts';
import { basDeliverableTargetKey } from './basDeliverableScopeContract.ts';
import { evaluateBasReadinessCoverage, basReadinessDiagnosticBlocks, type BasReadinessBlocker } from './basReadinessCoverage.ts';
import { evaluateBasReadinessIssues } from './basReadinessIssues.ts';
import { projectReviewForVerifiedBasWorkflow } from './basProjectReview.ts';
import { sourceInventoryForVerifiedBasWorkflow, verifyBasSourceBytes, type BasRetainedSource } from './basSourceRetention.ts';
import { assertReplayReceiptForVerifiedBasWorkflow, replayIdentityForVerifiedBasWorkflow, BAS_WORKFLOW_REPLAY_RULE,
  type BasWorkflowReplayReceipt } from './basWorkflowReplay.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import type { BasWorkflow } from './basWorkflow.ts';

export const BAS_READINESS_RULE = 'bas_scoped_readiness_1' as const;
/** Trusted transport wiring, NOT public request fields. The browser invokes
 * its existing local Python endpoint; MCP invokes the same Python service.
 * Persisted receipts never replace fresh service execution at a seal boundary. */
export type BasReadinessIO = {
  readSource?: (source: BasRetainedSource, signal?: AbortSignal) => Promise<Uint8Array | ArrayBuffer | null>;
  replayCalculations?: (workflow: BasWorkflow, signal?: AbortSignal) => Promise<unknown>;
};

export async function buildBasReadiness(raw: unknown, scopeEventId: string, io: BasReadinessIO = {}, signal?: AbortSignal) {
  const adapters = { ...io }; signal?.throwIfAborted();
  const input = await prepareBasScopeReadiness(raw, scopeEventId, signal);
  const { workflow, scope, current, original } = input;
  const workflow_sha256 = await sha256Hex(new TextEncoder().encode(canonicalBasJson(workflow)));
  const coverage = evaluateBasReadinessCoverage(input, signal), blockers: BasReadinessBlocker[] = [...coverage.blockers];
  const block = (code: string, explanation: string, target: BasReadinessBlocker['target'] = null, item_id: string | null = null) =>
    blockers.push({ code, explanation, target, item_id, page_id: null, event_ids: [] });
  if (scope.origin !== 'operator_input') block('scope_requires_human_review', 'The selected scope is an agent proposal, not an explicit human scope review.');
  const previous = new Map(original.claims.map(c => [basDeliverableTargetKey(c.target), c]));
  const items = new Map(current.inventory.items.map(i => [i.item_id, i]));
  for (const claim of current.claims) {
    signal?.throwIfAborted();
    if (previous.get(basDeliverableTargetKey(claim.target))?.dependency_fingerprint !== claim.dependency_fingerprint)
      block('scope_claim_dependencies_changed', 'This included claim changed after its saved scope review. Review the current scope and source dependencies.', claim.target);
    for (const d of claim.diagnostics) if (basReadinessDiagnosticBlocks(d, items.get(d.item_id)!))
      block(`scope_${d.code}`, 'The shared scope compiler reports an unresolved source, dependency or required calculation.', claim.target, d.item_id);
    if (claim.target.claim === 'engineering_compatibility') {
      const root = JSON.parse(items.get(claim.root_item_id)!.original_json);
      if (root.target.disposition !== 'included') block('engineering_target_excluded', 'An excluded engineering check cannot be an included compatibility claim.', claim.target, claim.root_item_id);
    }
  }
  const sources: { source: BasRetainedSource; status: 'verified_original_bytes' | 'unavailable' | 'not_verified' }[] = [];
  // The future archive carries the retained history: verify every referenced
  // original version, not just a conveniently open/current namesake.
  for (const { source } of sourceInventoryForVerifiedBasWorkflow(workflow)) {
    signal?.throwIfAborted();
    const bytes = adapters.readSource ? await adapters.readSource(structuredClone(source), signal) : null;
    signal?.throwIfAborted();
    if (bytes === null) {
      sources.push({ source, status: adapters.readSource ? 'unavailable' : 'not_verified' });
      block('original_source_unavailable', `Retain and verify the original PDF ${source.source_id}; a filename or saved quote is not source availability.`);
    } else { await verifyBasSourceBytes(source, bytes); signal?.throwIfAborted(); sources.push({ source, status: 'verified_original_bytes' }); }
  }
  if (!sources.length) block('source_inventory_empty', 'An empty original-source inventory cannot support an approved takeoff.');
  let replay: BasWorkflowReplayReceipt | null = null;
  if (adapters.replayCalculations) {
    // A transport receives its own copy; an accidental mutation cannot alter
    // the evaluated state or make its reply bind to different inputs.
    const receipt = await adapters.replayCalculations(structuredClone(workflow), signal);
    signal?.throwIfAborted(); replay = await assertReplayReceiptForVerifiedBasWorkflow(workflow, receipt, () => signal?.throwIfAborted());
  } else {
    const plan = await replayIdentityForVerifiedBasWorkflow(workflow, () => signal?.throwIfAborted());
    if (Object.values(plan.checked_records).every(ids => ids.length === 0)) replay = {
      schema_version: 'bas_workflow_replay_v1', rule_version: BAS_WORKFLOW_REPLAY_RULE, workflow_sha256: plan.workflow_sha256,
      checked_records: plan.checked_records, calculation_verification: 'no_saved_calculations', project_complete: false };
    else block('actual_python_replay_required', 'Run the existing shared Python verifier against every retained calculation; saved passing results are not fresh verification.');
  }
  const reviews = [];
  for (const { capture_id } of current.specification.basis.captures) {
    signal?.throwIfAborted(); reviews.push(await projectReviewForVerifiedBasWorkflow(workflow, capture_id));
  }
  const issues = evaluateBasReadinessIssues(current, reviews, coverage.pages,
    sources.length > 0 && sources.every(s => s.status === 'verified_original_bytes'), replay !== null, signal);
  for (const entry of issues) for (const effect of entry.effects) if (effect.effect === 'blocking')
    block(`issue:${entry.issue.domain}:${entry.issue.code}`, entry.issue.next_step, effect.target);
  signal?.throwIfAborted();
  const result = { schema_version: 'bas_readiness_v1' as const, rule_version: BAS_READINESS_RULE, workflow_sha256,
    scope_event_id: scope.event_id, source_set_id: current.specification.basis.source_set_id,
    status: blockers.length ? 'blocked' as const : 'ready_for_explicit_approval' as const,
    blockers, coverage, sources, replay, issues, scope: current,
    reviewer_identity: 'self_declared' as const, approved: false as const, project_complete: false as const, installed_quantity: null };
  return result;
}
export type BasReadiness = Awaited<ReturnType<typeof buildBasReadiness>>;
