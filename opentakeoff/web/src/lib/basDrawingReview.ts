/** Shared append service; source sets do not approve or change active takeoffs. */
import { basWorkflowSchema, basEventFingerprint, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { BAS_DRAWING_RULE, basDrawingRequestSchema, basDrawingActionSchema, basDrawingEventSchema, type BasDrawingEvent, type BasDrawingRequest } from './basDrawingContract.ts';
import { basDrawingDependencyFingerprint, replayBasDrawingHistory } from './basDrawingRevision.ts';

export async function applyBasDrawingReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasDrawingEvent['origin'], createdAt = new Date().toISOString()): Promise<BasWorkflow> {
  // Own the request before the first await, just as the workflow verifier owns
  // the retained input. Later form edits cannot alter this pending operation.
  const request = basDrawingRequestSchema.parse(rawRequest), workflow = await verifyBasWorkflow(rawWorkflow);
  return append(workflow, request, origin, createdAt);
}

async function append(workflow: BasWorkflow, request: BasDrawingRequest, origin: BasDrawingEvent['origin'], createdAt: string): Promise<BasWorkflow> {
  const previous = workflow.drawing_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _rule, created_at: _time, origin: oldOrigin, ...oldRequest } = previous;
    if (oldOrigin !== origin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('Drawing operation ID was reused for a different request');
    return workflow;
  }
  if ((workflow.drawing_events?.at(-1)?.event_id ?? null) !== request.expected_head) throw new Error('Drawing review changed since this edit began. Reload the current accounting.');
  if (await basDrawingDependencyFingerprint(request.action) !== request.expected_dependencies) throw new Error('Drawing review dependencies changed; review the exact source selection again');
  const payload = { ...request, rule_version: BAS_DRAWING_RULE, origin, created_at: createdAt };
  const event = basDrawingEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  // No active-capture gate: revisions intentionally use multiple retained versions,
  // including a restored workflow with no open drawing tabs. Transport still CASes
  // the complete workflow before adoption after this asynchronous verification.
  return basWorkflowSchema.parse({ ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_review_7'),
    drawing_events: [...(workflow.drawing_events ?? []), event] });
}

/** Validate the exact accounting with the same append gate without saving an
 * event or returning its provisional identity as an established source set. */
export async function prepareBasDrawingAction(rawWorkflow: unknown, rawAction: unknown) {
  const action = basDrawingActionSchema.parse(rawAction), workflow = await verifyBasWorkflow(rawWorkflow);
  const expected_head = workflow.drawing_events?.at(-1)?.event_id ?? null;
  const expected_dependencies = await basDrawingDependencyFingerprint(action);
  const trial = await append(workflow, { operation_id: crypto.randomUUID(), expected_head, expected_dependencies,
    action, reviewer: 'Unrecorded preview', reason: 'Validate page accounting only; this event is not saved.' }, 'operator_input', new Date().toISOString());
  const event = trial.drawing_events!.at(-1)!, replay = replayBasDrawingHistory(trial.captures, trial.drawing_events);
  const set = replay.source_sets.get(event.event_id), revision = replay.revisions.find(r => r.event_id === event.event_id);
  return { expected_head, expected_dependencies, accounting_status: set ? 'complete' as const : 'unresolved' as const,
    source_page_count: set?.pages.length ?? null, unresolved_pages: revision?.unresolved_pages ?? 0,
    recorded: false as const, approved: false as const, quantity_changes: 'not_assessed' as const };
}
