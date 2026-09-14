import { basEventFingerprint, basWorkflowSchema, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { BAS_SEQUENCE_AI_REVIEW_RULE, basSequenceAiReviewRequestSchema,
  type BasSequenceAiReviewEvent } from './basSequenceAiReviewContract.ts';

export function basSequenceAiReviewHead(workflow: BasWorkflow | null | undefined, captureId: string, runId: string) {
  return (workflow?.sequence_ai_reviews ?? []).filter(event => event.capture_id === captureId && event.run_id === runId).at(-1)?.event_id ?? null;
}

export function basSequenceAiReviewDecisions(workflow: BasWorkflow | null | undefined, captureId: string, runId: string) {
  const decisions = new Map<string, BasSequenceAiReviewEvent>();
  for (const event of workflow?.sequence_ai_reviews ?? []) {
    if (event.capture_id === captureId && event.run_id === runId) decisions.set(event.interpretation_id, event);
  }
  return decisions;
}

/** Record an estimator's review of one source-validated interpretation.
 * Confirmation is not approval of quantities, field wiring, or the takeoff. */
export async function applyBasSequenceAiReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasSequenceAiReviewEvent['origin'] = 'operator_input'): Promise<BasWorkflow> {
  const workflow = await verifyBasWorkflow(rawWorkflow), request = basSequenceAiReviewRequestSchema.parse(rawRequest);
  const record = workflow.sequence_ai_runs?.find(value => value.capture_id === request.capture_id && value.run.run_id === request.run_id);
  if (!record?.run.interpretations.some(value => value.interpretation_id === request.interpretation_id)) {
    throw new Error('SOO AI review target is not owned by the retained run');
  }
  const head = basSequenceAiReviewHead(workflow, request.capture_id, request.run_id);
  if (request.expected_head !== head) throw new Error('SOO AI review changed; reload the current interpretation before recording this decision');
  const payload = { ...request, created_at: new Date().toISOString(), origin,
    approved: false as const, rule_version: BAS_SEQUENCE_AI_REVIEW_RULE };
  const event = { ...payload, event_id: await basEventFingerprint(payload) };
  const updated = basWorkflowSchema.parse({ ...workflow,
    revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_sequence_ai_11'),
    sequence_ai_reviews: [...(workflow.sequence_ai_reviews ?? []), event] });
  return verifyBasWorkflow(updated);
}

