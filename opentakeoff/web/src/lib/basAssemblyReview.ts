/** Shared durable component/responsibility decisions. Never UI-only quantities. */
import { verifyBasWorkflow, basWorkflowSchema, basEventFingerprint, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { basEquipmentHead, basEquipmentRegister } from './basEquipmentReview.ts';
import { basAssemblyReviewRequestSchema, basAssemblyReviewEventSchema, basAssemblyInterpretationFingerprint,
  emptyBasAssemblyRegister, validateBasAssemblyRegister, type BasAssemblyReviewEvent } from './basAssemblyRegister.ts';
import { basAssemblyRegisterSchema } from './basAssemblyRegister.ts';
import { interpretBasComponentRequirements } from './basComponentRequirements.ts';
import { z } from 'zod';

const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(512);
export const basAssemblySummarySchema = z.object({ schema_version: z.literal('bas_assembly_summary_v1'),
  capture_id: sha, review_head: sha.nullable(), current_equipment_head: sha.nullable(), reviewed_equipment_head: sha.nullable(),
  review_origin: z.enum(['operator_input', 'agent_proposal']).nullable(),
  dependency_status: z.enum(['not_reviewed', 'current_dependencies', 'stale_dependencies']),
  register: basAssemblyRegisterSchema,
  source_requirements: z.array(z.object({ requirement_id: id, page_id: id, clause_id: id, source_span_ids: z.array(id),
    component_kind: z.enum(['variable_frequency_drive', 'onboard_controller']), subject_label: z.string(),
    fan_role: z.enum(['SUPPLY', 'RETURN', 'EXHAUST', 'RELIEF']).nullable(), declared_quantity: z.literal(1),
    applicability: z.literal('requires_equipment_applicability_review'),
  }).strict()),
  issues: z.array(z.object({ code: z.string(), component_id: id, activity: z.enum(['furnish', 'install', 'wire', 'program', 'test']).optional(), related_component_id: id.optional() }).strict()),
  equipment_issues: z.array(z.object({ code: z.string(), equipment_id: id.optional(), assignment_id: id.optional(), scope_id: id.optional() }).strict()),
  project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();

export function basAssemblyHead(workflow: BasWorkflow, captureId: string) {
  return workflow.assembly_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null;
}

export function basAssemblyCalculationState(workflow: BasWorkflow, captureId: string) {
  const records = workflow.assembly_calculations?.filter(c => c.result.capture_id === captureId) ?? [];
  const equipment = basEquipmentHead(workflow, captureId), assembly = basAssemblyHead(workflow, captureId);
  const current = (c: typeof records[number]) => c.result.equipment_head === equipment && c.result.assembly_head === assembly;
  const latest = records.filter(current).at(-1) ?? records.at(-1) ?? null;
  return { latest, status: !latest ? 'not_calculated' as const : current(latest) ? 'current_dependencies' as const : 'stale_dependencies' as const };
}

/** Keep an old assembly readable after equipment changes; do not reinterpret it
 * against the new members or pretend an old decision was rebased. */
export async function basAssemblyView(workflow: BasWorkflow, captureId: string) {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture?.narrative_sources || !capture.equipment_sources) throw new Error('Assembly review requires retained equipment and narrative sources');
  const event = workflow.assembly_events?.filter(e => e.capture_id === captureId).at(-1) ?? null;
  const head = basEquipmentHead(workflow, captureId);
  const equipment = event ? workflow.equipment_events?.find(e => e.event_id === event.expected_equipment_head && e.capture_id === captureId)?.register
    : basEquipmentRegister(workflow, captureId);
  if (!equipment) throw new Error('Assembly history has no retained equipment decision');
  const review = await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points,
    equipment, event?.register ?? emptyBasAssemblyRegister());
  return { ...review, capture_id: captureId, review_head: event?.event_id ?? null, review_origin: event?.origin ?? null,
    equipment_head: event?.expected_equipment_head ?? head, current_equipment_head: head,
    dependency_status: !event ? 'not_reviewed' as const : event.expected_equipment_head === head ? 'current_dependencies' as const : 'stale_dependencies' as const,
    source_status: workflow.current_capture_id === captureId ? 'active_capture' as const : 'historical_capture' as const };
}

/** Addressable source candidates plus saved decisions; original prose/bboxes
 * remain in the immutable capture and are never replaced with this summary. */
export async function basAssemblySummary(workflow: BasWorkflow, captureId: string) {
  const view = await basAssemblyView(workflow, captureId);
  const capture = workflow.captures.find(c => c.capture_id === captureId)!;
  const sources = interpretBasComponentRequirements(capture.narrative_sources!, view.register.source_rule_version);
  return basAssemblySummarySchema.parse({ schema_version: 'bas_assembly_summary_v1', capture_id: captureId,
    review_head: view.review_head, current_equipment_head: view.current_equipment_head, reviewed_equipment_head: view.equipment_head,
    review_origin: view.review_origin, dependency_status: view.dependency_status, register: view.register,
    source_requirements: sources.clauses.flatMap(clause => clause.components.map(c => ({ requirement_id: c.requirement_id,
      page_id: clause.page_id, clause_id: clause.clause_id, source_span_ids: clause.source_spans.map(s => s.span_id),
      component_kind: c.component_kind, subject_label: c.subject_label, fan_role: c.fan_role,
      declared_quantity: c.declared_quantity, applicability: c.scope_status }))),
    issues: view.issues, equipment_issues: view.equipment_issues, project_complete: false, installed_quantity: null });
}

export async function applyBasAssemblyReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasAssemblyReviewEvent['origin'], createdAt = new Date().toISOString()): Promise<BasWorkflow> {
  const workflow = await verifyBasWorkflow(rawWorkflow), request = basAssemblyReviewRequestSchema.parse(rawRequest);
  const previous = workflow.assembly_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _version, source_interpretation_fingerprint: _fingerprint,
      created_at: _time, origin: oldOrigin, ...oldRequest } = previous;
    if (oldOrigin !== origin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('BAS operation ID was reused for a different assembly request');
    return workflow;
  }
  if (workflow.current_capture_id !== request.capture_id) throw new Error('The active BAS capture changed. Review the current assembly sources.');
  if (basAssemblyHead(workflow, request.capture_id) !== request.expected_head) throw new Error('Assembly review changed since this edit began. Reload the current assembly.');
  if (basEquipmentHead(workflow, request.capture_id) !== request.expected_equipment_head) throw new Error('Equipment decisions changed. Review the current assembly applicability.');
  const capture = workflow.captures.find(c => c.capture_id === request.capture_id);
  if (!capture?.narrative_sources || !capture.equipment_sources) throw new Error('Assembly review requires retained source evidence');
  await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points,
    basEquipmentRegister(workflow, request.capture_id), request.register);
  const payload = { ...request, rule_version: 'assembly_review_1' as const, created_at: createdAt, origin,
    source_interpretation_fingerprint: await basAssemblyInterpretationFingerprint(capture.narrative_sources, request.register.source_rule_version) };
  const event = basAssemblyReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) });
  return basWorkflowSchema.parse({ ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_assembly_5'),
    assembly_events: [...(workflow.assembly_events ?? []), event] });
}
