/** Shared source-backed equipment register and template applicability contract.
 * No installed counting, quantity multiplication, source rewriting or approval. */
import { z } from 'zod';
import { buildBasEquipmentCandidates, type BasEquipmentEvidence } from './basEquipmentEvidence.ts';
import { basPointListsSchema, type BasPointLists } from './basPointLists.ts';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { compareBasSequenceMatrix, interpretBasSequences } from './basSequenceReconciliation.ts';

const uuid = z.string().uuid(), id = z.string().min(1).max(512);
const reason = z.string().trim().min(1).max(4096);
const spans = z.array(id).max(10000);
const label = z.string().trim().min(1).max(512);
export const basEquipmentRegisterSchema = z.object({
  schema_version: z.literal('bas_equipment_register_v1'),
  scopes: z.array(z.object({ scope_id: uuid, building: label.nullable(), level: label.nullable(),
    system: label.nullable(), phase: label.nullable(), source_span_ids: spans, reason }).strict()).max(10000),
  equipment: z.array(z.object({ equipment_id: uuid, scope_id: uuid, tag: label,
    bindings: z.array(z.object({ occurrence_id: id, member: label }).strict()).min(1).max(10000), reason }).strict()).max(100000),
  assignments: z.array(z.object({ assignment_id: uuid, matrix_id: id,
    applicability: z.enum(['per_equipment', 'system_once']),
    equipment_ids: z.array(uuid).min(1).max(100000), excluded_equipment_ids: z.array(uuid).max(100000),
    sequence_region_ids: z.array(id).max(10000), source_span_ids: spans, reason,
  }).strict()).max(100000),
}).strict();
export type BasEquipmentRegister = z.infer<typeof basEquipmentRegisterSchema>;
export const emptyBasEquipmentRegister = (): BasEquipmentRegister => ({ schema_version: 'bas_equipment_register_v1', scopes: [], equipment: [], assignments: [] });

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basEquipmentReviewRequestSchema = z.object({ operation_id: uuid, capture_id: sha,
  expected_head: sha.nullable(), reason, register: basEquipmentRegisterSchema }).strict();
export const basEquipmentReviewEventSchema = basEquipmentReviewRequestSchema.extend({
  event_id: sha, rule_version: z.literal('equipment_assignment_review_1'),
  created_at: z.string().datetime(), origin: z.enum(['operator_input', 'agent_proposal']),
}).strict();
export type BasEquipmentReviewEvent = z.infer<typeof basEquipmentReviewEventSchema>;

/** Called against verified immutable capture evidence, including on import and
 * event replay. Selection by the operator/Agent is disclosed, not extracted fact. */
export async function validateBasEquipmentRegister(sources: BasSourceContext, evidence: BasEquipmentEvidence,
  points: BasPointLists, raw: unknown) {
  const context = basSourceContextSchema.parse(sources), matrices = basPointListsSchema.parse(points);
  const register = basEquipmentRegisterSchema.parse(raw);
  const candidates = await buildBasEquipmentCandidates(context, evidence);
  const occurrences = new Map(candidates.tables.flatMap(t => t.rows.map(r => [r.occurrence_id, r] as const)));
  const sourceSpans = new Set(context.pages.flatMap(p => p.spans.map(s => s.span_id)));
  const regions = new Map(interpretBasSequences(context).regions.map(r => [r.region_id, r]));
  const issues: Array<{ code: string; equipment_id?: string; assignment_id?: string; scope_id?: string }> = [];
  const unique = (ids: string[], what: string) => { if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${what}`); };
  const ownsSpans = (ids: string[]) => {
    unique(ids, 'source span');
    if (ids.some(i => !sourceSpans.has(i))) throw new Error('Equipment decision refers to a foreign source span');
  };
  unique(register.scopes.map(s => s.scope_id), 'scope identity');
  unique(register.equipment.map(e => e.equipment_id), 'equipment identity');
  unique(register.assignments.map(a => a.assignment_id), 'assignment identity');
  const scopes = new Map(register.scopes.map(s => [s.scope_id, s]));
  for (const scope of register.scopes) {
    ownsSpans(scope.source_span_ids);
    if ([scope.building, scope.level, scope.system, scope.phase].some(s => s === null)) issues.push({ code: 'scope_partly_unknown', scope_id: scope.scope_id });
  }
  const boundMembers = new Set<string>(), scopedTags = new Set<string>();
  for (const equipment of register.equipment) {
    if (!scopes.has(equipment.scope_id)) throw new Error('Equipment refers to a missing scope');
    const scoped = JSON.stringify([equipment.scope_id, equipment.tag]);
    if (scopedTags.has(scoped)) throw new Error('Duplicate equipment tag in one explicit scope');
    scopedTags.add(scoped);
    if (!equipment.bindings.some(b => b.member === equipment.tag)) throw new Error('Canonical equipment tag must be a retained member label');
    for (const binding of equipment.bindings) {
      const occurrence = occurrences.get(binding.occurrence_id);
      if (!occurrence?.page_id || occurrence.issues.includes('unowned_table_source')
        || !occurrence.membership?.members?.includes(binding.member)) throw new Error('Equipment binding is not an owned printed member');
      const key = JSON.stringify([binding.occurrence_id, binding.member]);
      if (boundMembers.has(key)) throw new Error('One source member cannot be assigned twice');
      boundMembers.add(key);
      for (const code of occurrence.issues) issues.push({ code, equipment_id: equipment.equipment_id });
      const scope = scopes.get(equipment.scope_id)!;
      if (occurrence.building_hint && scope.building !== occurrence.building_hint) issues.push({ code: 'building_hint_differs_from_decision', equipment_id: equipment.equipment_id });
    }
  }
  const equipmentMap = new Map(register.equipment.map(e => [e.equipment_id, e]));
  const matrixMap = new Map(matrices.matrices.map(m => [m.matrix_id, m]));
  const assignments = [];
  const matrixMembers = new Set<string>(), matrixScopes = new Map<string, Set<string>>();
  for (const a of register.assignments) {
    const matrix = matrixMap.get(a.matrix_id);
    if (!matrix?.page_id || !context.pages.some(p => p.page_id === matrix.page_id && p.source_id === matrix.source_id)) throw new Error('Assignment refers to an unowned or missing point matrix');
    unique(a.equipment_ids, 'assignment member'); unique(a.excluded_equipment_ids, 'assignment exception'); unique(a.sequence_region_ids, 'sequence reference');
    ownsSpans(a.source_span_ids);
    if (a.sequence_region_ids.some(id => regions.get(id)?.raw.status !== 'body_detected')) throw new Error('Assignment refers to a missing or body-unavailable sequence region');
    const selected = new Set(a.equipment_ids), excluded = new Set(a.excluded_equipment_ids);
    if (a.equipment_ids.some(id => !equipmentMap.has(id)) || a.excluded_equipment_ids.some(id => !selected.has(id))) throw new Error('Assignment members/exceptions are not in the equipment register');
    const included_equipment_ids = a.equipment_ids.filter(id => !excluded.has(id));
    const assignedScopes = new Set(a.equipment_ids.map(id => equipmentMap.get(id)!.scope_id));
    // A system-wide template is one system, not a request to bridge unknown or
    // different scopes. An operator may establish one explicit project scope.
    if (assignedScopes.size !== 1) throw new Error('One template assignment must use one explicitly established scope');
    const scope_id = [...assignedScopes][0];
    for (const equipment_id of included_equipment_ids) {
      const key = JSON.stringify([a.matrix_id, equipment_id]);
      if (matrixMembers.has(key)) throw new Error('A matrix is assigned to the same equipment more than once');
      matrixMembers.add(key);
    }
    const scopeKey = JSON.stringify([a.matrix_id, scope_id]);
    const prior = matrixScopes.get(scopeKey) ?? new Set<string>();
    if (included_equipment_ids.length && prior.size && (a.applicability === 'system_once' || prior.has('system_once'))) {
      throw new Error('A system matrix cannot be replicated or mixed with per-equipment assignments in one scope');
    }
    if (included_equipment_ids.length) prior.add(a.applicability);
    matrixScopes.set(scopeKey, prior);
    if (!a.sequence_region_ids.length) issues.push({ code: 'sequence_applicability_not_linked', assignment_id: a.assignment_id });
    if (!included_equipment_ids.length) issues.push({ code: 'all_members_explicitly_excluded', assignment_id: a.assignment_id });
    assignments.push({ ...a, scope_id, included_equipment_ids, quantity_basis: 'scheduled_named_members' as const,
      sequence_comparisons: a.sequence_region_ids.map(region_id => ({ region_id, ...compareBasSequenceMatrix(regions.get(region_id)!, matrix) })),
      installed_quantity: null, field_wiring_status: 'not_established' as const });
  }
  // Different templates may repeat physical requirements. Do not let their
  // distinct IDs imply that their underlying physical devices are independent.
  for (const e of register.equipment) if (assignments.filter(a => a.included_equipment_ids.includes(e.equipment_id)).length > 1) {
    issues.push({ code: 'multiple_templates_require_point_identity_review', equipment_id: e.equipment_id });
  }
  return { schema_version: 'bas_equipment_assignment_view_v1' as const, project_complete: false as const,
    register, candidates, assignments, issues, installed_quantity: null };
}
