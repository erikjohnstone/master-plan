/** One shared service dispatcher for the browser transport and MCP. */
import { basRevisionOperationSchema, basRevisionResponseSchema } from '../../web/src/lib/basRevisionOperations.ts';
import { buildBasRevisionInventory } from '../../web/src/lib/basRevisionInventory.ts';
import { prepareBasRevisionReview, recordBasRevisionReview, readBasRevisionReview } from './basRevisionReview.ts';

export async function runBasRevisionOperation(workflow: unknown, rawOperation: unknown, origin: 'operator_input' | 'agent_proposal',
  options: { signal?: AbortSignal; python?: string; timeoutMs?: number } = {}) {
  const operation = basRevisionOperationSchema.parse(rawOperation);
  options.signal?.throwIfAborted();
  let result;
  if (operation.kind === 'inventory') result = { kind: operation.kind, inventory: await buildBasRevisionInventory(structuredClone(workflow), operation.basis) };
  else if (operation.kind === 'compare') result = { kind: operation.kind, ...await prepareBasRevisionReview(workflow, operation.comparison, options) };
  else if (operation.kind === 'record') result = { kind: operation.kind, ...await recordBasRevisionReview(workflow, operation.review, origin, options) };
  else result = { kind: operation.kind, ...await readBasRevisionReview(workflow, operation.event_id, options) };
  options.signal?.throwIfAborted();
  return basRevisionResponseSchema.parse(result);
}
