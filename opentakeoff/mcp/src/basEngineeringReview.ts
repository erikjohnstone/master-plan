/** One source/history/Python service for UI and MCP. No public entry point until
 * its full equipment-detail workflow is integrated and verified. */
import { basWorkflowSchema, verifyBasWorkflow, basEventFingerprint } from '../../web/src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { atLeastBasWorkflowRevision } from '../../web/src/lib/basWorkflowRevision.ts';
import { basEngineeringReviewRequestSchema, basEngineeringReviewEventSchema, validateBasEngineeringRegister,
  type BasEngineeringReviewEvent } from '../../web/src/lib/basEngineeringRegister.ts';
import { basEngineeringHeads, basEngineeringView, assertBasEngineeringUpdate } from '../../web/src/lib/basEngineeringReview.ts';
export { assertBasEngineeringUpdate } from '../../web/src/lib/basEngineeringReview.ts';
import { replayBasEngineering, runBasEngineering } from './basMath.ts';

type Options = { python?: string; timeoutMs?: number; signal?: AbortSignal; createdAt?: string };
const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);

export async function verifyBasEngineeringHistory(rawWorkflow: unknown, options: Options = {}) {
  options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(rawWorkflow);
  const events = workflow.engineering_events ?? [];
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  // Bound both record count and encoded bytes per one-shot process. Whole
  // history may span batches; no partial verification result is returned.
  let batch: BasEngineeringReviewEvent['result'][] = [], bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Engineering history replay timed out; no history was accepted');
    await replayBasEngineering(batch, { ...options, timeoutMs: remaining });
    batch = []; bytes = 0;
  };
  for (const event of events) {
    options.signal?.throwIfAborted();
    const size = Buffer.byteLength(JSON.stringify(event.result));
    if (size > 30 * 1024 * 1024) throw new Error('One saved engineering result exceeds the replay size limit');
    if (batch.length === 1000 || bytes + size > 30 * 1024 * 1024) await flush();
    batch.push(event.result); bytes += size;
  }
  await flush();
  return workflow;
}

export async function inspectBasEngineering(rawWorkflow: unknown, captureId: string, options: Options = {}) {
  const workflow = await verifyBasEngineeringHistory(rawWorkflow, options);
  const view = await basEngineeringView(workflow, captureId);
  return { workflow, view: { ...view,
    calculation_verification: view.event ? 'verified_shared_python_replay' as const : 'not_calculated' as const } };
}

export async function applyBasEngineeringReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasEngineeringReviewEvent['origin'], options: Options = {}) {
  const workflow = await verifyBasEngineeringHistory(rawWorkflow, options);
  const request = basEngineeringReviewRequestSchema.parse(rawRequest);
  const previous = workflow.engineering_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, result: _result, rule_version: _version, created_at: _time, origin: oldOrigin, ...oldRequest } = previous;
    if (origin !== oldOrigin || !same(oldRequest, request)) throw new Error('BAS operation ID was reused for a different engineering request');
    return { workflow, event: previous };
  }
  if ([...(workflow.review_events ?? []), ...(workflow.equipment_events ?? []), ...(workflow.assembly_events ?? [])]
    .some(e => e.operation_id === request.operation_id)) throw new Error('BAS operation ID is already owned by another review');
  const heads = basEngineeringHeads(workflow, request.capture_id);
  if (workflow.current_capture_id !== request.capture_id || heads.engineering !== request.expected_head
    || heads.equipment !== request.expected_equipment_head || heads.assembly !== request.expected_assembly_head
    || heads.sequence !== request.expected_sequence_head) throw new Error('BAS engineering sources or decisions changed; review current dependencies');
  const capture = workflow.captures.find(c => c.capture_id === request.capture_id)!;
  const equipment = workflow.equipment_events!.find(e => e.event_id === heads.equipment)!;
  const assembly = workflow.assembly_events?.find(e => e.event_id === heads.assembly) ?? null;
  if (assembly && assembly.expected_equipment_head !== heads.equipment) throw new Error('Assembly applicability is stale; review it against current equipment');
  await validateBasEngineeringRegister(capture, equipment.register, assembly?.register ?? null, request.register);
  options.signal?.throwIfAborted();
  const result = await runBasEngineering(request.register.input, options);
  options.signal?.throwIfAborted();
  const payload = { ...request, result, rule_version: 'engineering_review_1' as const, origin,
    created_at: options.createdAt ?? new Date().toISOString() };
  const event = basEngineeringReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  const updated = basWorkflowSchema.parse({ ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_engineering_6'),
    engineering_events: [...(workflow.engineering_events ?? []), event] });
  // The Session/browser caller must still compare its workspace after awaiting.
  assertBasEngineeringUpdate(workflow, updated, event, request, origin);
  return { workflow: updated, event };
}
