/** Shared append-only scope / human coverage decisions. No extraction, waiver,
 * PDF-byte verification, Python arithmetic or approval. */
import { z } from 'zod';
import { verifyBasWorkflow, assertVerifiedBasWorkflowReferences, basEventFingerprint, type BasWorkflow } from './basWorkflow.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { replayBasDrawingHistory } from './basDrawingRevision.ts';
import { defaultBasRevisionBasis } from './basRevisionBasis.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { deliverableScopeForVerifiedWorkflow, basDeliverableTargetKey, type BasDeliverableScopeSpec, type BasDeliverableScope } from './basDeliverableScope.ts';
import { basScopeReviewRequestSchema, basScopeReviewEventSchema, basCoverageSlotKey, BAS_SCOPE_REVIEW_RULE,
  type BasScopeReviewEvent, type BasCoverageAction } from './basScopeReviewContract.ts';
import { validateBasScopeJournal } from './basScopeReviewHistory.ts';
import { sourceForBasScopeCoverage } from './basScopeSource.ts';
export * from './basScopeReviewContract.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
type Options = { signal?: AbortSignal; createdAt?: string };
type SavedScope = BasScopeReviewEvent & { action: Extract<BasScopeReviewEvent['action'], { kind: 'save_scope' }> };
type Coverage = BasScopeReviewEvent & { action: BasCoverageAction };
const hash = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
const history = (w: BasWorkflow) => validateBasScopeJournal(w, replayBasDrawingHistory(w.captures, w.drawing_events).source_sets);
function savedScope(w: BasWorkflow, eventId: string): SavedScope {
  const event = w.scope_events?.find(e => e.event_id === eventId);
  if (!event || event.action.kind !== 'save_scope') throw new Error('Saved scope is not owned by this workflow');
  return event as SavedScope;
}
function ownedEvent(w: BasWorkflow, eventId: string) {
  const event = w.scope_events?.find(e => e.event_id === eventId);
  if (!event) throw new Error('Scope/coverage decision is not owned by this workflow');
  return event;
}
const currentSpec = (w: BasWorkflow, s: BasDeliverableScopeSpec): BasDeliverableScopeSpec => ({ ...s,
  basis: defaultBasRevisionBasis(w, s.basis.source_set_id) });
const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);

/** Per-operation memoization only. Never trust an externally supplied preview. */
function previews(w: BasWorkflow, signal?: AbortSignal) {
  const cache = new Map<string, Promise<BasDeliverableScope>>();
  return (spec: BasDeliverableScopeSpec) => {
    const key = canonicalBasJson(spec);
    const value = cache.get(key) ?? deliverableScopeForVerifiedWorkflow(w, spec, signal);
    // Aggregate readiness can visit many historical bases. Keep only the
    // current and one historical projection, not an unbounded inventory cache.
    cache.delete(key); cache.set(key, value);
    if (cache.size > 2) cache.delete(cache.keys().next().value!);
    return value;
  };
}
const scopeFingerprint = (v: BasDeliverableScope) => {
  const { inventory: _inventory, ...projection } = v; return hash(projection);
};
async function coverageResult(w: BasWorkflow, action: BasCoverageAction, specification: BasDeliverableScopeSpec,
  preview: ReturnType<typeof previews>) {
  const view = await preview({ ...specification, basis: action.basis });
  const claim = view.claims.find(c => basDeliverableTargetKey(c.target) === basDeliverableTargetKey(action.claim));
  if (!claim) throw new Error('Coverage claim is no longer included in this scope');
  const set = replayBasDrawingHistory(w.captures, w.drawing_events).source_sets.get(action.basis.source_set_id)!;
  if (!set.pages.some(p => p.capture_id === action.unit.capture_id && p.page_id === action.unit.page_id)) throw new Error('Coverage page is outside its source set');
  const source = sourceForBasScopeCoverage(w, action.unit);
  const items = new Map(view.inventory.items.map(i => [i.item_id, i])), dependencies = new Set(claim.dependency_item_ids);
  const mappings = action.mapped_item_ids.map(id => {
    const item = items.get(id);
    if (!item || !dependencies.has(id)) throw new Error('Coverage mapping is not an owned dependency of its included claim');
    return { item_id: id, content_fingerprint: item.content_fingerprint, kind: item.kind, label: item.label };
  });
  const fingerprint = await hash({ rule: BAS_SCOPE_REVIEW_RULE, source, claim: action.claim,
    dependency_fingerprint: claim.dependency_fingerprint, assessment: action.assessment,
    mappings: mappings.map(({ label: _label, ...m }) => m) });
  return { source, claim, mappings, fingerprint, interpretation: 'self_declared_applicability_not_automatic_interpretation' as const,
    source_availability: 'not_byte_verified' as const, calculation_verification: 'saved_results_not_python_replayed' as const, approved: false as const };
}

export async function applyBasScopeReview(raw: unknown, rawRequest: unknown, origin: BasScopeReviewEvent['origin'], options: Options = {}) {
  options = { ...options };
  const request = basScopeReviewRequestSchema.parse(rawRequest), checkedOrigin = z.enum(['operator_input', 'agent_proposal']).parse(origin);
  options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); options.signal?.throwIfAborted();
  const journal = history(workflow), previous = workflow.scope_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _event, scope_id: _scope, rule_version: _rule, origin: oldOrigin, created_at: _time,
      reviewer_identity: _identity, approved: _approved, result_fingerprint: _result, ...oldRequest } = previous;
    if (oldOrigin !== checkedOrigin || !same(oldRequest, request)) throw new Error('BAS scope operation ID was reused for a different request');
    // Retry verifies the saved result too; it cannot bless a re-signed false digest.
    await replayEvent(workflow, previous, previews(workflow, options.signal));
    options.signal?.throwIfAborted(); return { workflow, event: previous };
  }
  if (request.expected_head !== journal.head) throw new Error('BAS scope history changed; reload before saving');
  const action = request.action, preview = previews(workflow, options.signal);
  let scope_id: string, result_fingerprint: string | null = null;
  if (action.kind === 'save_scope') {
    scope_id = action.specification.scope_id;
    if ((journal.scopes.get(scope_id)?.event_id ?? null) !== action.previous_scope_event_id) throw new Error('Scope predecessor changed; reload before saving');
    if (!same(currentSpec(workflow, action.specification).basis, action.specification.basis)) throw new Error('Scope inputs changed; refresh the preview before saving');
    result_fingerprint = await scopeFingerprint(await preview(action.specification));
  } else if (action.kind === 'record_coverage' || action.kind === 'withdraw_scope') {
    const scope = savedScope(workflow, action.scope_event_id); scope_id = scope.scope_id;
    if (journal.scopes.get(scope_id)?.event_id !== scope.event_id) throw new Error('Saved scope changed or was withdrawn');
    if (action.kind === 'record_coverage') {
      if (!same(currentSpec(workflow, scope.action.specification).basis, action.basis)) throw new Error('Coverage inputs changed; refresh before saving');
      result_fingerprint = (await coverageResult(workflow, action, scope.action.specification, preview)).fingerprint;
    }
  } else {
    const target = ownedEvent(workflow, action.coverage_event_id); scope_id = target.scope_id;
    if (target.action.kind !== 'record_coverage' || journal.coverage.get(basCoverageSlotKey(scope_id, target.action))?.event_id !== target.event_id)
      throw new Error('Coverage decision changed or was withdrawn');
  }
  options.signal?.throwIfAborted();
  const payload = { ...request, scope_id, rule_version: BAS_SCOPE_REVIEW_RULE, origin: checkedOrigin,
    created_at: options.createdAt ?? new Date().toISOString(), reviewer_identity: 'self_declared' as const, approved: false as const, result_fingerprint };
  const event = basScopeReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  options.signal?.throwIfAborted();
  const updated: BasWorkflow = { ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_scope_10'), scope_events: [...(workflow.scope_events ?? []), event] };
  assertVerifiedBasWorkflowReferences(updated);
  return { workflow: updated, event };
}

type ScopeReplay = { event: BasScopeReviewEvent; value: BasDeliverableScope | Awaited<ReturnType<typeof coverageResult>> };
async function replayEvent(w: BasWorkflow, event: BasScopeReviewEvent, preview: ReturnType<typeof previews>): Promise<ScopeReplay> {
  const a = event.action;
  if (a.kind === 'withdraw_scope') return replayEvent(w, ownedEvent(w, a.scope_event_id), preview);
  if (a.kind === 'withdraw_coverage') return replayEvent(w, ownedEvent(w, a.coverage_event_id), preview);
  const value = a.kind === 'save_scope' ? await preview(a.specification)
    : await coverageResult(w, a, savedScope(w, a.scope_event_id).action.specification, preview);
  const fingerprint = a.kind === 'save_scope' ? await scopeFingerprint(value as BasDeliverableScope) : (value as Awaited<ReturnType<typeof coverageResult>>).fingerprint;
  if (fingerprint !== event.result_fingerprint) throw new Error('Saved scope/coverage does not replay against its exact retained inputs');
  return { event, value };
}

export async function inspectBasScopeHistory(raw: unknown) {
  const workflow = await verifyBasWorkflow(raw), journal = history(workflow);
  return { head: journal.head, history: workflow.scope_events ?? [],
    scopes: [...journal.scopes.values()].map(e => ({ scope_id: e.scope_id, event_id: e.event_id,
      state: e.action.kind === 'save_scope' ? 'saved_not_approved' as const : 'withdrawn' as const })),
    replay_verification: 'lineage_only' as const, approved: false as const };
}

/** Shared readiness input, with one verified workflow and operation-local
 * projection cache. Not approval, byte verification or arithmetic replay.
 * Every retained decision used below is semantically replayed; lineage alone
 * cannot establish its result. Never accept caller-supplied coverage arrays. */
export async function prepareBasScopeReadiness(raw: unknown, eventId: string, signal?: AbortSignal) {
  sha.parse(eventId); signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw), journal = history(workflow);
  const scope = savedScope(workflow, eventId), preview = previews(workflow, signal);
  if (journal.scopes.get(scope.scope_id)?.event_id !== scope.event_id)
    throw new Error('Readiness requires the current saved scope, not a superseded or withdrawn scope');
  const original = (await replayEvent(workflow, scope, preview)).value as BasDeliverableScope;
  const current = await preview(currentSpec(workflow, scope.action.specification));
  const coverage = [];
  for (const event of journal.coverage.values()) {
    signal?.throwIfAborted();
    if (event.scope_id !== scope.scope_id || event.action.kind !== 'record_coverage') continue;
    const action = event.action;
    await replayEvent(workflow, event, preview);
    let state: 'current_dependencies' | 'changed_dependencies' | 'unavailable_current_inputs' = 'unavailable_current_inputs';
    let current_error: string | null = null;
    try {
      const value = await coverageResult(workflow, { ...action, basis: current.specification.basis }, current.specification, preview);
      state = value.fingerprint === event.result_fingerprint ? 'current_dependencies' : 'changed_dependencies';
    } catch (error) {
      signal?.throwIfAborted(); current_error = error instanceof Error ? error.message : 'Current coverage replay failed';
    }
    coverage.push({ event, state, current_error });
  }
  signal?.throwIfAborted();
  return { workflow, scope, original, current, coverage };
}

/** Replay a single retained decision, then compare relevant current inputs.
 * Current unavailability is disclosed; corruption of the saved replay throws. */
export async function readBasScopeDecision(raw: unknown, eventId: string, options: Options = {}) {
  options = { ...options }; sha.parse(eventId); options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw), event = ownedEvent(workflow, eventId), journal = history(workflow);
  const preview = previews(workflow, options.signal), original = await replayEvent(workflow, event, preview);
  const latestScope = journal.scopes.get(event.scope_id)!, scope = latestScope.action.kind === 'save_scope' ? latestScope as SavedScope : null;
  let current: Awaited<ReturnType<typeof replayEvent>>['value'] | null = null, current_error: string | null = null;
  let state: 'current_dependencies' | 'changed_dependencies' | 'unavailable_current_inputs' | 'scope_withdrawn' = scope ? 'unavailable_current_inputs' : 'scope_withdrawn';
  if (scope) try {
    const specification = currentSpec(workflow, scope.action.specification);
    if (original.event.action.kind === 'save_scope') {
      current = await preview(specification);
      state = await scopeFingerprint(current) === original.event.result_fingerprint ? 'current_dependencies' : 'changed_dependencies';
    } else if (original.event.action.kind === 'record_coverage') {
      current = await coverageResult(workflow, { ...original.event.action, basis: specification.basis }, specification, preview);
      state = current.fingerprint === original.event.result_fingerprint ? 'current_dependencies' : 'changed_dependencies';
    }
  } catch (error) { options.signal?.throwIfAborted(); current_error = error instanceof Error ? error.message : 'Current scope replay failed'; }
  options.signal?.throwIfAborted();
  const coverageEvent = original.event.action.kind === 'record_coverage' ? original.event as Coverage : null;
  const slot = coverageEvent ? journal.coverage.get(basCoverageSlotKey(event.scope_id, coverageEvent.action)) : null;
  const decision_state = event.action.kind.startsWith('withdraw_') || slot?.action.kind === 'withdraw_coverage' ? 'withdrawn'
    : coverageEvent && slot?.event_id !== coverageEvent.event_id ? 'superseded' : !coverageEvent && latestScope.event_id !== original.event.event_id ? 'superseded' : 'latest';
  // Overlapping source units with different assessments are not last-write-wins.
  // These are potential conflicts requiring their own replay before adjudication.
  const conflicts = coverageEvent ? [...journal.coverage.values()].filter((e): e is Coverage => e.action.kind === 'record_coverage')
    .filter(e => e.scope_id === event.scope_id && e.event_id !== coverageEvent.event_id
      && basDeliverableTargetKey(e.action.claim) === basDeliverableTargetKey(coverageEvent.action.claim)
      && e.action.unit.page_id === coverageEvent.action.unit.page_id && e.action.assessment !== coverageEvent.action.assessment
      && (e.action.unit.span_ids === null || coverageEvent.action.unit.span_ids === null
        || e.action.unit.span_ids.some(id => coverageEvent.action.unit.span_ids!.includes(id)))).map(e => e.event_id) : [];
  return { event, original, current, state, decision_state, current_error, potential_conflict_event_ids: conflicts,
    replay_verification: 'shared_scope_projection_replayed' as const, reviewer_identity: 'self_declared' as const,
    acceptance: original.event.origin === 'operator_input' ? 'self_declared_human_review' as const : 'agent_proposal' as const,
    approved: false as const, project_complete: false as const };
}
