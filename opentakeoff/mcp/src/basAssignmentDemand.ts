/** One source-verified calculation/persistence service for UI and MCP. */
import { verifyBasWorkflow, activeBasCapture, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { basEquipmentHead, basEquipmentRegister } from '../../web/src/lib/basEquipmentReview.ts';
import { basAssignmentDemandRequestSchema, buildBasAssignmentDemandInput, basAssignmentInputFingerprint,
  verifyBasAssignmentDemandResult, basAssignmentCalculationSchema, basAssignmentCalculationFingerprint,
  assertBasAssignmentUpdate,
} from '../../web/src/lib/basAssignmentDemandContract.ts';
import { runBasAssignmentDemand } from './basMath.ts';
import { atLeastBasWorkflowRevision } from '../../web/src/lib/basWorkflowRevision.ts';

export async function calculateBasAssignments(rawWorkflow: unknown, rawRequest: unknown,
  options: { python?: string; timeoutMs?: number; createdAt?: string; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(rawWorkflow), request = basAssignmentDemandRequestSchema.parse(rawRequest);
  const capture = activeBasCapture(workflow);
  if (capture?.capture_id !== request.capture_id || basEquipmentHead(workflow, request.capture_id) !== request.expected_equipment_head) {
    throw new Error('BAS evidence or equipment decisions changed. Review the current assignments before calculating.');
  }
  const input = await buildBasAssignmentDemandInput(capture, basEquipmentRegister(workflow, capture.capture_id), request.expected_equipment_head);
  const input_fingerprint = await basAssignmentInputFingerprint(input);
  const existing = workflow.assignment_calculations?.find(c => c.input_fingerprint === input_fingerprint);
  options.signal?.throwIfAborted();
  if (existing) {
    assertBasAssignmentUpdate(workflow, workflow, existing, request);
    return { workflow, calculation: existing };
  }
  const result = verifyBasAssignmentDemandResult(input, await runBasAssignmentDemand(input, options));
  const payload = { input_fingerprint, result, created_at: options.createdAt ?? new Date().toISOString() };
  const calculation = basAssignmentCalculationSchema.parse({ ...payload, calculation_id: await basAssignmentCalculationFingerprint(payload) });
  const updated = basWorkflowSchema.parse({ ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_assignment_4'),
    assignment_calculations: [...(workflow.assignment_calculations ?? []), calculation] });
  assertBasAssignmentUpdate(workflow, updated, calculation, request);
  // The entry point must still compare current workspace identity after this
  // await before committing: this function never mutates caller-owned state.
  return { workflow: updated, calculation };
}
