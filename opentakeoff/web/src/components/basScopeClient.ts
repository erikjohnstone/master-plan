/** Browser-only adoption guard. Scope and coverage semantics remain shared. */
import { applyBasScopeReview } from '../lib/basScopeReview.ts';
import type { BasWorkflow } from '../lib/basWorkflow.ts';
type Context = { workflow: BasWorkflow | null; epoch: number; signature: unknown; adapter: unknown };
export async function recordBasScopeFromUi(context: () => Context, adopt: (workflow: BasWorkflow) => void,
  request: unknown, options: { signal?: AbortSignal } = {}) {
  options = { ...options };
  const before = { ...context() }, json = JSON.stringify(before.workflow);
  const guard = () => {
    options.signal?.throwIfAborted(); const current = context();
    if (current.workflow !== before.workflow || current.epoch !== before.epoch || current.signature !== before.signature
      || current.adapter !== before.adapter || JSON.stringify(current.workflow) !== json)
      throw new Error('The BAS workspace, original PDFs or storage changed. No stale scope decision was accepted.');
  };
  guard(); const result = await applyBasScopeReview(before.workflow, request, 'operator_input', { signal: options.signal });
  guard(); adopt(result.workflow); return result;
}
