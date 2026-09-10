/** One verified source/history/Python calculation service for both surfaces. */
import { verifyBasWorkflow, activeBasCapture, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { basEquipmentHead, basEquipmentRegister } from '../../web/src/lib/basEquipmentReview.ts';
import { basAssemblyHead } from '../../web/src/lib/basAssemblyReview.ts';
import { basAssemblyQuantityRequestSchema, buildBasAssemblyQuantityInput, basAssemblyQuantityInputFingerprint,
  verifyBasAssemblyQuantityResult, basAssemblyCalculationSchema, basAssemblyCalculationFingerprint,
  assertBasAssemblyCalculationUpdate } from '../../web/src/lib/basAssemblyQuantityContract.ts';
import { runBasAssemblyQuantities } from './basMath.ts';

export async function calculateBasAssemblies(rawWorkflow: unknown, rawRequest: unknown,
  options: { python?: string; timeoutMs?: number; createdAt?: string; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(rawWorkflow), request = basAssemblyQuantityRequestSchema.parse(rawRequest);
  const capture = activeBasCapture(workflow);
  const assembly = workflow.assembly_events?.find(e => e.event_id === request.expected_assembly_head && e.capture_id === request.capture_id);
  if (capture?.capture_id !== request.capture_id || basEquipmentHead(workflow, request.capture_id) !== request.expected_equipment_head
    || basAssemblyHead(workflow, request.capture_id) !== request.expected_assembly_head || assembly?.expected_equipment_head !== request.expected_equipment_head) {
    throw new Error('BAS sources, equipment or assembly decisions changed. Review current applicability before calculating.');
  }
  const input = await buildBasAssemblyQuantityInput(capture, basEquipmentRegister(workflow, capture.capture_id), request.expected_equipment_head,
    assembly.register, assembly.event_id);
  const input_fingerprint = await basAssemblyQuantityInputFingerprint(input);
  const existing = workflow.assembly_calculations?.find(c => c.input_fingerprint === input_fingerprint);
  options.signal?.throwIfAborted();
  if (existing) {
    assertBasAssemblyCalculationUpdate(workflow, workflow, existing, request);
    return { workflow, calculation: existing };
  }
  const result = verifyBasAssemblyQuantityResult(input, await runBasAssemblyQuantities(input, options));
  const payload = { input_fingerprint, result, created_at: options.createdAt ?? new Date().toISOString() };
  const calculation = basAssemblyCalculationSchema.parse({ ...payload, calculation_id: await basAssemblyCalculationFingerprint(payload) });
  const updated = basWorkflowSchema.parse({ ...workflow, assembly_calculations: [...(workflow.assembly_calculations ?? []), calculation] });
  assertBasAssemblyCalculationUpdate(workflow, updated, calculation, request);
  // Caller still compares its workspace identity after this await. No mutation.
  return { workflow: updated, calculation };
}
