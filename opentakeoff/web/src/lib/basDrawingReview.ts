/** Shared append service; source sets do not approve or change active takeoffs. */
import { basWorkflowSchema, basEventFingerprint, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { BAS_DRAWING_RULE, basDrawingRequestSchema, basDrawingEventSchema, type BasDrawingEvent } from './basDrawingContract.ts';
import { basDrawingDependencyFingerprint } from './basDrawingRevision.ts';

export async function applyBasDrawingReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasDrawingEvent['origin'], createdAt = new Date().toISOString()): Promise<BasWorkflow> {
  // Own the request before the first await, just as the workflow verifier owns
  // the retained input. Later form edits cannot alter this pending operation.
  const request = basDrawingRequestSchema.parse(rawRequest), workflow = await verifyBasWorkflow(rawWorkflow);
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
