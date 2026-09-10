/** Shared assembly arithmetic boundary/lineage. No competing JS calculation. */
import { z } from 'zod';
import { basAssemblyComponentSchema, basAssemblyRegisterSchema, validateBasAssemblyRegister,
  type BasAssemblyRegister } from './basAssemblyRegister.ts';
import type { BasEquipmentRegister } from './basEquipmentRegister.ts';
import type { BasCapture, BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

const sha = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.string().uuid(), id = z.string().min(1).max(512);
const count = z.number().int().nonnegative().safe();
export const BAS_ASSEMBLY_QUANTITY_RULE = 'declared_assembly_quantities_1' as const;
export const basAssemblyQuantityRequestSchema = z.object({ capture_id: sha, expected_equipment_head: sha, expected_assembly_head: sha }).strict();
export const basAssemblyQuantityInputSchema = z.object({ capture_id: sha, equipment_head: sha, assembly_head: sha,
  equipment: z.array(z.object({ equipment_id: uuid, scope_id: uuid }).strict()).max(100000), assembly_register: basAssemblyRegisterSchema }).strict();
export type BasAssemblyQuantityInput = z.infer<typeof basAssemblyQuantityInputSchema>;
export const basAssemblyQuantityResultSchema = z.object({ schema_version: z.literal('bas_assembly_quantities_v1'),
  rule_version: z.literal(BAS_ASSEMBLY_QUANTITY_RULE), engine: z.literal('bas_math_v1'),
  capture_id: sha, equipment_head: sha, assembly_head: sha,
  source_rule_version: basAssemblyRegisterSchema.shape.source_rule_version,
  components: z.array(z.object({ original: basAssemblyComponentSchema, included_equipment_ids: z.array(uuid).max(100000),
    replication_factor: count, eligibility: z.enum(['included', 'excluded_component', 'no_included_members', 'condition_not_satisfied', 'condition_unresolved']),
    status: z.enum(['calculated_declared_quantity', 'excluded_contribution', 'quantity_unknown', 'condition_unresolved']),
    assigned_quantity: count.nullable(), issues: z.array(id), installed_quantity: z.null(),
  }).strict()).max(100000),
  quantity_basis: z.literal('reviewed_declared_components_not_installed'), project_complete: z.literal(false),
  installed_quantity: z.null(), unique_physical_total: z.null(),
}).strict();
export type BasAssemblyQuantityResult = z.infer<typeof basAssemblyQuantityResultSchema>;
export const basAssemblyCalculationSchema = z.object({ calculation_id: sha, input_fingerprint: sha,
  created_at: z.string().datetime(), result: basAssemblyQuantityResultSchema }).strict();
export type BasAssemblyCalculation = z.infer<typeof basAssemblyCalculationSchema>;

export async function buildBasAssemblyQuantityInput(capture: BasCapture, equipment: BasEquipmentRegister, equipmentHead: string,
  assembly: BasAssemblyRegister, assemblyHead: string): Promise<BasAssemblyQuantityInput> {
  if (!capture.narrative_sources || !capture.equipment_sources) throw new Error('Assembly calculation requires retained source evidence');
  const view = await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points, equipment, assembly);
  return basAssemblyQuantityInputSchema.parse({ capture_id: capture.capture_id, equipment_head: equipmentHead, assembly_head: assemblyHead,
    equipment: equipment.equipment.map(({ equipment_id, scope_id }) => ({ equipment_id, scope_id })), assembly_register: view.register });
}

const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
export const basAssemblyQuantityInputFingerprint = (input: BasAssemblyQuantityInput) => digest({ rule_version: BAS_ASSEMBLY_QUANTITY_RULE, input });
export const basAssemblyCalculationFingerprint = (calculation: Omit<BasAssemblyCalculation, 'calculation_id'>) => digest(calculation);
const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);

/** Source/selection/state equality, not browser multiplication or an approval. */
export function verifyBasAssemblyQuantityResult(input: BasAssemblyQuantityInput, raw: unknown): BasAssemblyQuantityResult {
  const result = basAssemblyQuantityResultSchema.parse(raw);
  if (result.capture_id !== input.capture_id || result.equipment_head !== input.equipment_head || result.assembly_head !== input.assembly_head
    || result.source_rule_version !== input.assembly_register.source_rule_version) throw new Error('Assembly calculation dependencies changed');
  if (result.components.length !== input.assembly_register.components.length) throw new Error('Assembly calculation omitted a component');
  for (const [index, derived] of result.components.entries()) {
    const original = input.assembly_register.components[index];
    if (!same(original, derived.original)) throw new Error('Assembly calculation changed original decisions or evidence');
    const excluded = new Set(original.excluded_equipment_ids);
    if (!same(original.equipment_ids.filter(key => !excluded.has(key)), derived.included_equipment_ids)) throw new Error('Assembly calculation changed included equipment');
    const eligibility = original.disposition === 'excluded' ? 'excluded_component' : !derived.included_equipment_ids.length ? 'no_included_members'
      : original.condition.status === 'not_satisfied' ? 'condition_not_satisfied' : original.condition.status === 'unresolved' ? 'condition_unresolved' : 'included';
    const status = original.quantity.value === null ? 'quantity_unknown' : eligibility === 'condition_unresolved' ? 'condition_unresolved'
      : eligibility === 'included' ? 'calculated_declared_quantity' : 'excluded_contribution';
    if (derived.eligibility !== eligibility || derived.status !== status
      || (derived.assigned_quantity === null) !== ['quantity_unknown', 'condition_unresolved'].includes(status)
      || (status === 'excluded_contribution' && derived.assigned_quantity !== 0)) throw new Error('Assembly calculation obscured an unknown or excluded contribution');
    const requiredIssues = [original.quantity.value === null ? 'COMPONENT_QUANTITY_UNKNOWN' : null,
      original.condition.status === 'unresolved' ? 'COMPONENT_CONDITION_UNRESOLVED' : null,
      original.lifecycle === 'unknown' ? 'COMPONENT_LIFECYCLE_UNKNOWN' : null].filter((x): x is string => !!x);
    if (requiredIssues.some(issue => !derived.issues.includes(issue))) throw new Error('Assembly calculation omitted an unresolved source/decision issue');
  }
  return result;
}

export function assertBasAssemblyCalculationUpdate(previous: BasWorkflow, updated: BasWorkflow, rawCalculation: unknown, rawRequest: unknown) {
  const request = basAssemblyQuantityRequestSchema.parse(rawRequest), calculation = basAssemblyCalculationSchema.parse(rawCalculation);
  const equipmentHead = previous.equipment_events?.filter(e => e.capture_id === request.capture_id).at(-1)?.event_id;
  const assembly = previous.assembly_events?.filter(e => e.capture_id === request.capture_id).at(-1);
  if (previous.current_capture_id !== request.capture_id || equipmentHead !== request.expected_equipment_head || assembly?.event_id !== request.expected_assembly_head
    || assembly.expected_equipment_head !== equipmentHead || calculation.result.capture_id !== request.capture_id
    || calculation.result.equipment_head !== equipmentHead || calculation.result.assembly_head !== assembly.event_id) throw new Error('Assembly response belongs to different sources or decisions');
  const calculations = [...(previous.assembly_calculations ?? [])];
  const retained = calculations.find(c => c.calculation_id === calculation.calculation_id);
  if (!retained) calculations.push(calculation);
  else if (!same(retained, calculation)) throw new Error('Assembly response changed a retained calculation');
  if (!same(updated, { ...previous, assembly_calculations: calculations })) throw new Error('Assembly response changed or omitted source evidence, decisions or results');
}
