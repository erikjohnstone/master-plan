/** Shared historical input/receipt identity; never a browser calculator. */
import { z } from 'zod';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { buildBasAssignmentDemandInput, type BasAssignmentDemandInput, type BasAssignmentDemandResult } from './basAssignmentDemandContract.ts';
import { buildBasAssemblyQuantityInput, type BasAssemblyQuantityInput, type BasAssemblyQuantityResult } from './basAssemblyQuantityContract.ts';
import type { BasEngineeringResult } from './basEngineeringContract.ts';

export const BAS_WORKFLOW_REPLAY_RULE = 'saved_bas_calculations_1' as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/), ids = z.array(sha).max(10000);
export const basWorkflowReplayReceiptSchema = z.object({ schema_version: z.literal('bas_workflow_replay_v1'),
  rule_version: z.literal(BAS_WORKFLOW_REPLAY_RULE), workflow_sha256: sha,
  calculation_verification: z.enum(['verified_shared_python_replay', 'no_saved_calculations']),
  checked_records: z.object({ assignment: ids, assembly: ids, engineering: ids }).strict(),
  project_complete: z.literal(false),
}).strict();
export type BasWorkflowReplayReceipt = z.infer<typeof basWorkflowReplayReceiptSchema>;
export type BasReplayRecord = { record_id: string } & (
  { kind: 'assignment'; input: BasAssignmentDemandInput; result: BasAssignmentDemandResult }
  | { kind: 'assembly'; input: BasAssemblyQuantityInput; result: BasAssemblyQuantityResult }
  | { kind: 'engineering'; result: BasEngineeringResult });

export async function prepareBasWorkflowReplay(raw: unknown, guard: () => void = () => {}) {
  guard(); const workflow = await verifyBasWorkflow(raw); guard();
  const workflow_sha256 = await sha256Hex(new TextEncoder().encode(canonicalBasJson(workflow))); guard();
  const checked_records = { assignment: (workflow.assignment_calculations || []).map(c => c.calculation_id),
    assembly: (workflow.assembly_calculations || []).map(c => c.calculation_id),
    engineering: (workflow.engineering_events || []).map(e => e.event_id) };
  return { workflow_sha256, checked_records: structuredClone(checked_records),
    async *records(): AsyncGenerator<BasReplayRecord> {
      for (const calculation of workflow.assignment_calculations || []) {
        guard(); const event = workflow.equipment_events!.find(e => e.event_id === calculation.result.equipment_head)!;
        const capture = workflow.captures.find(c => c.capture_id === event.capture_id)!;
        const input = await buildBasAssignmentDemandInput(capture, event.register, event.event_id); guard();
        yield structuredClone({ kind: 'assignment' as const, record_id: calculation.calculation_id, input, result: calculation.result });
      }
      for (const calculation of workflow.assembly_calculations || []) {
        guard(); const event = workflow.assembly_events!.find(e => e.event_id === calculation.result.assembly_head)!;
        const equipment = workflow.equipment_events!.find(e => e.event_id === event.expected_equipment_head)!;
        const capture = workflow.captures.find(c => c.capture_id === event.capture_id)!;
        const input = await buildBasAssemblyQuantityInput(capture, equipment.register, equipment.event_id, event.register, event.event_id); guard();
        yield structuredClone({ kind: 'assembly' as const, record_id: calculation.calculation_id, input, result: calculation.result });
      }
      for (const event of workflow.engineering_events || []) {
        guard(); yield structuredClone({ kind: 'engineering' as const, record_id: event.event_id, result: event.result });
      }
      guard();
    },
  };
}

export async function assertBasWorkflowReplayReceipt(rawWorkflow: unknown, rawReceipt: unknown, guard: () => void = () => {}) {
  const plan = await prepareBasWorkflowReplay(rawWorkflow, guard), receipt = basWorkflowReplayReceiptSchema.parse(rawReceipt);
  const hasResults = Object.values(plan.checked_records).some(records => records.length);
  if (receipt.workflow_sha256 !== plan.workflow_sha256 || canonicalBasJson(receipt.checked_records) !== canonicalBasJson(plan.checked_records)
    || receipt.calculation_verification !== (hasResults ? 'verified_shared_python_replay' : 'no_saved_calculations')) {
    throw new Error('BAS replay receipt does not cover the exact saved workflow and all calculation records');
  }
  return receipt;
}
