/** Browser-only adoption guard. The shared service owns all decision semantics. */
import { applyBasIssueReview } from '../lib/basIssueReview.ts';
import type { BasWorkflow } from '../lib/basWorkflow.ts';
import type { BasProjectReview } from '../lib/basProjectReview.ts';
import type { BasIssueDecisionView } from '../lib/basIssueReview.ts';
/** Button/form availability only; the shared service still validates the write. */
export function currentBasIssueActionContext(review: Pick<BasProjectReview, 'capture_id' | 'source_status'>,
  decision?: (Pick<BasIssueDecisionView, 'capture_status'> & { decision: { capture_id: string } }) | null) {
  return review.source_status === 'active_capture' && (!decision || (decision.capture_status === 'active_capture'
    && decision.decision.capture_id === review.capture_id));
}
type Context = { workflow: BasWorkflow | null; epoch: number; signature: unknown; adapter: unknown };
export async function recordBasIssueFromUi(context: () => Context, adopt: (workflow: BasWorkflow) => void,
  request: unknown, options: { signal?: AbortSignal } = {}) {
  options = { ...options };
  const before = { ...context() }, json = JSON.stringify(before.workflow);
  const guard = () => {
    options.signal?.throwIfAborted(); const current = context();
    if (current.workflow !== before.workflow || current.epoch !== before.epoch || current.signature !== before.signature
      || current.adapter !== before.adapter || JSON.stringify(current.workflow) !== json)
      throw new Error('The BAS workspace, original PDFs or storage changed. No stale issue decision was accepted.');
  };
  guard(); const result = await applyBasIssueReview(before.workflow, request, 'operator_input', { signal: options.signal });
  guard(); adopt(result.workflow); return result;
}
