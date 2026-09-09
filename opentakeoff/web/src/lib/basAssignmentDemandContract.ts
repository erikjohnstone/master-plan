/** Shared contracts/lineage checks. Arithmetic remains exclusively in Python. */
import { z } from 'zod';
import { basPointListsSchema } from './basPointLists.ts';
import { basEquipmentRegisterSchema, validateBasEquipmentRegister, type BasEquipmentRegister } from './basEquipmentRegister.ts';
import type { BasCapture, BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

const id = z.string().min(1).max(512), sha = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe(), ids = z.array(id).max(100000);
const matrix = basPointListsSchema.innerType().shape.matrices.element;
const row = matrix.shape.rows.element;
const assignment = basEquipmentRegisterSchema.shape.assignments.element.extend({
  scope_id: z.string().uuid(), quantity_basis: z.literal('scheduled_named_members'),
}).strict();
export const BAS_ASSIGNMENT_DEMAND_RULE = 'assigned_listed_observations_1' as const;
export const basAssignmentDemandRequestSchema = z.object({ capture_id: sha, expected_equipment_head: sha }).strict();
export const basAssignmentDemandInputSchema = z.object({ capture_id: sha, equipment_head: sha,
  points: basPointListsSchema, assignments: z.array(assignment).max(100000),
}).strict();
export type BasAssignmentDemandInput = z.infer<typeof basAssignmentDemandInputSchema>;

export const basAssignmentDemandResultSchema = z.object({
  schema_version: z.literal('bas_assignment_demand_v1'), rule_version: z.literal(BAS_ASSIGNMENT_DEMAND_RULE),
  engine: z.literal('bas_math_v1'), capture_id: sha, equipment_head: sha,
  point_rule_version: z.literal('point_observations_1'), scope: z.literal('explicit_assignments_discovered_matrices_only'),
  assignments: z.array(z.object({ assignment, included_equipment_ids: ids, replication_factor: count,
    rows: z.array(z.object({ row_id: id, name: z.string(),
      observations: z.array(z.object({ observation_id: id, observation_index: count,
        original: row.shape.observations.element, assigned_value: count.nullable(),
        status: z.enum(['calculated_listed_value', 'unavailable', 'attribute_not_quantity']),
      }).strict()), qualifiers: row.shape.qualifiers, unobserved_columns: z.array(z.string()),
      unobserved_typed_columns: z.array(z.string()), uninterpreted_columns: z.array(z.string()),
      issues: z.array(z.string()), field_wiring_status: z.literal('not_established'),
    }).strict()),
    known_listed_io_subtotal: z.object({ AI: count, AO: count, DI: count, DO: count }).strict(),
    known_listed_software_subtotals: z.array(z.object({ channel: z.string(), known_listed_value: count }).strict()),
    subtotal_basis: z.literal('known_source_observations_not_unique_requirements'),
    unobserved_typed_cells: count, ambiguous_observations: count, issues: z.array(z.string()),
    installed_quantity: z.null(), field_wiring_status: z.literal('not_established'),
  }).strict()).max(100000), issues: z.array(z.string()), unique_requirement_total: z.null(),
  installed_quantity: z.null(), project_complete: z.literal(false),
}).strict();
export type BasAssignmentDemandResult = z.infer<typeof basAssignmentDemandResultSchema>;
export const basAssignmentCalculationSchema = z.object({ calculation_id: sha, input_fingerprint: sha,
  created_at: z.string().datetime(), result: basAssignmentDemandResultSchema }).strict();
export type BasAssignmentCalculation = z.infer<typeof basAssignmentCalculationSchema>;

/** Shared register validation establishes membership; this projection supplies
 * every assignment together so cross-template conflicts cannot be batched away. */
export async function buildBasAssignmentDemandInput(capture: BasCapture, register: BasEquipmentRegister, equipmentHead: string) {
  if (!capture.narrative_sources || !capture.equipment_sources) throw new Error('Assignment calculation needs retained equipment and narrative evidence');
  const view = await validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, register);
  const selected = new Set(view.assignments.map(a => a.matrix_id));
  return basAssignmentDemandInputSchema.parse({ capture_id: capture.capture_id, equipment_head: equipmentHead,
    points: { ...capture.points, matrices: capture.points.matrices.filter(m => selected.has(m.matrix_id)) },
    assignments: view.assignments.map(({ assignment_id, matrix_id, scope_id, applicability, equipment_ids,
      excluded_equipment_ids, source_span_ids, sequence_region_ids, reason, quantity_basis }) => ({
      assignment_id, matrix_id, scope_id, applicability, equipment_ids, excluded_equipment_ids,
      source_span_ids, sequence_region_ids, reason, quantity_basis,
    })),
  });
}

/** File aliases are navigation metadata, never evidence/quantity identity. */
function semanticSources(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticSources);
  if (!value || typeof value !== 'object') return value;
  const normalized = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, semanticSources(child)]));
  // Only the two validated navigation fields, never a source column named
  // "sheet" or an arbitrary authored key, are normalized.
  if (typeof normalized.page_id === 'string') {
    if (typeof normalized.sheet_key === 'string') normalized.sheet_key = normalized.page_id;
    if (typeof normalized.matrix_id === 'string' && normalized.raw && typeof normalized.raw === 'object'
        && 'sheet' in normalized.raw) normalized.raw.sheet = normalized.page_id;
  }
  return normalized;
}
const same = (a: unknown, b: unknown) => canonicalBasJson(semanticSources(a)) === canonicalBasJson(semanticSources(b));
const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
export const basAssignmentInputFingerprint = (input: BasAssignmentDemandInput) =>
  digest({ rule_version: BAS_ASSIGNMENT_DEMAND_RULE, input: semanticSources(input) });
export const basAssignmentCalculationFingerprint = (record: Omit<BasAssignmentCalculation, 'calculation_id'>) => digest(record);

/** A calculation may append exactly its result, never rewrite source/decision
 * history. Call after verifying workflow integrity; no arithmetic lives here. */
export function assertBasAssignmentUpdate(previous: BasWorkflow, updated: BasWorkflow,
  rawCalculation: unknown, rawRequest: unknown) {
  const calculation = basAssignmentCalculationSchema.parse(rawCalculation);
  const request = basAssignmentDemandRequestSchema.parse(rawRequest);
  const head = previous.equipment_events?.filter(e => e.capture_id === request.capture_id).at(-1)?.event_id;
  if (previous.current_capture_id !== request.capture_id || head !== request.expected_equipment_head
      || calculation.result.capture_id !== request.capture_id || calculation.result.equipment_head !== head) {
    throw new Error('Calculation response belongs to different evidence or equipment decisions');
  }
  const calculations = [...(previous.assignment_calculations ?? [])];
  if (!calculations.some(c => c.calculation_id === calculation.calculation_id)) calculations.push(calculation);
  else if (!calculations.some(c => canonicalBasJson(c) === canonicalBasJson(calculation))) {
    throw new Error('Calculation response changed a retained result');
  }
  const expected = { ...previous, revision: 'bas_assignment_4', assignment_calculations: calculations };
  if (canonicalBasJson(updated) !== canonicalBasJson(expected)) {
    throw new Error('Calculation response changed or omitted source evidence, decisions or earlier results');
  }
}

/** Validate source/selection parity, not a competing JS demand calculation.
 * Python output is checked before saving; saved fingerprints detect corruption,
 * not malicious re-signing or authenticated engineering approval. */
export function verifyBasAssignmentDemandResult(input: BasAssignmentDemandInput, raw: unknown) {
  const result = basAssignmentDemandResultSchema.parse(raw);
  if (result.capture_id !== input.capture_id || result.equipment_head !== input.equipment_head
      || result.point_rule_version !== input.points.rule_version) throw new Error('Assignment calculation dependencies changed');
  if (result.assignments.length !== input.assignments.length) throw new Error('Assignment calculation omitted an assignment');
  const matrices = new Map(input.points.matrices.map(m => [m.matrix_id, m]));
  for (const [index, derived] of result.assignments.entries()) {
    const original = input.assignments[index];
    if (!same(original, derived.assignment)) throw new Error('Calculation changed an assignment or its evidence');
    const excluded = new Set(original.excluded_equipment_ids);
    if (!same(original.equipment_ids.filter(id => !excluded.has(id)), derived.included_equipment_ids)) throw new Error('Calculation changed the included equipment');
    const source = matrices.get(original.matrix_id);
    if (!source || source.rows.length !== derived.rows.length) throw new Error('Calculation omitted source rows');
    const observationIds = new Set<string>();
    for (const [rIndex, r] of derived.rows.entries()) {
      const rawRow = source.rows[rIndex];
      if (r.row_id !== rawRow.row_id || r.name !== rawRow.name || !same(r.qualifiers, rawRow.qualifiers)
          || !same(r.unobserved_columns, rawRow.unobserved_columns) || !same(r.uninterpreted_columns, rawRow.uninterpreted_columns)
          || rawRow.issues.some(issue => !r.issues.includes(issue)) || r.observations.length !== rawRow.observations.length) {
        throw new Error('Calculation changed or omitted point evidence');
      }
      for (const [oIndex, o] of r.observations.entries()) {
        if (o.observation_index !== oIndex || observationIds.has(o.observation_id) || !same(o.original, rawRow.observations[oIndex])) throw new Error('Calculation observation differs from source');
        observationIds.add(o.observation_id);
        const expected = o.original.kind === 'attribute' ? 'attribute_not_quantity' : o.original.value === null ? 'unavailable' : 'calculated_listed_value';
        if (o.status !== expected || (o.assigned_value === null) !== (expected !== 'calculated_listed_value')) throw new Error('Calculation obscured a missing value or attribute');
      }
    }
  }
  return result;
}
