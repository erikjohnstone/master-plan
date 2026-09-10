/** Shared wire-only inventory contracts; no extraction or Workflow imports. */
import { z } from 'zod';
import { BAS_REVISION_INVENTORY_RULE, basRevisionBasisSchema, basRevisionHeadsSchema } from './basRevisionBasisContract.ts';

export const BAS_REVISION_ITEM_LIMIT = 100000;
export const BAS_REVISION_INVENTORY_BYTES = 64 * 1024 * 1024;
/** Operational bounds only, not BAS quantity arithmetic. No truncation. */
export function assertBasRevisionInventorySize(itemCount: number, encodedBytes: number) {
  if (![itemCount, encodedBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid revision inventory size');
  if (itemCount > BAS_REVISION_ITEM_LIMIT) throw new Error('Revision inventory exceeds the 100,000-item limit');
  if (encodedBytes > BAS_REVISION_INVENTORY_BYTES) throw new Error('Revision inventory exceeds the 64 MiB encoded limit');
}
const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(4096);
const text = z.string().max(BAS_REVISION_INVENTORY_BYTES);
const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(b => b[2] >= b[0] && b[3] >= b[1], 'Unordered revision source box');
export const BAS_REVISION_ITEM_KINDS = ['drawing_page', 'point_matrix', 'point_row', 'sequence_region', 'sequence_clause',
  'sequence_requirement', 'sequence_link', 'equipment_table', 'equipment_row', 'scope', 'equipment', 'assignment',
  'component_requirement', 'assembly_component', 'responsibility_claim', 'responsibility_resolution',
  'engineering_resource', 'engineering_check', 'assigned_observation', 'assembly_quantity'] as const;
const kind = z.enum(BAS_REVISION_ITEM_KINDS);
const source = z.object({ page_id: id, span_id: id.nullable(), text, bbox_px: box.nullable() }).strict();
const reference = z.object({ relation: id, kind, subject_id: id, source_event_id: sha.nullable() }).strict();
const quantity = z.object({ metric: id, dimension: id, basis: id, value: z.number().int().nonnegative().safe().nullable(),
  status: z.enum(['retained_value', 'unknown', 'not_a_quantity', 'saved_result_requires_python_replay']), value_path: id }).strict();
export const basRevisionItemSchema = z.object({ item_id: sha, capture_id: sha, kind, subject_id: id, label: text,
  source_event_id: sha.nullable(), calculation_id: sha.nullable(), rule_version: id, interpretation_rules: z.array(id).max(20),
  origin: z.enum(['retained_pdf_evidence', 'retained_point_interpretation', 'source_rule', 'operator_input', 'agent_proposal', 'saved_python_result']),
  source_refs: z.array(source).max(200000), references: z.array(reference).max(100000),
  source_scope: z.enum(['inside', 'crosses_boundary', 'outside', 'unlocated']),
  dependency_status: z.enum(['not_applicable', 'pinned_dependencies_match', 'pinned_dependencies_differ']),
  original_json: text, content_fingerprint: sha, quantities: z.array(quantity).max(100000),
}).strict();
export type BasRevisionItem = z.infer<typeof basRevisionItemSchema>;
const dependency = z.enum(['not_selected', 'pinned_dependencies_match', 'pinned_dependencies_differ']);
export const basRevisionInventorySchema = z.object({ schema_version: z.literal('bas_revision_inventory_v1'),
  rule_version: z.literal(BAS_REVISION_INVENTORY_RULE), basis: basRevisionBasisSchema,
  capabilities: z.array(z.object({ capture_id: sha, heads: basRevisionHeadsSchema,
    selection_status: z.enum(['current_selection', 'historical_selection']),
    dependency_status: z.object({ assembly: dependency, engineering: dependency, assigned: dependency, assembled: dependency }).strict(),
    text: z.enum(['retained', 'unavailable_legacy_capture']), points: z.literal('retained_discovered_matrices_only'),
    equipment: z.enum(['retained_discovered_tables_only', 'unavailable_legacy_capture']), component_rule: id.nullable(),
    narrative_discovery_complete: z.literal(false), narrative_interpretation_complete: z.literal(false),
  }).strict()).max(10000), items: z.array(basRevisionItemSchema).max(BAS_REVISION_ITEM_LIMIT),
  unresolved_references: z.array(z.object({ item_id: sha, reference,
    reason: z.enum(['not_in_selected_inventory', 'different_selected_event']) }).strict()),
  source_bytes: z.literal('not_verified'), calculation_verification: z.literal('saved_results_not_python_replayed'),
  semantic_comparison: z.literal('not_performed'), quantity_comparison: z.literal('not_performed'), approved: z.literal(false),
}).strict();
export type BasRevisionInventory = z.infer<typeof basRevisionInventorySchema>;
