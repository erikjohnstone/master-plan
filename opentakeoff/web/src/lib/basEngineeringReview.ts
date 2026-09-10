/** Shared engineering history/freshness, never browser arithmetic or approval. */
import type { BasWorkflow } from './basWorkflow.ts';
import { basEquipmentRegister } from './basEquipmentReview.ts';
import { emptyBasEngineeringRegister, validateBasEngineeringRegister, basEngineeringReviewRequestSchema,
  type BasEngineeringReviewEvent } from './basEngineeringRegister.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { z } from 'zod';
import { basEngineeringRegisterSchema, basEngineeringReviewEventSchema } from './basEngineeringRegister.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(512);
const dependency = z.enum(['not_reviewed', 'current_dependencies', 'stale_dependencies']);
/** Compact public projection; full rating spans remain in the immutable capture
 * and original bases remain in the register/event, not reformatted by summary. */
export const basEngineeringSummarySchema = z.object({ capture_id: sha, register: basEngineeringRegisterSchema,
  event: basEngineeringReviewEventSchema.nullable(), current_heads: z.object({ engineering: sha.nullable(), equipment: sha.nullable(),
    assembly: sha.nullable(), sequence: sha.nullable() }).strict(),
  dependency_status: dependency, assembly_dependency_status: dependency,
  calculation_verification: z.enum(['not_calculated', 'requires_python_replay', 'verified_shared_python_replay']),
  source_status: z.enum(['active_capture', 'historical_capture']), project_complete: z.literal(false), installed_quantity: z.null(),
  issues: z.array(z.object({ code: z.string(), resource_id: id.optional(), check_id: id.optional() }).strict()),
  equipment_issues: z.array(z.object({ code: z.string(), equipment_id: id.optional(), assignment_id: id.optional(), scope_id: id.optional() }).strict()),
});

/** Shared response/request binding, after workflow integrity validation. The
 * caller also compares live workspace state after awaiting the service. This
 * is neither a second calculator nor authentication of a reviewer's identity. */
export function assertBasEngineeringUpdate(previous: BasWorkflow, updated: BasWorkflow, event: BasEngineeringReviewEvent,
  rawRequest: unknown, origin: BasEngineeringReviewEvent['origin']) {
  const request = basEngineeringReviewRequestSchema.parse(rawRequest);
  const { event_id: _id, result: _result, rule_version: _version, created_at: _time, origin: eventOrigin, ...eventRequest } = event;
  const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);
  if (!same(request, eventRequest) || eventOrigin !== origin) throw new Error('Engineering response belongs to a different request or origin');
  const events = [...(previous.engineering_events ?? [])];
  const existing = events.find(e => e.event_id === event.event_id);
  if (existing && !same(existing, event)) throw new Error('Engineering response changed retained history');
  if (!existing) events.push(event);
  if (!same(updated, { ...previous, revision: atLeastBasWorkflowRevision(previous.revision, 'bas_engineering_6'), engineering_events: events }))
    throw new Error('Engineering response changed or omitted evidence or review history');
}

export function basEngineeringHeads(workflow: BasWorkflow, captureId: string) {
  return {
    engineering: workflow.engineering_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null,
    equipment: workflow.equipment_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null,
    assembly: workflow.assembly_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null,
    sequence: workflow.review_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null,
  };
}

/** A browser-safe view never labels an imported saved result as freshly verified.
 * The Node/Python service supplies that separate guarantee after actual replay. */
export async function basEngineeringView(workflow: BasWorkflow, captureId: string) {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture) throw new Error('Engineering view has no retained capture');
  const heads = basEngineeringHeads(workflow, captureId);
  const event = workflow.engineering_events?.find(e => e.event_id === heads.engineering) ?? null;
  const equipment = event ? workflow.equipment_events?.find(e => e.event_id === event.expected_equipment_head)?.register
    : basEquipmentRegister(workflow, captureId);
  if (!equipment) throw new Error('Engineering history has no retained equipment decision');
  const currentAssembly = workflow.assembly_events?.find(e => e.event_id === heads.assembly) ?? null;
  const assemblyStatus = !currentAssembly ? 'not_reviewed' as const
    : currentAssembly.expected_equipment_head === heads.equipment ? 'current_dependencies' as const : 'stale_dependencies' as const;
  const assemblyHead = event ? event.expected_assembly_head : heads.assembly;
  // A saved engineering review uses its own pinned assembly/equipment pair.
  // Before the first review, a stale assembly is disclosed, never rebased onto
  // current equipment merely to populate an empty engineering workspace.
  const assembly = !event && assemblyStatus === 'stale_dependencies' ? null
    : workflow.assembly_events?.find(e => e.event_id === assemblyHead)?.register ?? null;
  const view = await validateBasEngineeringRegister(capture, equipment, assembly, event?.register ?? emptyBasEngineeringRegister());
  const current = event && workflow.current_capture_id === captureId && event.expected_equipment_head === heads.equipment
    && event.expected_assembly_head === heads.assembly && event.expected_sequence_head === heads.sequence;
  return { ...view, capture_id: captureId, event, current_heads: heads, assembly_dependency_status: assemblyStatus,
    dependency_status: !event ? 'not_reviewed' as const : current ? 'current_dependencies' as const : 'stale_dependencies' as const,
    calculation_verification: event ? 'requires_python_replay' as const : 'not_calculated' as const,
    source_status: workflow.current_capture_id === captureId ? 'active_capture' as const : 'historical_capture' as const };
}

/** Validate a read-only replay response against precisely the submitted state.
 * The verification label is ephemeral transport state, never a persisted claim. */
export async function assertBasEngineeringInspection(previous: BasWorkflow, updated: BasWorkflow, view: unknown, captureId: string) {
  const expected = await basEngineeringView(previous, captureId);
  if (canonicalBasJson(previous) !== canonicalBasJson(updated)
    || canonicalBasJson(view) !== canonicalBasJson({ ...expected,
      calculation_verification: expected.event ? 'verified_shared_python_replay' : 'not_calculated' }))
    throw new Error('Engineering inspection response differs from the submitted history or capture');
}
