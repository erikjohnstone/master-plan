/** Shared durable assignment service; both front ends use this exact path. */
import { basWorkflowSchema, basEventFingerprint, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { z } from 'zod';
import { basEquipmentRegisterSchema } from './basEquipmentRegister.ts';
import { basEquipmentReviewEventSchema, basEquipmentReviewRequestSchema, emptyBasEquipmentRegister,
  validateBasEquipmentRegister, type BasEquipmentReviewEvent } from './basEquipmentRegister.ts';

export function basEquipmentHead(workflow: BasWorkflow, captureId: string) {
  return workflow.equipment_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null;
}

export function basEquipmentRegister(workflow: BasWorkflow, captureId: string) {
  return workflow.equipment_events?.filter(e => e.capture_id === captureId).at(-1)?.register ?? emptyBasEquipmentRegister();
}

/** Shared dependency status; a saved calculation is not an approval. */
export function basAssignmentCalculationState(workflow: BasWorkflow, captureId: string) {
  const records = workflow.assignment_calculations?.filter(c => c.result.capture_id === captureId) ?? [];
  // Imported historical calculations may be appended after a current one.
  // Dependency identity, not incidental import order, decides freshness.
  const latest = records.filter(c => c.result.equipment_head === basEquipmentHead(workflow, captureId)).at(-1) ?? records.at(-1) ?? null;
  return { latest, status: !latest ? 'not_calculated' as const
    : latest.result.equipment_head === basEquipmentHead(workflow, captureId) ? 'current_dependencies' as const : 'stale_dependencies' as const };
}

export async function basEquipmentView(workflow: BasWorkflow, captureId: string) {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture?.equipment_sources || !capture.narrative_sources) throw new Error('Recompile the original PDFs to retain equipment evidence');
  return validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, basEquipmentRegister(workflow, captureId));
}

/** Compact public index supplies addressable source occurrence IDs. Full source
 * rows/cells stay once in the immutable capture instead of being copied here. */
const id = z.string().min(1).max(512), count = z.number().int().nonnegative().safe();
export const basEquipmentSummarySchema = z.object({
  schema_version: z.literal('bas_equipment_summary_v1'), scope: z.literal('discovered_equipment_tables_only'),
  project_complete: z.literal(false), capture_id: z.string().regex(/^[a-f0-9]{64}$/),
  review_head: z.string().regex(/^[a-f0-9]{64}$/).nullable(), review_origin: z.enum(['operator_input', 'agent_proposal']).nullable(),
  register: basEquipmentRegisterSchema,
  sequence_comparisons: z.array(z.object({ assignment_id: id, region_id: id, matrix_id: id,
    included_equipment_ids: z.array(id), unpaired_point_row_ids: z.array(id),
    requirements: z.array(z.object({ requirement_id: id, clause_id: id, variable: z.string(), source_span_ids: z.array(id),
      status: z.enum(['listed', 'not_listed_in_selected_matrix', 'ambiguous_listed_rows', 'point_labels_unavailable']),
      listed_row_ids: z.array(id), installed_quantity: z.null(), field_wiring_status: z.literal('not_established'),
    }).strict()),
  }).strict()),
  occurrences: z.array(z.object({ occurrence_id: id, table_index: count, row_index: count,
    source_id: id.nullable(), page_id: id.nullable(), mark_columns: z.array(z.string()), named_members: z.array(z.string()).nullable(),
    printed_quantity: count.nullable(), printed_quantity_text: z.string().nullable(), installed_quantity: z.null(),
    issues: z.array(z.string()),
  }).strict()),
  issues: z.array(z.object({ code: z.string(), equipment_id: id.optional(), assignment_id: id.optional(), scope_id: id.optional() }).strict()),
}).strict();

export async function basEquipmentSummary(workflow: BasWorkflow, captureId: string) {
  const view = await basEquipmentView(workflow, captureId);
  return basEquipmentSummarySchema.parse({ schema_version: 'bas_equipment_summary_v1', scope: view.candidates.scope,
    project_complete: false, capture_id: captureId, review_head: basEquipmentHead(workflow, captureId),
    review_origin: workflow.equipment_events?.filter(e => e.capture_id === captureId).at(-1)?.origin ?? null,
    register: view.register, issues: view.issues,
    sequence_comparisons: view.assignments.flatMap(a => a.sequence_comparisons.map(c => ({ assignment_id: a.assignment_id,
      matrix_id: a.matrix_id, region_id: c.region_id, included_equipment_ids: a.included_equipment_ids,
      unpaired_point_row_ids: c.unpaired_point_row_ids, requirements: c.requirements.map(r => ({
        requirement_id: r.requirement.requirement_id, clause_id: r.clause_id, variable: r.requirement.variable,
        source_span_ids: r.source_spans.map(s => s.span_id), status: r.status, listed_row_ids: r.listed_rows.map(row => row.row_id),
        installed_quantity: null, field_wiring_status: r.field_wiring_status,
      })) }))),
    occurrences: view.candidates.tables.flatMap((t, table_index) => t.rows.map(r => ({ occurrence_id: r.occurrence_id,
      table_index, row_index: r.row_index, source_id: r.source_id, page_id: r.page_id, mark_columns: r.mark_columns,
      named_members: r.membership?.members ?? null, printed_quantity: r.printed_quantity?.value ?? null,
      printed_quantity_text: r.printed_quantity?.raw ?? null, installed_quantity: null, issues: r.issues }))),
  });
}

export async function applyBasEquipmentReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasEquipmentReviewEvent['origin'], createdAt = new Date().toISOString()): Promise<BasWorkflow> {
  const workflow = await verifyBasWorkflow(rawWorkflow), request = basEquipmentReviewRequestSchema.parse(rawRequest);
  const previous = workflow.equipment_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _version, origin: oldOrigin, created_at: _time, ...oldRequest } = previous;
    if (oldOrigin !== origin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('BAS operation ID was reused for a different equipment request');
    return workflow;
  }
  if (workflow.current_capture_id !== request.capture_id) throw new Error('The active BAS capture changed. Review the current equipment evidence.');
  if (basEquipmentHead(workflow, request.capture_id) !== request.expected_head) throw new Error('Equipment review changed since this edit began. Reload the register.');
  const capture = workflow.captures.find(c => c.capture_id === request.capture_id);
  if (!capture?.narrative_sources || !capture.equipment_sources) throw new Error('This capture has no retained equipment evidence');
  await validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, request.register);
  const payload = { ...request, rule_version: 'equipment_assignment_review_1' as const, origin, created_at: createdAt };
  const event = basEquipmentReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  return basWorkflowSchema.parse({ ...workflow, revision: workflow.revision === 'bas_assignment_4' ? 'bas_assignment_4' : 'bas_equipment_3', equipment_events: [...(workflow.equipment_events ?? []), event] });
}
