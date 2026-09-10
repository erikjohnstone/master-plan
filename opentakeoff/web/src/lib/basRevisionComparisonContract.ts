/** Shared wire-only comparison contracts and response ownership, no arithmetic. */
import { z } from 'zod';
import { basRevisionBasisSchema } from './basRevisionBasisContract.ts';
import { basRevisionItemSchema } from './basRevisionInventoryContract.ts';
import { basPointListsSchema } from './basPointLists.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

export const BAS_REVISION_COMPARISON_RULE = 'bas_revision_comparison_1' as const;
export const BAS_REVISION_REPORT_BYTES = 64 * 1024 * 1024;
const sha = z.string().regex(/^[a-f0-9]{64}$/), reason = z.string().trim().min(1).max(4096), id = z.string().min(1).max(4096);
const decision = z.object({ item_id: sha, reason }).strict();
export const basRevisionComparisonRequestSchema = z.object({ before: basRevisionBasisSchema, after: basRevisionBasisSchema,
  matches: z.array(z.object({ before_item_id: sha, after_item_id: sha, reason }).strict()).max(100000),
  removed: z.array(decision).max(100000), added: z.array(decision).max(100000),
  membership_reviews: z.array(z.object({ before_item_id: sha, after_item_id: sha, metric_key: id, reason }).strict()).max(100000),
}).strict();
export type BasRevisionComparisonRequest = z.infer<typeof basRevisionComparisonRequestSchema>;
export function normalizeBasRevisionComparisonRequest(raw: unknown): BasRevisionComparisonRequest {
  const r = basRevisionComparisonRequestSchema.parse(raw);
  return { ...r, matches: [...r.matches].sort((a, b) => a.before_item_id.localeCompare(b.before_item_id)),
    removed: [...r.removed].sort((a, b) => a.item_id.localeCompare(b.item_id)), added: [...r.added].sort((a, b) => a.item_id.localeCompare(b.item_id)),
    membership_reviews: [...r.membership_reviews].sort((a, b) => canonicalBasJson(a).localeCompare(canonicalBasJson(b))) };
}
const count = z.number().int().nonnegative().safe();
export const basRevisionQuantityPairSchema = z.object({ row_id: sha, metric_key: id, dimension: id, basis: id, before: count, after: count }).strict();
export type BasRevisionQuantityPair = z.infer<typeof basRevisionQuantityPairSchema>;
export const basRevisionQuantityRequestSchema = z.object({ pairs: z.array(basRevisionQuantityPairSchema).max(1000),
  point_matrices: z.array(z.object({ capture_id: sha, matrix: basPointListsSchema.innerType().shape.matrices.element }).strict()).max(1000) }).strict();
export const basRevisionQuantityResultSchema = z.object({ schema_version: z.literal('bas_revision_quantities_v1'),
  rule_version: z.literal('comparable_declared_count_deltas_1'), engine: z.literal('bas_math_v1'),
  pairs: z.array(basRevisionQuantityPairSchema.extend({ delta: z.number().int().safe() }).strict()).max(1000),
  checked_point_matrices: z.array(z.object({ capture_id: sha, matrix_id: id }).strict()).max(1000),
  installed_quantity: z.null(), approved: z.literal(false), project_complete: z.literal(false),
}).strict();
/** Wire ownership only, never a second calculator or arithmetic verification. */
export function verifyBasRevisionQuantityResult(rawInput: unknown, rawOutput: unknown) {
  const input = basRevisionQuantityRequestSchema.parse(rawInput), output = basRevisionQuantityResultSchema.parse(rawOutput);
  const originals = output.pairs.map(({ delta: _delta, ...pair }) => pair);
  if (canonicalBasJson(originals) !== canonicalBasJson(input.pairs)
    || canonicalBasJson(output.checked_point_matrices) !== canonicalBasJson(input.point_matrices.map(p => ({ capture_id: p.capture_id, matrix_id: p.matrix.matrix_id })))) {
    throw new Error('Revision quantity response omitted or changed original pairs or point matrices');
  }
  return output;
}
const quantity = basRevisionItemSchema.shape.quantities.element;
const quantityStatus = z.enum(['not_a_quantity', 'unpaired', 'unknown_value', 'source_scope_unresolved', 'stale_dependency',
  'different_measure', 'different_rules', 'membership_review_required', 'ready_for_python', 'calculated']);
const value = z.object({ present: z.boolean(), json: z.string().nullable() }).strict();
export const basRevisionComparisonRowSchema = z.object({ row_id: sha,
  before: basRevisionItemSchema.nullable(), after: basRevisionItemSchema.nullable(),
  disposition: z.enum(['matched', 'added', 'removed', 'unresolved_before', 'unresolved_after', 'outside_before', 'outside_after']),
  correspondence: z.enum(['exact_bound_identity', 'explicit_decision', 'unresolved', 'outside_scope']), reason: reason.nullable(),
  source_identity: z.enum(['same_original_references', 'different_original_references', 'unavailable', 'unpaired']),
  retained_evidence: z.enum(['equal', 'changed', 'unavailable', 'unpaired']),
  declared_fields_equal: z.boolean().nullable(), rules_equal: z.boolean().nullable(),
  saved_output_equal: z.boolean().nullable(),
  field_changes: z.array(z.object({ field: id, before: value, after: value }).strict()),
  issues: z.array(id), quantities: z.array(z.object({ metric_key: id, before: quantity.nullable(), after: quantity.nullable(),
    status: quantityStatus, delta: z.number().int().safe().nullable(), membership_review_reason: reason.nullable() }).strict()),
}).strict();
export type BasRevisionComparisonRow = z.infer<typeof basRevisionComparisonRowSchema>;
export const basRevisionComparisonSchema = z.object({ schema_version: z.literal('bas_revision_comparison_v1'),
  rule_version: z.literal(BAS_REVISION_COMPARISON_RULE), request_fingerprint: sha,
  before: basRevisionBasisSchema, after: basRevisionBasisSchema,
  rows: z.array(basRevisionComparisonRowSchema).max(200000),
  interpretation_scope: z.literal('retained_sources_and_supported_declared_fields_only'),
  discovery_complete: z.literal(false), source_bytes: z.literal('not_verified'),
  calculation_verification: z.enum(['not_replayed', 'no_selected_saved_calculations', 'selected_records_python_replayed']),
  checked_saved_records: z.array(z.object({ kind: z.enum(['assignment', 'assembly', 'engineering']), record_id: sha }).strict()).max(30000),
  checked_point_matrices: z.array(z.object({ capture_id: sha, matrix_id: id }).strict()),
  arithmetic: z.enum(['not_run', 'completed']), approved: z.literal(false), installed_quantity: z.null(),
}).strict();
export type BasRevisionComparison = z.infer<typeof basRevisionComparisonSchema>;
export async function basRevisionReportFingerprint(raw: unknown) {
  const report = basRevisionComparisonSchema.parse(raw);
  if (report.arithmetic !== 'completed' || report.calculation_verification === 'not_replayed'
    || report.rows.some(r => r.quantities.some(q => q.status === 'ready_for_python')))
    throw new Error('A pending comparison cannot be recorded as a completed replay');
  return sha256Hex(new TextEncoder().encode(canonicalBasJson(report)));
}
