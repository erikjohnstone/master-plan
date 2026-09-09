/** Shared association event service. No approvals, quantity inference or IO math. */
import { basEventFingerprint, basWorkflowSchema, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { basReviewEventSchema, basReviewRequestSchema, type BasReviewEvent } from './basReviewContract.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { interpretBasSequences, reconcileBasSequencePoints, type BasSequenceAssociation } from './basSequenceReconciliation.ts';

export function basReviewHead(workflow: BasWorkflow, captureId: string): string | null {
  return (workflow.review_events ?? []).filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null;
}

export function basActiveAssociations(workflow: BasWorkflow, captureId: string): BasSequenceAssociation[] {
  const associations = new Map<string, BasSequenceAssociation>();
  for (const event of workflow.review_events ?? []) {
    if (event.capture_id !== captureId) continue;
    const a = event.action;
    const key = JSON.stringify(a.kind === 'upsert' ? [a.association.region_id, a.association.matrix_id] : [a.region_id, a.matrix_id]);
    if (a.kind === 'upsert') associations.set(key, { ...a.association, review_origin: event.origin });
    else associations.delete(key);
  }
  return [...associations.values()];
}

/** Callers verify the immutable capture first. Only current, explicitly retained
 * rules are accepted by its schema; there is no silent old-rule upgrade. */
export async function basSequenceView(workflow: BasWorkflow, captureId: string) {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture?.narrative_sources) throw new Error('This older capture has no retained SOO text. Recompile the original PDFs.');
  return reconcileBasSequencePoints(capture.narrative_sources, capture.points, basActiveAssociations(workflow, captureId));
}

export function basSequenceCandidates(workflow: BasWorkflow, captureId: string) {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  return capture?.narrative_sources ? interpretBasSequences(capture.narrative_sources) : null;
}

export async function applyBasReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasReviewEvent['origin'], createdAt = new Date().toISOString()): Promise<BasWorkflow> {
  const workflow = await verifyBasWorkflow(rawWorkflow);
  const request = basReviewRequestSchema.parse(rawRequest);
  const previous = workflow.review_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _version, origin: oldOrigin, created_at: _time, ...oldRequest } = previous;
    if (oldOrigin !== origin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('BAS operation ID was reused for a different request');
    return workflow;
  }
  if (workflow.current_capture_id !== request.capture_id) throw new Error('The active BAS capture changed. Review the current evidence before applying this edit.');
  const capture = workflow.captures.find(c => c.capture_id === request.capture_id);
  if (!capture?.narrative_sources) throw new Error('This capture does not retain SOO sources. Recompile the original PDFs.');
  if (basReviewHead(workflow, request.capture_id) !== request.expected_head) throw new Error('BAS review changed since this edit began. Reload the current comparison.');
  const action = request.action;
  if (action.kind === 'upsert') {
    await reconcileBasSequencePoints(capture.narrative_sources, capture.points, [{ ...action.association, review_origin: origin }]);
  } else if (!basActiveAssociations(workflow, request.capture_id).some(a => a.region_id === action.region_id && a.matrix_id === action.matrix_id)) {
    throw new Error('The association to remove no longer exists');
  }
  const payload = { ...request, rule_version: 'bas_association_review_1' as const, origin, created_at: createdAt };
  const event = basReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  return basWorkflowSchema.parse({ ...workflow, revision: 'bas_evidence_2', review_events: [...(workflow.review_events ?? []), event] });
}
