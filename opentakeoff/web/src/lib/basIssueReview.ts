/** Shared issue actions and historical finding replay. No waiver, approval,
 * extraction, PDF-byte verification or independent engineering arithmetic. */
import { z } from 'zod';
import { verifyBasWorkflow, assertVerifiedBasWorkflowReferences, basEventFingerprint, type BasWorkflow } from './basWorkflow.ts';
import { basProjectReviewSchema, projectReviewForVerifiedBasWorkflow, type BasProjectReview } from './basProjectReview.ts';
import { basIssueReviewRequestSchema, basIssueReviewEventSchema, basIssueBasisSchema, BAS_ISSUE_REVIEW_RULE,
  BAS_ISSUE_EVENT_HEADS, BAS_ISSUE_CALCULATION_HEADS, type BasIssueReviewEvent, type BasIssueBasis } from './basIssueReviewContract.ts';
import { basIssueOwnerKey } from './basIssueReviewHistory.ts';
import { currentBasIssueBasis, selectBasIssueWorkflow } from './basIssueBasis.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { canonicalBasJson } from './basCanonical.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/), issueSchema = basProjectReviewSchema.shape.issues.element;
const findingState = z.enum(['same_occurrence', 'changed_occurrence', 'not_reported']);
const decisionState = z.enum(['acknowledged_current_occurrence', 'correction_started_current_occurrence', 'changed_occurrence',
  'not_reported_needs_review', 'recorded_absence_not_replayed', 'reopened', 'withdrawn']);
export const basIssueWorkspaceSchema = z.object({ schema_version: z.literal('bas_issue_workspace_v1'),
  head: sha.nullable(), basis: basIssueBasisSchema, project_review: basProjectReviewSchema,
  history: z.array(basIssueReviewEventSchema).max(10000), history_verification: z.literal('lineage_only'),
  decisions: z.array(z.object({ issue_key: sha, occurrence_id: sha, event_id: sha, state: decisionState }).strict()).max(10000),
  approved: z.literal(false),
}).strict();
const workspaceMetadataSchema = basIssueWorkspaceSchema.omit({ project_review: true });
const changedRecord = z.object({ selector: z.enum(['sequence_head', 'equipment_head', 'assembly_head', 'engineering_head',
  'assignment_calculation_id', 'assembly_calculation_id']), before: sha.nullable(), after: sha.nullable() }).strict();
export const basIssueDecisionViewSchema = z.object({ schema_version: z.literal('bas_issue_decision_view_v1'),
  decision: basIssueReviewEventSchema, observation: basIssueReviewEventSchema, original_finding: issueSchema,
  current_findings: z.array(issueSchema).max(100000), current_state: findingState, current_basis: basIssueBasisSchema,
  capture_status: z.enum(['active_capture', 'historical_capture']),
  is_latest_decision: z.boolean(), finding_verification: z.literal('shared_projection_replayed'),
  reviewed_change: z.object({ decision_id: sha, basis: basIssueBasisSchema, changed_records: z.array(changedRecord).min(1).max(6) }).strict().nullable(),
  source_availability: z.literal('not_byte_verified'), calculation_verification: z.literal('saved_results_not_python_replayed'),
  approved: z.literal(false), project_complete: z.literal(false),
}).strict();
export type BasIssueDecisionView = z.infer<typeof basIssueDecisionViewSchema>;
type Options = { signal?: AbortSignal; createdAt?: string };

export const basIssueHead = (workflow: BasWorkflow, captureId: string) =>
  workflow.issue_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null;
const latestByIssue = (workflow: BasWorkflow) => new Map((workflow.issue_events ?? []).map(e => [basIssueOwnerKey(e.capture_id, e.issue_key), e]));
function ownedEvent(workflow: BasWorkflow, id: string, captureId?: string) {
  const found = workflow.issue_events?.find(e => e.event_id === id && (!captureId || e.capture_id === captureId));
  if (!found) throw new Error('Issue decision is not owned by the retained capture');
  return found;
}
const hasFinding = (view: BasProjectReview, event: Pick<BasIssueReviewEvent, 'issue_key' | 'occurrence_id'>) =>
  view.issues.find(i => i.issue_key === event.issue_key && i.occurrence_id === event.occurrence_id);
function recordChanges(before: BasIssueBasis, after: BasIssueBasis) {
  const fields = [...Object.keys(BAS_ISSUE_EVENT_HEADS), ...Object.keys(BAS_ISSUE_CALCULATION_HEADS)] as Array<Exclude<keyof BasIssueBasis, 'finding_rule'>>;
  return fields.filter(key => before[key] !== after[key]).map(selector => ({ selector, before: before[selector], after: after[selector] }));
}

/** One verified owner and an operation-local cache, never a cross-request cache. */
function projections(workflow: BasWorkflow, captureId: string, signal?: AbortSignal) {
  const cache = new Map<string, Promise<BasProjectReview>>();
  return async (basis: BasIssueBasis) => {
    signal?.throwIfAborted();
    const key = canonicalBasJson(basis);
    if (!cache.has(key)) cache.set(key, projectReviewForVerifiedBasWorkflow(selectBasIssueWorkflow(workflow, captureId, basis), captureId));
    const view = await cache.get(key)!; signal?.throwIfAborted(); return view;
  };
}

/** Reconstruct the original observation and any claimed absence at its own
 * selected inputs. Structural/hash validation alone is not proof of either. */
async function replayDecision(workflow: BasWorkflow, decision: BasIssueReviewEvent,
  project: ReturnType<typeof projections>) {
  let reviewed = decision;
  if (reviewed.action.kind === 'withdraw') reviewed = ownedEvent(workflow, reviewed.action.decision_id, decision.capture_id);
  const confirmation = reviewed.action.kind === 'record_not_reported' ? reviewed : null;
  const observation = reviewed.action.kind === 'record_not_reported'
    ? ownedEvent(workflow, reviewed.action.observation_id, decision.capture_id) : reviewed;
  if (!['acknowledge', 'begin_correction'].includes(observation.action.kind)) throw new Error('Issue history has no original observation');
  const original = hasFinding(await project(observation.expected_basis), observation);
  if (!original) throw new Error('Saved issue occurrence does not replay against its retained inputs');
  let reviewed_change: BasIssueDecisionView['reviewed_change'] = null;
  if (confirmation) {
    const changed_records = recordChanges(observation.expected_basis, confirmation.expected_basis);
    if (!changed_records.length || (await project(confirmation.expected_basis)).issues.some(i => i.issue_key === observation.issue_key))
      throw new Error('Saved absence confirmation does not replay; the finding is still reported');
    reviewed_change = { decision_id: confirmation.event_id, basis: confirmation.expected_basis, changed_records };
  }
  return { observation, original, reviewed_change };
}

export async function inspectBasIssueReview(raw: unknown, captureId: string, options: Options = {}) {
  options = { ...options };
  sha.parse(captureId); options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); options.signal?.throwIfAborted();
  const basis = currentBasIssueBasis(workflow, captureId), project_review = await projectReviewForVerifiedBasWorkflow(workflow, captureId);
  options.signal?.throwIfAborted();
  const findings = new Map<string, BasProjectReview['issues']>();
  for (const issue of project_review.issues) { const group = findings.get(issue.issue_key) ?? []; group.push(issue); findings.set(issue.issue_key, group); }
  const history = workflow.issue_events?.filter(e => e.capture_id === captureId) ?? [];
  const latest = new Map(history.map(e => [e.issue_key, e]));
  const decisions = [...latest.values()].map(e => {
    const current = findings.get(e.issue_key) ?? [], same = current.some(i => i.occurrence_id === e.occurrence_id);
    const state = e.action.kind === 'withdraw' ? 'withdrawn' : e.action.kind === 'record_not_reported'
      ? current.length ? 'reopened' : 'recorded_absence_not_replayed'
      : !current.length ? 'not_reported_needs_review' : !same ? 'changed_occurrence'
      : e.action.kind === 'acknowledge' ? 'acknowledged_current_occurrence' : 'correction_started_current_occurrence';
    return { issue_key: e.issue_key, occurrence_id: e.occurrence_id, event_id: e.event_id, state };
  });
  // The shared projection already schema-validates and owns its result. Do not
  // duplicate all original evidence while validating only the new metadata.
  return { ...workspaceMetadataSchema.parse({ schema_version: 'bas_issue_workspace_v1', head: basIssueHead(workflow, captureId),
    basis, history, decisions, history_verification: 'lineage_only', approved: false }), project_review };
}

export async function readBasIssueDecision(raw: unknown, eventId: string, options: Options = {}): Promise<BasIssueDecisionView> {
  options = { ...options };
  sha.parse(eventId); options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); options.signal?.throwIfAborted();
  const decision = ownedEvent(workflow, eventId), project = projections(workflow, decision.capture_id, options.signal);
  const replay = await replayDecision(workflow, decision, project);
  const current_basis = currentBasIssueBasis(workflow, decision.capture_id);
  const current = await project(current_basis), current_findings = current.issues.filter(i => i.issue_key === decision.issue_key);
  const current_state = current_findings.some(i => i.occurrence_id === decision.occurrence_id) ? 'same_occurrence'
    : current_findings.length ? 'changed_occurrence' : 'not_reported';
  options.signal?.throwIfAborted();
  return basIssueDecisionViewSchema.parse({ schema_version: 'bas_issue_decision_view_v1', decision, observation: replay.observation,
    original_finding: replay.original, current_findings, current_state, current_basis,
    capture_status: workflow.current_capture_id === decision.capture_id ? 'active_capture' : 'historical_capture',
    is_latest_decision: latestByIssue(workflow).get(basIssueOwnerKey(decision.capture_id, decision.issue_key))?.event_id === eventId,
    finding_verification: 'shared_projection_replayed', reviewed_change: replay.reviewed_change,
    source_availability: 'not_byte_verified', calculation_verification: 'saved_results_not_python_replayed', approved: false, project_complete: false });
}

export async function applyBasIssueReview(raw: unknown, rawRequest: unknown, origin: BasIssueReviewEvent['origin'], options: Options = {}) {
  options = { ...options };
  // Own request fields before the first await; origin is assigned by the surface.
  const request = basIssueReviewRequestSchema.parse(rawRequest), checkedOrigin = basIssueReviewEventSchema.shape.origin.parse(origin);
  options.signal?.throwIfAborted();
  // The common verifier owns nested passthrough metadata before its first await.
  const workflow = await verifyBasWorkflow(raw); options.signal?.throwIfAborted();
  const previous = workflow.issue_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _rule, created_at: _time, origin: oldOrigin, reviewer_identity: _identity,
      approved: _approved, issue_key: _issue, occurrence_id: _occurrence, ...oldRequest } = previous;
    if (oldOrigin !== checkedOrigin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('BAS issue operation ID was reused for a different request');
    return { workflow, event: previous };
  }
  if (workflow.current_capture_id !== request.capture_id) throw new Error('The active BAS capture changed; review the current findings');
  if (basIssueHead(workflow, request.capture_id) !== request.expected_head) throw new Error('BAS issue history changed; reload before saving');
  const currentBasis = currentBasIssueBasis(workflow, request.capture_id);
  if (canonicalBasJson(currentBasis) !== canonicalBasJson(request.expected_basis)) throw new Error('BAS finding inputs changed; reload before saving');
  const project = projections(workflow, request.capture_id, options.signal), action = request.action;
  let issue_key: string, occurrence_id: string;
  if (action.kind === 'acknowledge' || action.kind === 'begin_correction') {
    const found = hasFinding(await project(currentBasis), action);
    if (!found) throw new Error('The selected finding occurrence is not currently reported');
    issue_key = found.issue_key; occurrence_id = found.occurrence_id;
  } else {
    const target = ownedEvent(workflow, action.kind === 'withdraw' ? action.decision_id : action.observation_id, request.capture_id);
    if (target.action.kind === 'withdraw' || latestByIssue(workflow).get(basIssueOwnerKey(target.capture_id, target.issue_key))?.event_id !== target.event_id)
      throw new Error('Issue action must reference the current owned decision');
    if (action.kind === 'record_not_reported') {
      if (!['acknowledge', 'begin_correction'].includes(target.action.kind)) throw new Error('Absence review requires an original issue observation');
      await replayDecision(workflow, target, project);
      if (!recordChanges(target.expected_basis, currentBasis).length) throw new Error('Absence review requires changed retained inputs');
      if ((await project(currentBasis)).issues.some(i => i.issue_key === target.issue_key)) throw new Error('The finding is still reported; acknowledgement cannot resolve it');
    }
    issue_key = target.issue_key; occurrence_id = target.occurrence_id;
  }
  options.signal?.throwIfAborted();
  const payload = { ...request, rule_version: BAS_ISSUE_REVIEW_RULE, origin: checkedOrigin, reviewer_identity: 'self_declared' as const,
    approved: false as const, created_at: options.createdAt ?? new Date().toISOString(), issue_key, occurrence_id };
  const event = basIssueReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  options.signal?.throwIfAborted();
  const updated: BasWorkflow = { ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_issues_9'),
    issue_events: [...(workflow.issue_events ?? []), event] };
  // Incoming fields/hash/domain truth were verified above; the new event was
  // validated and hashed here. Check every cross-domain reference and journal
  // bound again without duplicating untouched PDF/capture/calculation objects.
  assertVerifiedBasWorkflowReferences(updated);
  return { workflow: updated, event };
}
